## Context

See proposal.md - Why. Relevant current state:

- `modules/slides/domain/structured/elements/text.ts`'s `TextProps` already requires `fontSize: number` and `color: string` as plain typed fields with no format constraint beyond `z.number().positive().max(400)` / `z.string().min(1).max(64)`. This change does not touch that schema - it changes what a *caller* (AI, and later the editor) is allowed to author those two fields as, and adds a resolution step between authoring and persistence.
- `modules/slides/domain/structured/compose.ts`'s `flattenWireSlides` is already the single funnel every AI-authored (and future editor-authored) element tree passes through before `validateStructuredCommand`, and it already resolves one reference type this way: `validateAnimation()` calls `animationRegistry.resolve(...)`, throwing with the caller-supplied `errorCode` on an unknown key. This change adds a second resolution kind (Tailwind class → value) through the same funnel, same fail-closed shape.
- `components/design-canvas.tsx`'s `CanvasElement` already calls `elementRegistry.render(...)` synchronously on every render and spreads the returned style object directly onto the DOM node - there is no compile step in the live canvas today, because it has always rendered plain inline styles from React state. This matters for Goals/Non-Goals below: "don't compile on every slider drag" is already true today for the *existing* inline-style path; the design question this change adds is how the canvas stays visually correct once a compiled Tailwind class becomes the value that actually ships in generated/downloaded output.
- The project already runs Tailwind v4 (`tailwindcss` core + `@tailwindcss/postcss`, CSS-first config via `app/globals.css`'s `@import "tailwindcss"`, no `tailwind.config.js`). `@tailwindcss/cli` - the standalone CLI package needed to compile a stylesheet from arbitrary HTML content outside the Next.js build pipeline - is not currently installed.
- Tailwind's arbitrary-value syntax is ambiguous by default: `text-[90px]` and `text-[#ff0000]` both use the `text-` prefix, and Tailwind's own tooling disambiguates by inspecting whether the bracketed value looks like a length or a color. Tailwind also supports explicit type-hinted arbitrary values (`text-[length:90px]`, `text-[color:#ff0000]`) that remove that ambiguity. See the linked Tailwind CLI docs for the general compile model this design's render-time compile step follows.

## Goals / Non-Goals

**Goals:**
- Let AI-authored (and, later, editor-authored) text font-size and color be expressed as Tailwind utility classes from a bounded, developer-controlled whitelist, resolved to concrete values before anything is persisted.
- Produce a real compiled Tailwind stylesheet for rendered/downloaded standalone HTML, generated only at render/generate/save/download time.
- Keep every already-shipped layer - element prop schemas, graph validation, content-addressed persistence, copy-on-write revisions, the renderer's escaping/allowlisting guarantees - completely unaware this exists, by resolving classes to values before the command reaches that layer.

**Non-Goals:**
- Any element/prop beyond text `fontSize`/`color` (shape fill/stroke, table border, image, geometry, animation) - out of scope per proposal.md, unaffected by this design.
- Letting the model (or any request) define or extend the whitelist - the whitelist is deployed code, resolved the same way `animation-registry.ts`'s registered keys are.
- Full Tailwind utility coverage (spacing, layout, arbitrary CSS properties beyond font-size/color, `@apply`, custom Tailwind plugins) - the whitelist covers exactly two utility groups.
- Making the live canvas visually pixel-identical to the compiled Tailwind output during editing - the canvas already renders resolved values as inline styles today (see Context) and continues to; CSS custom properties in this design are about avoiding redundant style-object churn on every drag frame, not about running Tailwind in the browser.

## Decisions

### Type-hinted arbitrary values only - no implicit length/color inference

The whitelist accepts named Tailwind scale classes (`text-sm` … `text-9xl` for size; `text-{color}-{shade}` for Tailwind's default color palette) and *type-hinted* arbitrary values only: `text-[length:<value>]` for font-size, `text-[color:<value>]` for text color. A bare `text-[90px]` or `text-[#ff0000]` (no type hint) is rejected even though Tailwind itself would accept and correctly infer it.

**Alternatives considered:** Replicate Tailwind's own inference (peek at the bracketed value's shape - digits+unit vs. `#`/`rgb(`/named color - to decide which prop it resolves to). Rejected: this makes the whitelist's own correctness depend on correctly re-implementing Tailwind's inference heuristic, and a bracketed value that could plausibly be read as either (unlikely here, but the class of bug is the same one CSS-value sniffing always has) creates an avoidable ambiguity. Requiring the type hint costs nothing (the prompt just always emits it) and removes the inference step from our own validation surface entirely - the regex only ever needs to match one prop kind per whitelist entry.

### Resolution happens once, in `flattenWireSlides`, before persistence - not stored as a class reference

A Tailwind class string is resolved to `{fontSize: number}` or `{color: string}` immediately, using the exact same point `validateAnimation()` already uses for animation-key resolution. The persisted `TextProps.fontSize`/`TextProps.color` are ordinary numbers/strings, identical in shape to what they are today - `text.ts`, `graph-validator.ts`, `content-hash.ts`, and the repository layer need no changes at all.

**Alternatives considered:** Persist the class string itself (e.g. add `TextProps.fontSizeClass: string | null`) and resolve at render time instead. Rejected: this doubles the source of truth for the same visual value (which one wins if they disagree after a future whitelist change?), requires a schema/migration change to an already-shipped, tested element definition, and buys nothing here. The animation registry is versioned specifically so *historical* revisions keep rendering as originally authored even after new animation definitions ship; there is no analogous case for text size/color, since a resolved number or hex value already means the same thing forever - persisting the class instead of the value would only add an indirection with no corresponding benefit.

### Render output has two modes: inline style (default, unchanged) and Tailwind class + compiled stylesheet (render/download boundary only)

`render.ts`'s text element output continues to emit `style: {"font-size": ..., color: ...}` as it does today for every other prop and every other element type. A new, additive rendering mode - invoked only from the render/download route handlers, not from the general `renderStructuredRevision` call every other consumer uses - additionally emits `class="text-[length:90px] text-[color:#ff0000]"`-equivalent utility classes for font-size/color specifically and runs the resulting HTML through `@tailwindcss/cli` (new dependency) to produce a compiled stylesheet, embedded inline in the returned document so the standalone `.html` stays dependency-free per the existing "Download standalone presentation" requirement.

**Alternatives considered:** Make Tailwind-class output the only rendering mode for text font-size/color everywhere, including the in-app preview route. Rejected: the preview route is called far more often than download (every editor load), and compiling a stylesheet on every preview request adds subprocess latency to a path that today returns instantly; scoping the compile step to render/generate/save/download - exactly matching what was asked for - keeps preview cheap while still satisfying every case that actually needs a real stylesheet.

### The editor canvas renders resolved values through a CSS custom property, updated via direct DOM writes during a drag instead of a React state update per frame

`CanvasElement`'s text rendering sets `style={{"--slai-font-size": `${fontSize}px`, fontSize: "var(--slai-font-size)", ...}}`; a font-size slider/drag control updates `--slai-font-size` via a direct `element.style.setProperty` call during the drag gesture (matching the existing pointer-move pattern `DesignCanvas` already uses for position/size dragging, which keeps a `draftElements` state during the gesture and only commits on pointer-up) and commits the resolved numeric value to component state on release, at which point normal React rendering takes over. No Tailwind class or compile step is invoked by this path at all - class generation and compilation happen only in the save/download handlers already covered by the render-output-mode decision above.

**Alternatives considered:** Leave the canvas exactly as it is today (plain inline `fontSize` number, full React re-render per drag-move event, as `DesignCanvas`'s existing move/resize dragging already does for geometry). This is a legitimate, simpler option, since (per Context) the canvas was never going to invoke a compile step either way. It is not adopted as the default here only because the CSS-var approach was explicitly requested; either implementation satisfies every requirement in the specs delta, so this is recorded as a decision rather than left open only to document that the simpler alternative exists and is behavior-equivalent from the specs' point of view.

## Risks / Trade-offs

- [Spawning `@tailwindcss/cli` as a subprocess on generate/save/download adds latency and requires the deployment environment to permit spawning child processes] → Not all hosting targets allow this (some serverless runtimes restrict or forbid subprocess execution); confirm the actual deployment target supports it before implementation, and benchmark real compile latency once implemented.
- [Requiring an explicit type hint on every arbitrary-value class is a small deviation from idiomatic Tailwind authoring] → Acceptable: only the AI prompt and (optionally) the editor ever produce these classes, both server/app-controlled surfaces, not hand-authored user Tailwind code that would expect standard inference.
- [The whitelist's named-scale entries (`text-sm` … `text-9xl`, default color palette) need their concrete pixel/hex values kept in sync with whatever Tailwind version is installed, since resolution happens server-side, not by asking Tailwind itself to resolve a class name to a value] → Mitigation: derive the whitelist's value table from Tailwind's own default theme constants at build/dev time rather than hand-transcribing them, if Tailwind v4's package exposes them programmatically; otherwise pin and test against the installed Tailwind version explicitly.

## Migration Plan

1. Add `@tailwindcss/cli` as a dependency; add the whitelist module and resolution function (additive - nothing calls it yet, no behavior change).
2. Wire resolution into `flattenWireSlides` for AI-authored text elements only; update `generationSystemPrompt`/`editSystemPrompt`. This is the point AI-authored text styling behavior actually changes - **BREAKING** for the AI wire contract only, as proposal.md notes; no persisted data or already-completed generation is affected.
3. Add the render/download-boundary Tailwind-class-and-compile output mode; wire it into the existing render/download routes.
4. Update the editor canvas's text font-size/color live-preview path per the CSS-var decision.
5. No destructive step; rollback at any stage is a plain revert (the whitelist/resolution code path is additive and only invoked from the specific call sites wired to it in steps 2-4).

### Named color values are generated from the installed Tailwind package, never hand-transcribed or resolved dynamically

`scripts/generate-tailwind-color-palette.mjs` imports `tailwindcss/colors` - Tailwind's own stable, versioned export of its default palette - and writes every family/shade pair (290 entries as of the currently installed version, not a fixed assumption about which families/shades exist) to a committed generated file, `tailwind-color-palette.generated.ts`, alongside the source `tailwindcss` version it was generated from. `tailwind-whitelist.ts` imports only that generated file - a plain object literal with zero imports of its own - so runtime class resolution stays a synchronous lookup with no Tailwind invocation on the request path. `tailwind-color-palette.drift.test.ts` re-derives the palette from the installed package at test time and fails if it no longer matches the committed file or the recorded source version, so a `tailwindcss` upgrade that changes default color values cannot silently go stale; the fix is `node scripts/generate-tailwind-color-palette.mjs` plus a commit.

Font-size named-scale values remain hand-maintained (see the "Type-hinted arbitrary values only" decision's context): Tailwind's type scale has been numerically stable since Tailwind v1 and is a much smaller, lower-risk table than the color palette.

**Alternatives considered:** Parse `theme.css`'s `@theme` block, or compile `@import "tailwindcss"` through `@tailwindcss/cli` and parse the emitted `--color-*` custom properties. Rejected in favor of `tailwindcss/colors`: it is a public, versioned JS export Tailwind ships specifically for programmatic consumption (unlike CSS source, which is meant for the build pipeline, not for reading as data), so generation needs no CSS parsing and no subprocess at all - only a plain `import`.