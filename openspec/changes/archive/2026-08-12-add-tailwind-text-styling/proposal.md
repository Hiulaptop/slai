## Why

AI-generated and edited slides currently describe text font-size and color as free-form numeric/hex values the model invents directly (`TextProps.fontSize: number`, `TextProps.color: string` in `modules/slides/domain/structured/elements/text.ts`), with no connection to any styling system and no arbitrary-value authoring convention. Product direction is now to author these two fields through Tailwind CSS utility classes instead - including Tailwind's arbitrary-value syntax (e.g. `text-[90px]`) - so slide styling can eventually converge on the same Tailwind vocabulary used elsewhere, and so a bounded, explicitly-approved set of utility patterns (not free-form model invention) governs what values reach a slide. This also supersedes the discarded `add-template-style-tokens` proposal, which tried to solve consistency with a per-generation extracted color/typography token package instead of Tailwind classes.

## What Changes

- Add a Tailwind-class adapter that accepts a font-size class and a color class for a text element (from Tailwind's default scale, e.g. `text-lg`, `text-red-500`, or an explicit type-hinted arbitrary value, e.g. `text-[length:90px]`, `text-[color:#ff0000]`), validates each against a developer-maintained whitelist of utility patterns, and resolves it into the existing `TextProps.fontSize`/`TextProps.color` values. An unrecognized or malformed class is rejected outright - never silently dropped or substituted with a nearest match.
- Change `generationSystemPrompt`/`editSystemPrompt` so the model authors a text element's font-size and color as whitelisted Tailwind classes instead of raw numbers/hex strings; the model never sees or edits the whitelist itself, only selects from the classes the prompt lists.
- **BREAKING (AI wire contract only):** the structured generation/edit wire schema's text element shape changes for these two fields; already-persisted structured elements are unaffected since resolution happens before persistence and `TextProps` itself does not change.
- Add a server-side Tailwind CLI compile step invoked only at generation completion, design save, and download (never on every in-editor property change) that produces a compiled stylesheet for the Tailwind classes actually used, for the rendered/downloaded standalone HTML output.
- Change the design editor's live text-property preview (font-size/color) to update through a CSS custom property bound to component state instead of directly re-deriving inline styles from the element registry on every change, so dragging a size control does not invoke any compile step; Tailwind classes and the compiled stylesheet remain a save/generate/download-time concern only.
- Scope: text elements' `fontSize` and `color` only. Shape fill/stroke, table border, image, and every other element/prop is unaffected and keeps its current free-form value model.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `slide-generation-workflow`: generation and batch-edit prompt construction now require Tailwind-class authoring for text font-size/color instead of raw values, validated against a whitelist.
- `structured-slide-document`: the deterministic renderer gains a Tailwind-class-and-compiled-stylesheet output mode for text font-size/color in rendered/downloaded HTML, in addition to its existing escaped-HTML-and-CSS output; element node persistence itself is unchanged.

## Impact

- `modules/slides/domain/structured/tailwind-whitelist.ts` (new): developer-maintained whitelist of supported Tailwind utility patterns (named scale + type-hinted arbitrary value) for font-size and text-color, with a resolve-to-value function per pattern.
- `scripts/generate-tailwind-color-palette.mjs` (new) + `modules/slides/domain/structured/tailwind-color-palette.generated.ts` (new, committed): the color half of the whitelist is generated from the installed `tailwindcss` package's own `tailwindcss/colors` export - every default family/shade, not a hand-transcribed subset - verified against the installed package by a drift test so a Tailwind upgrade cannot silently change resolved color values.
- `modules/slides/domain/structured/tailwind-adapter.ts` (new): parses/validates a class list against the whitelist, resolves to `{fontSize, color}`, throws (caller-parameterized error code, matching `compose.ts`'s existing pattern) on any unrecognized class - no fallback.
- `modules/slides/domain/prompts.ts`: `generationSystemPrompt`/`editSystemPrompt` rewritten to enumerate the whitelist's supported patterns for the model instead of describing raw value ranges.
- `modules/slides/domain/structured/compose.ts`: `flattenWireSlides` (or its caller) gains a resolution pass for text elements' class-based fields, mirroring how it already resolves animation references.
- `modules/slides/domain/structured/render.ts`: text element rendering gains a Tailwind-class output mode; a new compile step (new dependency: `@tailwindcss/cli`, not currently installed - only `tailwindcss` core and `@tailwindcss/postcss` are) runs at the render/download boundary.
- `components/design-canvas.tsx`, `components/design-editor.tsx`: live text font-size/color preview switches to a CSS custom property driven by component state; Tailwind class generation and compilation are deferred to save/download.
- No change to `modules/slides/domain/structured/elements/*` prop schemas, `graph-validator.ts`, the repository/persistence layer, or content-addressing - resolution happens before a command reaches that already-shipped pipeline, exactly as `add-structured-slide-persistence`'s animation-reference resolution does today.
