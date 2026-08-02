## Context

The application already has OpenAI- and Gemini-compatible CLIProxy adapters that accept text and base64 file content, a bearer authentication guard, a shared Prisma client, and a `SlideGeneration` model with request/response metadata and `LONGTEXT` HTML storage. It does not yet compose an adapter from environment configuration, define presentation output contracts, expose slide routes, or preserve HTML versions.

The workflow has two human/AI phases. First, the model reads a report and proposes a reviewable outline. After the user approves or changes that outline, the model receives the report, a visual template, and the approved outline to generate HTML. Later edits may target one or more numbered slides in one request, must preserve the rest of the document byte-for-byte where practical, and must remain undoable as one atomic batch.

## Goals / Non-Goals

**Goals:**

- Provide authenticated routes for outline suggestion, presentation generation, batch slide editing, and undo.
- Keep routes provider-agnostic through an application AI generation port and one environment-driven CLIProxy composition root.
- Centralize explicit system prompts for strict outline JSON, complete presentation HTML, and batch replacement HTML.
- Validate model output before persistence and reject malformed output rather than repairing it ambiguously.
- Make generated presentations user-owned and persist approved outlines, current HTML, generation metadata, and immutable revisions.
- Support repeated undo and editing after undo without deleting revision history.

**Non-Goals:**

- Build the review/editor UI, template catalog, presentation renderer, export to PPTX/PDF, or real-time streaming responses.
- Support collaborative editing, redo, arbitrary HTML editing, slide reordering, or changing the approved outline during edit.
- Store original uploaded report/template binaries in MySQL or object storage.
- Add background jobs, queues, webhooks, provider failover, or provider selection per request.
- Guarantee that an LLM reproduces a template pixel-for-pixel.

## Decisions

### Expose four authenticated synchronous routes

- `POST /api/slides/outline` accepts multipart field `report` and returns a validated outline JSON object.
- `POST /api/slides/generate` accepts multipart fields `report`, `template`, and `outline` (JSON text), creates a generation record, calls the LLM, validates HTML, stores revision 1, and returns the presentation.
- `PATCH /api/slides/edit` accepts JSON `{ "generationId": "...", "edits": [{ "slideNumber": 2, "prompt": "..." }] }`, asks the LLM for one replacement wrapper per requested slide, applies all replacements atomically, appends one revision for the batch, and returns the updated presentation.
- `POST /api/slides/{generationId}/undo` moves the current revision pointer to its parent and returns the restored presentation.

All routes require bearer authentication and enforce `SlideGeneration.userId` ownership. Synchronous calls are selected for the first implementation because the current adapters already expose request/response generation and no queue infrastructure exists. Routes pass `request.signal` to abort upstream work after client cancellation.

### Define one strict outline contract

The outline response and approved-outline input use:

```json
{
  "title": "Presentation title",
  "slides": [
    {
      "number": 1,
      "title": "Slide title",
      "summary": "What this slide must communicate"
    }
  ]
}
```

The Zod schema is strict, allows 1 through 50 slides, requires contiguous one-based numbers, bounds title/summary lengths, and rejects extra keys. The outline route requests JSON mode from the adapter, strips an optional Markdown code fence, parses JSON, and validates it. Invalid model output produces a `502` response; it is not returned to the client as if valid.

### Extend the AI request contract and add a provider-neutral port

Add optional `responseFormat` to `AIRequest`, using the already-defined `text | json_object` schema. OpenAI maps JSON mode to `response_format: { type: "json_object" }`; Gemini maps it to `generationConfig.responseMimeType: "application/json"`. Existing callers default to text.

Define an application port with the existing normalized `generate` signature. A server-only composition root reads `CLIPROXY_PROVIDER` (`openai` or `gemini`), `CLIPROXY_BASE_URL`, `CLIPROXY_API_KEY`, and `SLIDE_MODEL_ID`, validates them once, and constructs the matching adapter. Routes depend on the slide service, never provider classes.

### Treat uploads as bounded source material

Convert multipart `File` values to existing base64 AI file parts. Each file must be non-empty and no larger than 10 MiB. Reports accept PDF, plain text, Markdown, DOCX, and common OpenDocument text MIME types. Templates accept HTML, PDF, and PNG/JPEG/WebP images. Outline requires only `report`; generation requires both files.

Original binaries and base64 are not persisted. `requestPayload` stores only filenames, MIME types, byte sizes, approved outline, and operation parameters. The system prompt explicitly treats uploaded content as untrusted source data and tells the model to ignore instructions embedded inside files.

### Centralize three system prompt builders

Prompts live in the slide domain/application module rather than route files:

- Outline prompt: output JSON only; derive factual slide titles and summaries from the report; do not invent unsupported claims; use contiguous numbering.
- Generation prompt: output one complete HTML5 document only; follow the approved outline exactly; preserve the template's typography, spacing, colors, hierarchy, and reusable visual patterns while taking factual content only from the report.
- Edit prompt: output a JSON object containing exactly one replacement HTML wrapper per requested slide; obey each corresponding user instruction while preserving the approved outline intent and the presentation's established visual language.

All prompts prohibit Markdown fences and external scripts. Prompt text includes the normative HTML/JSON contracts so provider behavior is consistent and unit-testable.

