## 1. Headless hook

- [x] 1.1 Extract `useSlideHtmlCanvas({ html, css, disabled, onDirtyChange })` from `components/slide-html-canvas.tsx`, owning the container ref, GrapesJS instance lifecycle (mount-once effect + prop-resync effect), `loadFailed`/`error` state, and returning `{ containerRef, editor, loadFailed, error, serialize, undo, redo, canUndo, canRedo }`, verified by a new `hooks/use-slide-html-canvas.test.ts` covering mount, prop resync, and teardown with a mocked `grapesjs` module (mirroring the existing mocking approach in `slide-html-canvas.test.tsx`).
- [x] 1.2 Move the sanitize-on-serialize logic (`sanitizeSlideHtml`/`sanitizeSlideCss` from `modules/slides/domain/structured/sanitize.ts`) into the hook's `serialize()`, preserving the existing "returns null and sets an inline error" contract, verified by the hook test asserting a save is blocked with an error message for unsafe html/css.
- [x] 1.3 Expose `undo()`/`redo()`/`canUndo`/`canRedo` backed by GrapesJS's own `UndoManager` (`editor.UndoManager`), verified by a test asserting `canUndo` becomes true after an edit and `undo()` reverts it.

## 2. Chrome subcomponents

- [x] 2.1 Build `components/canvas-toolbar.tsx` (`CanvasToolbar`): Undo/Redo buttons wired to the hook's `undo`/`redo`/`canUndo`/`canRedo`, plus a save-state indicator driven by a `saveState: "idle" | "dirty" | "saving" | "saved"` prop, verified by `components/canvas-toolbar.test.tsx` covering enabled/disabled undo/redo and each save-state label.
- [x] 2.2 Build `components/canvas-block-palette.tsx` (`CanvasBlockPalette`): a curated, fixed block list (text block, heading, image placeholder, container/row) that adds a component to the canvas on activation, using only tags/attributes already in `modules/slides/domain/structured/sanitize.ts`'s allow-list, verified by `components/canvas-block-palette.test.tsx` asserting each block addition marks the canvas dirty and produces sanitizer-safe output.
- [x] 2.3 Build `components/canvas-layer-list.tsx` (`CanvasLayerList`): lists the current slide's top-level components from the GrapesJS component tree, supports selecting one (highlights it on the canvas) and reordering via up/down controls, verified by `components/canvas-layer-list.test.tsx` asserting the list reflects an add/remove/reorder without a reload.
- [x] 2.4 Constrain block-palette-added components to the existing 960x540 canvas bounds by default placement (not general drag-clamping, which remains tracked in `adopt-grapesjs-html-canvas-editor`'s task 2.4), verified by a test asserting a newly added block's initial position/size stays within bounds.

## 3. Rebuilt SlideHtmlCanvas

- [x] 3.1 Rebuild `components/slide-html-canvas.tsx` to consume `useSlideHtmlCanvas` and compose `CanvasToolbar`/`CanvasBlockPalette`/`CanvasLayerList` around the canvas frame, each gated by a `chrome?: { toolbar?: boolean; blockPalette?: boolean; layerList?: boolean }` prop (default: all `true`), preserving the existing `{ html, css, disabled, onDirtyChange }` props and `serialize()` imperative handle unchanged, verified by `components/slide-html-canvas.test.tsx` updated to cover default (full) chrome and an all-`false` reduced-chrome render.
- [x] 3.2 Confirm the existing load-failure and save-error states (from `adopt-grapesjs-html-canvas-editor`'s "Canvas recovers from load and save failures" requirement) still render correctly with the new chrome composed around them, verified by the updated test suite's load-failure and unsafe-content-save tests passing unchanged in behavior.

## 4. Host integration

- [x] 4.1 Update `components/design-editor.tsx` to render `SlideHtmlCanvas` with full chrome (toolbar, block palette, layer list) and pass its own save state into the toolbar's save-state indicator, verified by `components/design-editor.test.tsx` asserting the toolbar/palette/layer-list render and a block addition is saveable.
- [x] 4.2 Update `components/slide-editor.tsx` to render `SlideHtmlCanvas` with a reduced chrome (owner's choice: e.g. toolbar + layer list, no block palette, per this component's more touch-up-oriented use), verified by `components/slide-editor.test.tsx` asserting the omitted chrome piece does not render while direct editing and per-slide feedback submission still work.

## 5. Cleanup and docs

- [x] 5.1 Remove any now-dead code paths in the pre-existing `slide-html-canvas.tsx` that moved into the hook or subcomponents, verified by `tsc --noEmit` and `pnpm lint` passing with no unused-import/dead-code warnings.
- [x] 5.2 Add a `Docs/CHANGELOG.md` entry under `[Unreleased]` describing the new toolbar/block-palette/layer-list chrome and the `useSlideHtmlCanvas` extraction.

## 6. Verification

- [x] 6.1 Run `pnpm test`, `pnpm lint`, and `pnpm typecheck` and confirm all pass with the new hook, subcomponents, and updated hosts. All 276 tests pass, lint clean, `tsc --noEmit` clean (run via `npx pnpm`, no global `pnpm` in this environment).
- [ ] 6.2 Manually exercise both editors against a running dev server: add a block from the palette, reorder via the layer list, undo/redo, and confirm a save persists and reloads correctly in both the design editor and the feedback editor.
