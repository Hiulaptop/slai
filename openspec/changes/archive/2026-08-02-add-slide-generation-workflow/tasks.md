## 1. Data Model and AI Contracts

- [x] 1.1 Extend the Prisma schema with approved outline/current revision fields, `SlideRevision`, revision operation enum, relations, and indexes.
- [x] 1.2 Generate and verify a forward MySQL migration for the slide revision model.
- [x] 1.3 Add optional normalized `responseFormat` support to `AIRequest` and map JSON mode in both OpenAI and Gemini adapters with tests.
- [x] 1.4 Define the provider-neutral AI generation port and server-only environment-driven CLIProxy composition root.
- [x] 1.5 Document required CLIProxy provider, base URL, API key, and slide model environment variables.

## 2. Slide Domain and Content Safety

- [x] 2.1 Add strict outline, batch edit request/response, route parameter, and persisted presentation schemas with bounded lengths, unique edit slide numbers, and contiguous outline numbering validation.
- [x] 2.2 Add centralized outline, generation, and batch-edit system prompt builders containing the exact JSON/HTML contracts and untrusted-file rules.
- [x] 2.3 Add multipart file validation and conversion to existing base64 AI file parts with supported MIME types and 10 MiB limits.
- [x] 2.4 Add JSON model-output extraction that handles optional code fences and rejects malformed or schema-invalid outlines.
- [x] 2.5 Install an HTML parser/sanitizer and implement complete-document plus individual replacement-wrapper validation for the `slai-slide` contract and 5 MiB presentation limit.
- [x] 2.6 Implement parser-based multi-slide extraction/replacement that applies a validated batch atomically and verifies non-target slides remain unchanged.

## 3. Persistence and Application Services

- [x] 3.1 Implement Prisma generation lifecycle persistence for owned `PROCESSING`, `COMPLETED`, and `FAILED` records without raw file data.
- [x] 3.2 Implement atomic initial revision creation and current HTML/revision pointer updates.
- [x] 3.3 Implement compare-and-swap batch edit revision creation with monotonic revision allocation, JSON edit metadata, and no orphan revisions.
- [x] 3.4 Implement compare-and-swap undo that restores the parent snapshot without deleting history.
- [x] 3.5 Implement the outline suggestion service using JSON mode, report upload, centralized prompt, and strict output validation.
- [x] 3.6 Implement the approved-outline generation service using report/template files, HTML validation/sanitization, metadata storage, and failure handling.
- [x] 3.7 Implement batch slide editing using the current presentation, selected slides, corresponding approved outline items/prompts, exact replacement-set validation, safe atomic replacements, and one edit revision.
- [x] 3.8 Implement undo and owned presentation response mapping with stable not-found/conflict/provider error types.

## 4. Authenticated HTTP Routes

- [x] 4.1 Add shared slide route helpers for bearer authentication, multipart/JSON parsing, request cancellation, and stable error responses.
- [x] 4.2 Implement authenticated `POST /api/slides/outline`.
- [x] 4.3 Implement authenticated `POST /api/slides/generate`.
- [x] 4.4 Implement owned `PATCH /api/slides/edit` with `generationId` and an `edits` JSON array.
- [x] 4.5 Implement owned `POST /api/slides/{generationId}/undo`.

## 5. Verification

- [x] 5.1 Add domain tests for outline numbering, batch edit uniqueness, prompt contracts, upload limits, JSON extraction, HTML sanitization, replacement-set validation, atomic replacement, and non-target preservation.
- [x] 5.2 Add adapter/composition tests for JSON response mode and non-sensitive configuration failures.
- [x] 5.3 Add repository tests for generation lifecycle, revision branching, edit/undo compare-and-swap races, and ownership filtering.
- [x] 5.4 Add service tests for outline, generation success/failure, single- and multi-slide edit batches, all-or-nothing invalid model output, repeated undo, and edit after undo.
- [x] 5.5 Add route tests for authentication, multipart validation, success payloads, ownership concealment, status mapping, and provider cancellation.
- [x] 5.6 Run Prisma format/generate/validate, migration SQL verification, TypeScript, lint, the complete test suite, strict OpenSpec validation, and a production build with valid environment configuration.
