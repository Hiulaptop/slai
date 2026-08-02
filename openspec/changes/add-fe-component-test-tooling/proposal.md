## Why

`vitest.config.ts` has no DOM test environment configured (defaults to Node), and there's no `jsdom`/`happy-dom` or `@testing-library/react` devDependency in `package.json`. Both files are outside the frontend agent's editable scope per `CLAUDE.md`, so component-level tests (rendering a component, simulating a click/typed input, asserting on the resulting DOM) can't be written for any frontend UI without a root-owner change. This was surfaced while scoping the frontend implementation roadmap (design-system foundation, then auth UI, then the slide-generation workflow UI) — all of which will have non-trivial React components worth testing beyond the plain-TypeScript unit tests the frontend agent can already write today.

## What Changes

- Add `jsdom` (or `happy-dom`) and `@testing-library/react` (plus `@testing-library/jest-dom` if desired for matcher ergonomics) as devDependencies in `package.json`.
- Configure a DOM test environment in `vitest.config.ts` — either globally (`test.environment: "jsdom"`) or scoped to `app/**` via per-file `// @vitest-environment jsdom` pragmas, whichever fits the project's preference for keeping the existing Node-environment backend tests fast.

## Capabilities

### New Capabilities

None — this is tooling/config, not a product capability.

### Modified Capabilities

None.

## Impact

- Unblocks component-level tests for upcoming frontend work: the design-system primitives, auth forms (register/login), and the slide-generation workflow UI (upload → outline review → generate → view/edit/undo → dashboard) — all already scoped in the frontend roadmap.
- Until this lands, frontend logic worth unit-testing (e.g. a token-refresh mutex, outline renumbering, slide-HTML splitting) has to be written as plain, framework-free `.ts` modules that vitest's current Node environment can already run — that pattern still works and isn't blocked, but React component behavior itself can't be asserted on.
- No changes to `app/**`, `modules/**`, or any runtime/production code — devDependencies and test config only.
