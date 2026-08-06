## Context

SLAI today has two related authoring surfaces: a report-driven create workspace (`/slides/new`) that produces AI-generated decks, and a protected presentation editor that supports per-slide text feedback, undo, and Download HTML. Template packages already define skeleton layouts, CSS, and embeddable assets. There is no path to open Create, pick template or blank, design slides with drawing tools, and export HTML without going through outline/generation.

The product flow for this change is:

```text
Create button → Choose template or blank project → Visual design editor → Drawing/design tools → Export/download HTML
```

Constraints that remain: bearer auth and owner-only access, sanitized standalone HTML with `.slai-slide[data-slide-number]` wrappers, immutable revisions, in-memory access tokens, and no script execution from untrusted content in the app chrome. Existing AI generation and feedback-edit flows stay available as a parallel path.

## Goals / Non-Goals

**Goals:**

- Add a design-first create path: Create → template or blank → editor.
- Bootstrap a completed presentation from blank defaults or an owned template without calling the AI provider.
- Provide a visual canvas with design tools (select, text, shapes, image place, arrange, slide add/remove/reorder) that keep the HTML contract valid.
- Persist design saves as owner revisions with concurrency safety.
- Export/download the current deck as a standalone navigable `.html` file.
- Link design-mode presentations from the home library into the design editor.

**Non-Goals:**

- Replace the report/outline AI generation workspace.
- Full Figma-class collaboration, real-time multiplayer, comments, or version comparison UI.
- Arbitrary unrestricted HTML/script authoring.
- Pixel-perfect PowerPoint import/export or PDF export in this change.
- Offline-first PWA storage of unsaved canvas state on the server.

## Decisions

### Split Create into path chooser, then mode-specific workspaces

`/slides/new` becomes a path chooser (or first step) with at least:

1. **Design from template or blank** — design-first path (this change).
2. **Generate from report** — existing multi-phase AI workspace (unchanged behavior).

Choosing design opens a short project setup: title, template-or-blank, optional initial slide count for blank. On confirm, the client calls a bootstrap API and navigates to the design editor for the new `generationId`.

**Alternatives:** Reuse only the AI form and bolt on tools — rejected because report/outline are mandatory today and conflict with blank start. Separate top-level route without Create — rejected; product flow starts at Create.

### Bootstrap presentations without the AI provider

Add `POST /api/slides/design/bootstrap` (name exact in implementation) that accepts:

```text
title: string
mode: "blank" | "template"
templateId?: uuid (required when mode=template)
slideCount?: positive integer (blank only; default 1)
```

Server behavior:

- **Blank:** Build a minimal sanitized HTML document with N empty `.slai-slide` wrappers, default CSS (fixed slide aspect, full-bleed, no overflow), and no external assets. Status `COMPLETED`, initial `GENERATE` or new `DESIGN` revision operation with empty/minimal outline metadata.
- **Template:** Resolve owned template (or public-duplicate already owned), read skeleton + assets, seed one or more slides from allowed archetypes with empty/placeholder slots, embed assets server-side, sanitize, persist as completed. Same ownership rules as generation template use.

No outline suggestion and no model call. List/detail/delete/export work unchanged for the new rows.

**Alternatives:** Client-only blank HTML until first save — rejected; library and ownership need a server ID immediately. Reuse `POST /api/slides/generate` with empty report — rejected; generation contracts and provider coupling are wrong for blank design.

### Design editor as a distinct mode on the presentation route

Use `/slides/[generationId]/design` (or a mode query/flag on the existing editor) with:

- Canvas viewport for the selected slide (editable DOM/CSS under sanitization rules).
- Tool palette: select/move/resize, text, rectangle, ellipse, line, image upload/place, bring forward/send back, delete.
- Slide strip: add, delete (min one slide), reorder with contiguous renumbering.
- Save, Undo (prefer design undo stack + server revision undo where compatible), Download HTML.

Prefer editing a structured scene graph that serializes to HTML wrappers rather than freeform `contentEditable` of full documents. On save, serialize to complete HTML, client validates structure, server re-sanitizes, enforces HTML size limits, and appends a revision (`EDIT` or `DESIGN`) with compare-and-swap on current revision.

Keep the existing feedback editor available for AI-generated decks; design mode is for bootstrap design projects and any completed deck the product marks design-editable. If both modes open the same ID, design save and AI batch edit share the same revision pointer and conflict with `409` on stale revision.

**Alternatives:** Third-party full slide SDK only — optional later; first ship a thin internal canvas that owns the `.slai-slide` contract. iframe design with postMessage — possible isolation layer but heavier; use only if parent-document injection proves unsafe after sanitization.

### Tool and content safety model

Allowed design mutations produce only:

- Static HTML/CSS inside slide wrappers.
- Inline styles and classes from an allowlist.
- Images as data URLs after client size/type checks and server re-validation (same spirit as template assets).
- No scripts, event handlers, forms, remote URLs, or `javascript:` links.

Server sanitization remains the source of truth on every save and export. Download reuses `exportStandalonePresentation` so offline navigation does not depend on SLAI.

### Template selection for design start

Reuse owned-template list APIs. Design bootstrap with `templateId` requires ownership (same as generation). Public templates must be duplicated into the user's library first. Blank mode ignores `templateId`.

### Persistence and revision strategy

- Bootstrap creates presentation + initial revision in one transaction.
- Each Save writes full HTML snapshot revision; optional autosave is client-debounced and still full-snapshot (no partial CRDT).
- Local undo stack for unsaved tool actions; after save, server undo can restore prior revision HTML when parent exists.
- Request includes `expectedRevision` for CAS.

### Export/download

Download HTML remains owner-only, client-side from current detail HTML (or after flush of pending save). Filename from title; content is standalone export with nav controls. If unsaved local changes exist, prompt to save first or export current canvas serialization after a silent save attempt.

## Risks / Trade-offs

- [Visual editors can emit unsafe HTML] → Strict serialize allowlist + server sanitize; reject remote/script content with `400`/`502` without partial commit.
- [Large images bloat HTML] → Per-image and aggregate size limits; compress or reject over budget.
- [Template skeleton vs freeform design tension] → Template mode preserves required layout/slot markers where present; blank mode uses a minimal unrestricted-within-sanitize canvas; document which tools are disabled when skeleton locks apply.
- [Dual editor modes confuse users] → Clear entry labels (Design vs Generate from report); design bootstrap decks open design editor from library cards by default.
- [Revision size growth from frequent saves] → Debounce autosave; keep full snapshots for consistency with existing model; monitor storage.
- [AI edit vs design save races] → Shared CAS on revision; UI shows conflict and reloads detail.

## Migration Plan

1. Add bootstrap API, domain builders for blank and template-seeded HTML, tests.
2. Ship Create path chooser and design project setup UI.
3. Ship design editor canvas, tools, save, slide management.
4. Wire library cards for design-origin presentations to design editor; keep AI decks on feedback editor (or dual entry if product prefers).
5. Verify export/download, ownership isolation, sanitization, lint/typecheck/tests/build.

Rollback: hide path chooser design entry and bootstrap route; existing AI flow and feedback editor remain. Bootstrap rows stay valid completed presentations.

## Open Questions

- Exact revision operation enum label for design saves (`EDIT` vs new `DESIGN`) — prefer new `DESIGN` if analytics need separation; otherwise reuse `EDIT`.
- Whether AI-generated decks become design-editable in v1 — default yes for completed HTML that passes sanitize, with skeleton-lock rules when template metadata exists.
- Initial blank slide dimensions (e.g. 1920×1080) — default 16:9 presentation aspect fixed in blank CSS.
