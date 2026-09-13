## Context

See [proposal.md](proposal.md) for the why. `components/slide-html-canvas.tsx` currently (from `adopt-grapesjs-html-canvas-editor`, not yet archived) is a single `forwardRef` component that, in one file:
- mounts/unmounts a GrapesJS `Editor` instance in a `useEffect` keyed to `[]` (mount-once), keeping it in a ref,
- resyncs `html`/`css` props into the editor in a second effect,
- tracks a `loadFailed` boolean and an `error` string in local state,
- exposes `serialize()` via `useImperativeHandle`, running `sanitizeSlideHtml`/`sanitizeSlideCss` (imported directly from `modules/slides/domain/structured/sanitize.ts`) before returning `{ html, css }` or `null`.

`design-editor.tsx` and `slide-editor.tsx` each hold a `useRef<SlideHtmlCanvasHandle>`, pass it to `<SlideHtmlCanvas>`, and call `.serialize()` from their own save/edit flows. Both currently render the exact same bare canvas frame - no toolbar, no way to add a new component, no layer list.

## Goals / Non-Goals

**Goals:**
- Move all GrapesJS-instance-owning logic into a `useSlideHtmlCanvas` hook with no rendering opinion, so it can back more than one visual composition.
- Rebuild `SlideHtmlCanvas` as a chrome (toolbar + block palette + layer list + canvas frame) that consumes the hook, closing the current "can't add a new element" gap.
- Let a host disable individual chrome pieces via props, backed by the same hook and the same `{ html, css, disabled, onDirtyChange }` prop contract and `serialize()` imperative handle already in use, so `design-editor.tsx`/`slide-editor.tsx` need only prop changes, not a rewrite of their save/edit flows.

**Non-Goals:**
- No change to the save/edit/generate API contracts, the `{ html, css }` wire shape, or backend behavior - this is chrome around an unchanged serialization contract.
- No GrapesJS style-manager (font/color property panel) in this pass - the toolbar/palette/layer-list trio is the scoped chrome improvement; a full property-inspector panel is a reasonable follow-up but not required to close the "can't add anything" gap this change targets.
- Not attempting drag/resize bounds-clamping (tracked separately in `adopt-grapesjs-html-canvas-editor`'s task 2.4) - this change's block palette must still place new components inside the existing canvas bounds, but that's a placement default, not the general drag-clamping gap.

## Decisions

**`useSlideHtmlCanvas(props)` returns the editor ref, dirty/error/loadFailed state, and the imperative `serialize`/`undo`/`redo` actions as plain values and functions - not a second context or class.**
The hook is called once, at the top of `SlideHtmlCanvas`; there is exactly one canvas mounted per host at a time (design editor's active slide, or the feedback editor's active slide), so a hook is sufficient and avoids introducing a Context provider for a value with a single consumer. `SlideCanvasProvider` (the Context-based option considered alongside this one) is deferred: it only pays for itself once some other part of the tree - unrelated to `SlideHtmlCanvas`'s own toolbar - needs to trigger canvas actions, which no current host needs.
- Alternative considered: a Context (`SlideCanvasProvider`) exposing `undo`/`redo`/`save` to arbitrary descendants. Rejected for now: both hosts already own a ref to the canvas and call its imperative methods directly; a Context adds a layer of indirection with no current consumer outside the chrome this change itself builds.

**Toolbar, block palette, and layer list are separate presentational subcomponents (`CanvasToolbar`, `CanvasBlockPalette`, `CanvasLayerList`) composed inside `SlideHtmlCanvas`, each gated by a boolean prop.**
This keeps `SlideHtmlCanvas`'s own JSX a straightforward composition rather than one large conditional block, and lets a future host reuse a single piece (e.g. just the layer list) without pulling in the rest.
- Alternative considered: one `chrome: "full" | "compact"` enum prop. Rejected: falls apart as soon as a host wants an in-between mix (e.g. toolbar + layer list but no palette), which is a real difference between the design editor's from-scratch authoring and the feedback editor's direct-touch-ups use.

**Block palette content stays a fixed, small, curated set (text block, heading, image placeholder, container/row) defined in this component, not GrapesJS's full default block set.**
GrapesJS ships a generic default block set (webpage-building blocks like forms, maps, countdown) that don't fit "components inside a fixed 960x540 slide." A curated list keeps the palette meaningful for slide authoring and keeps every offered block already representable in the existing sanitization allow-list (`modules/slides/domain/structured/sanitize.ts`'s `ALLOWED_TAGS`/`ALLOWED_ATTRIBUTES`), satisfying this change's "palette respects content-safety rules" requirement by construction rather than by runtime filtering.
- Alternative considered: exposing GrapesJS's built-in default blocks unfiltered. Rejected: several default blocks (forms, external map embeds) are meaningless for a slide and some rely on tags/attributes outside the sanitizer's allow-list, which would mean either loosening the sanitizer or shipping a palette that can produce content the canvas then rejects on save - a confusing UX.

**Undo/redo in the toolbar drives GrapesJS's own `UndoManager`, not a new state stack.**
`adopt-grapesjs-html-canvas-editor`'s design.md already decided GrapesJS's built-in undo manager replaces the old client-side `history` stack for in-progress edits. This change only makes that already-present capability visible and clickable; it does not add new undo/redo state.

## Risks / Trade-offs

- [A curated block palette may feel limited compared to a full page-builder's block set] → Deliberately scoped to slide-appropriate components for this pass; expanding the curated list is a low-risk follow-up once real usage shows what's missing, since the palette is a static list in one file.
- [Splitting one component into a hook + three subcomponents is more files to navigate] → Offset by each piece being independently testable and reusable; the previous single-file component already mixed at least three concerns (instance lifecycle, dirty tracking, serialization) that this design just gives names to.
- [Every existing `SlideHtmlCanvas` caller must be revisited to pass explicit chrome props] → Both current callers (`design-editor.tsx`, `slide-editor.tsx`) are in this repo and in this change's task list; no other consumers exist yet.
