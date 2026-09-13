## Why

`components/slide-html-canvas.tsx` (added by `adopt-grapesjs-html-canvas-editor`, not yet archived) currently bundles GrapesJS lifecycle management, dirty-state tracking, and sanitize-on-serialize logic directly inside one presentational component with a fixed, minimal chrome: a bare canvas frame and an inline error line. It has no toolbar, no block/component palette, and no way to add a new element to a slide at all - an owner can only rearrange or restyle whatever HTML/CSS the slide already contains. `design-editor.tsx` and `slide-editor.tsx` each render the exact same fixed chrome even though the design editor (from-scratch authoring) and the feedback editor (direct in-place touch-ups alongside AI prompts) call for different levels of editing surface. Splitting the GrapesJS-owning logic into a reusable hook and building a real toolbar/block-panel chrome on top of it directly improves the editing UX (owners can now add components, undo/redo visibly, see save state) and lets each host compose only the chrome it needs.

## What Changes

- Extract a `useSlideHtmlCanvas` hook that owns the GrapesJS editor instance, container ref wiring, dirty-state, and sanitize-on-serialize logic, independent of any specific rendered chrome.
- Rebuild `SlideHtmlCanvas` as a composed view over that hook, adding: a visible toolbar (Undo, Redo, a persisted Save state indicator), a block/component palette panel so owners can add new elements (not just edit existing ones), and a layer list for selecting/reordering existing components - closing the current gap where nothing can be added to a slide through the canvas.
- Let each host (`design-editor.tsx`, `slide-editor.tsx`) opt into which chrome pieces render (e.g. the feedback editor may keep a lighter toolbar) via props on the rebuilt `SlideHtmlCanvas`, backed by the same hook.
- Keep the existing public contract owners already depend on: `{ html, css, disabled, onDirtyChange }` props and an imperative `serialize()` handle, so this is additive chrome, not a breaking API change for callers.

## Capabilities

### New Capabilities

- `slide-html-canvas-editor`: `openspec list --specs` shows no such capability yet in the main specs — the `adopt-grapesjs-html-canvas-editor` change that introduces it has not been archived. This delta therefore adds requirements under the same capability path (visible toolbar, block palette, layer list, host-configurable chrome) rather than modifying an existing main spec. Archive `adopt-grapesjs-html-canvas-editor` before (or together with) this change so the two deltas land on the capability in the right order.

## Impact

- Frontend only, in scope for this repo's frontend agent: `components/slide-html-canvas.tsx` (rebuilt on a new `hooks/use-slide-html-canvas.ts` or colocated hook module), `components/design-editor.tsx` and `components/slide-editor.tsx` (updated chrome props), and their tests.
- No backend/API/schema impact: the serialized `{ html, css }` shape and save/edit request contracts are unchanged.
- `Docs/CHANGELOG.md` gets an `[Unreleased]` entry for the new toolbar/block-panel/layer-list chrome.
