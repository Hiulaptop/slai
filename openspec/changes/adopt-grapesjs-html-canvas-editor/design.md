## Context

See [proposal.md](proposal.md) for the why. Two frontend components currently exist and both need to become GrapesJS-backed:

- `components/design-canvas.tsx` + `components/design-editor.tsx`: pointer-based move/resize canvas over a typed `ElementNode[]` per slide, with a properties panel per element type (`design-editor.tsx:449`), rendered through `elementRegistry.render` (`design-canvas.tsx:261`) and saved via `PATCH /api/slides/design/save` using `toWireSlides(slides)` (`design-editor.tsx:241`).
- `components/slide-editor.tsx`: no canvas — renders a sandboxed `<iframe srcDoc={renderStructuredRevision(...)}>` (`slide-editor.tsx:204`) and only accepts free-text per-slide feedback batched to `PATCH /api/slides/edit`.

Both save paths currently round-trip through the structured element-graph domain model (`modules/slides/domain/structured/**`, out of this repo's frontend scope). This design only covers the frontend GrapesJS integration and the shape of the new save contract it needs; the backend/domain rework itself (Prisma schema, structured-graph removal, renderer, generation/edit prompts) is a separate implementation effort for a backend engineer, tracked by the `structured-slide-document` and `slide-generation-workflow` deltas in this change.

## Goals / Non-Goals

**Goals:**
- One shared React component wraps the GrapesJS editor instance and is used by both `design-editor.tsx` (replacing `DesignCanvas`) and `slide-editor.tsx` (replacing the iframe preview).
- The component's public contract is "load this slide's HTML/CSS, let the user edit it, give me back sanitized HTML/CSS on save" — it does not know about `ElementNode`, the element registry, or the animation registry.
- Existing per-slide undo, save-conflict (409), and load/error recovery UX patterns are preserved using the new HTML content type.

**Non-Goals:**
- Backend persistence, API route, Prisma schema, and generation-prompt changes are not implemented as part of this frontend change; they are specified as deltas for a backend engineer.
- Reimplementing the removed shape/table drawing tools or entrance-animation authoring as GrapesJS blocks/plugins is not designed here — the proposal's Impact section calls this out as a follow-up, not something silently dropped in scope without notice.
- Real-time collaborative editing of the same slide by multiple users is out of scope (matches current single-editor-at-a-time behavior).

## Decisions

**GrapesJS integration approach: a thin controlled wrapper component, not `grapesjs-react` or similar.**
GrapesJS mutates the DOM it's given directly and exposes an imperative API (`editor.setComponents(html)`, `editor.getHtml()`/`getCss()`), which doesn't map cleanly onto React's declarative render cycle. The wrapper mounts one GrapesJS instance per slide-editing session in a `useEffect`, keeps the instance alive across re-renders via a ref, and only calls back into React (`onDirtyChange`, `onSaveableHtmlChange`) from GrapesJS's own change events — mirroring the existing "imperative writes during a gesture, commit once" pattern already used for font-size/color dragging in `design-editor.tsx:508`'s `writeLiveStyleVar`, rather than introducing a second, conflicting state-sync pattern.
- Alternative considered: a community React wrapper package. Rejected to avoid an extra dependency with its own version-compatibility surface against a pinned GrapesJS version, and because the imperative-bridge pattern this codebase already uses is a better fit than trusting a wrapper's own effect timing.

**One shared canvas component, `SlideHtmlCanvas`, used by both editors.**
`design-editor.tsx` and `slide-editor.tsx` need the same load-edit-save loop; only their surrounding chrome (properties panel + tool list vs. feedback textarea) differs. A single component avoids two GrapesJS configurations drifting apart.
- Alternative considered: keep `slide-editor.tsx`'s iframe preview and add GrapesJS only to the design editor. Rejected per the confirmed scope decision that both flows become directly editable.

**GrapesJS holds HTML/CSS, not `ElementNode[]`; conversion happens once, at the API boundary.**
The wrapper's props/callbacks are plain `{ html: string; css: string }` in and out. `design-editor.tsx` and `slide-editor.tsx` no longer construct or mutate `ElementNode`s; they pass the slide's HTML/CSS straight from the (new) API response into the canvas and straight from the canvas back into the save/edit request body.
- Alternative considered: keep `ElementNode[]` as an intermediate in-memory model and convert to/from GrapesJS's component JSON on every load/save. Rejected — this reintroduces exactly the lossy, ever-growing type-mapping problem the proposal is trying to remove, and only makes sense if the backend keeps the structured graph as its source of truth, which the confirmed scope decision rules out.

**Content-safety sanitization happens on both sides.**
The frontend runs GrapesJS's export through the existing `sanitize-html` dependency (already used server-side per `package.json`) before submitting a save, so obviously unsafe edits (a pasted `<script>`, an `onclick` attribute) are caught and surfaced immediately in the canvas rather than round-tripping to the server first. The server remains the authoritative sanitizer per the `structured-slide-document` delta's "Deterministic assembly on demand" requirement — the frontend check is a UX improvement, not a trust boundary.

**Undo stays a server-side per-slide revision action; the frontend does not add a second client-side undo stack for canvas edits.**
`design-editor.tsx` currently keeps a client-side `history` stack (`MAX_HISTORY`) *in addition to* server-side revisions, used for the pointer-canvas's move/resize gestures. GrapesJS has its own internal undo manager (Ctrl+Z within the editing session) for in-progress edits; the existing server-side "Undo slide" button continues to call `POST /api/slides/{id}/undo` for committed revisions. The client-side `history`/`MAX_HISTORY` stack in `design-editor.tsx` is removed as redundant with GrapesJS's own undo manager.

## Risks / Trade-offs

- [Losing shape/table/animation authoring on migration] → Called out explicitly in the proposal's Impact section rather than silently dropped; reintroducing them as GrapesJS blocks is left as explicit future work, not assumed to be equivalent.
- [GrapesJS's free-form HTML is a larger sanitization surface than the previous typed-element props] → Mitigated by running the same `sanitize-html` policy on both the frontend (fast feedback) and backend (authoritative), matching the existing defense-in-depth pattern already used for AI-generated content.
- [This design's frontend pieces cannot be fully implemented or verified until the backend HTML-based contract exists] → The `tasks.md` breakdown sequences frontend GrapesJS work behind the backend contract becoming available, rather than building against a guessed shape.

## Open Questions

- Exact GrapesJS plugin set (forms/table/style-manager presets) is left to implementation-time evaluation against the current toolset (`text`, `rectangle`, `ellipse`, `line`, `image`, `table`) — does not change this design's component boundary or the specs.
