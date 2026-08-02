# Changelog

All notable frontend changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Scope: `app/**` (excluding `app/api/**/route.ts`) and `modules/*/presentation/**`, per `CLAUDE.md`. Backend/domain changes are tracked via `openspec/`, not here.

## [Unreleased]

### Added

- `CLAUDE.md`: frontend-agent scope constraints (editable surface, API-contract discipline, changelog/design-doc process).
- `Docs/CHANGELOG.md`: this file.
- `app/globals.css`: wired `Docs/DESIGN.md`'s token system (colors, type scale, spacing, radii, shadows) as CSS custom properties, with colors/fonts/radii/shadows mirrored into a Tailwind v4 `@theme inline` block for utility classes (`bg-ink-black`, `font-signifier`, `rounded-cards`, `shadow-subtle`, etc). Spacing tokens are kept as plain `var(--spacing-*)` custom properties rather than Tailwind `--spacing-*` theme keys, to avoid silently redefining what a bare `p-4`/`gap-8` means elsewhere in the app.
- `app/layout.tsx`: loads Source Serif 4 and Inter via `next/font/google`, mapped to `--font-signifier`/`--font-sohne` per `Docs/DESIGN.md`.
- `app/icon.svg`: provisional brand mark (ink-black square, serif "S") implementing `Docs/DESIGN.md`'s own mark description. **Provisional** — not final art; real icon should come from whoever owns SlaI's design assets, then this file (and `app/favicon.ico`) should be replaced/regenerated to match.
- `openspec/changes/add-fe-component-test-tooling/`: proposal for a backend/root-owner to add `jsdom`/`@testing-library/react` + a `vitest.config.ts` DOM environment — `package.json` and `vitest.config.ts` are outside FE-agent scope, and this currently blocks writing component-level (render/click) tests for any future FE UI.

### Changed

- `app/layout.tsx`: `metadata.title`/`description` changed from the default "Create Next App" scaffold values to "SlaI" / "SlaI — AI-assisted slide generation".
- `app/page.tsx`: removed the unmodified `create-next-app` template (Next.js/Vercel logos, "Deploy Now"/"Documentation" links, placeholder copy). Replaced with a minimal token-styled placeholder (heading + short description) — not a full marketing hero, since `Docs/DESIGN.md`'s example copy is generic "Steep" study prose, not real SlaI content.