### Enforce a stable HTML slide contract

Generated output must be a complete HTML5 document with `<html>`, `<head>`, and `<body>`. Every slide is represented by exactly one non-nested wrapper:

```html
<div class="slai-slide" data-slide-number="1">...</div>
```

Wrapper numbers must be unique, contiguous, one-based, and equal the approved outline length. No content representing a slide may exist outside these wrappers. The edit response must be JSON in this form and must not contain a full document:

```json
{
  "slides": [
    {
      "slideNumber": 2,
      "html": "<div class=\"slai-slide\" data-slide-number=\"2\">...</div>"
    }
  ]
}
```

The response must contain exactly the unique slide numbers requested, with no missing or additional replacements. Each HTML value must contain exactly one wrapper matching its `slideNumber`.

Use an HTML parser for structural validation and selected-node replacement, not regular expressions. Sanitize model HTML before final validation and persistence by removing scripts, inline event handlers, dangerous URL schemes, forms, embeds, and iframe/object content while retaining document structure, classes, data attributes, semantic HTML, inline styles, `<style>`, and safe image/data URLs needed for templates. Future rendering remains sandboxed because sanitization is defense in depth, not a browser isolation replacement.

### Persist current state and immutable revision nodes

Extend `SlideGeneration` with `approvedOutline Json?`, `currentRevisionNumber Int?`, and `nextRevisionNumber Int @default(1)`. Add `SlideRevision` with generation ID, unique monotonically allocated revision number, nullable parent revision number, operation (`GENERATE` or `EDIT`), optional JSON edit request metadata, full HTML snapshot, and timestamp.

Generation completion atomically inserts revision 1, stores the same HTML in `SlideGeneration.htmlContent`, sets current revision to 1 and next revision to 2, and marks the generation complete. An edit allocates `nextRevisionNumber`, creates a revision whose parent is the current revision, updates current HTML/pointer, and increments the allocator in one transaction.

Undo loads the current revision's parent. If present, it atomically updates `SlideGeneration.htmlContent` and the current pointer to the parent snapshot without deleting any revision. A new edit after undo creates a branch with a fresh monotonically increasing revision number and parent equal to the restored revision. Redo and branch navigation are not exposed.

### Apply batch edits atomically and preserve non-target slides

The edit service validates the entire request before calling the provider. `edits` contains 1 through 50 strict items with a unique positive `slideNumber` and a `prompt` from 1 through 2,000 characters. Every number must exist in the current presentation. The service extracts all selected wrappers and supplies the current full document, selected wrappers, corresponding approved outline items, and per-slide instructions to one edit prompt.

After parsing JSON mode output and validating/sanitizing each replacement wrapper, the server replaces only the selected nodes in slide-number order. It verifies all non-target wrappers remain unchanged before storing one revision for the complete batch. Duplicate or nonexistent slide numbers return `400`; malformed, missing, or extra model replacements return `502`; if any edit fails, none are applied. A concurrent stale update returns `409` and does not create an orphan revision.

### Track generation lifecycle and provider metadata

`POST /generate` creates `SlideGeneration` as `PROCESSING` before calling the provider. On success it stores provider/model, sanitized response metadata, finish reason, token usage, approved outline, HTML, and completion timestamps. On provider or validation failure it marks the row `FAILED` with a stable error code/message and returns `502`.

Outline suggestions are not persisted because they are provisional and the client may alter them. The approved outline is persisted only when generation begins. Raw report/template data and raw failed model output are not logged or stored.

## Risks / Trade-offs

- [Synchronous LLM requests may exceed platform timeouts] -> Keep the initial routes simple, enforce file/output limits, propagate cancellation, and move to a queue only when operational data requires it.
- [Models may return malformed JSON or HTML] -> Use JSON mode where supported, explicit prompts, strict parsing, sanitization, and atomic `502` failures without partial batch persistence.
- [HTML sanitization may alter a complex template] -> Document supported HTML/CSS, preserve safe style constructs, and reject unsupported active content rather than executing it.
- [Stored full snapshots consume more database space] -> Full HTML snapshots make undo reliable and simple; enforce a 5 MiB sanitized HTML limit and add retention/compaction only if usage justifies it.
- [Prompt injection may be embedded in uploaded files] -> Label files as untrusted data in higher-priority system prompts, validate all output, and never grant the model tools or secrets.
- [Concurrent edits/undo can overwrite work] -> Use current-revision compare-and-swap transactions and return `409` on stale state.
- [Provider output may not visually match the template exactly] -> Require reuse of the template's design language and validate structure; pixel-level reproduction is explicitly not guaranteed.

## Migration Plan

1. Extend Prisma schema with outline/revision state and add a forward migration.
2. Extend AI request/adapters with JSON response mode and add environment configuration examples.
3. Add slide schemas, prompts, HTML/file utilities, application port/service, and Prisma repository.
4. Add authenticated route handlers and route/service tests.
5. Run migrations, Prisma generation/validation, TypeScript, lint, tests, and a production build.

Rollback removes routes and code, then applies a forward migration that drops revision fields/table only after exported HTML has been preserved if needed. Existing `SlideGeneration.htmlContent` remains the canonical current snapshot throughout rollout.

## Open Questions

None.
