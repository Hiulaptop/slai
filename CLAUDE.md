# CLAUDE.md — SlaI Frontend Agent Scope

This file governs any Claude Code agent working in this repository. It is a **hard scope constraint**, not a suggestion — read it before touching any file.

## What this repo is

A single Next.js 16 (App Router) app, not a monorepo. There is no `apps/frontend` or `apps/backend` split. Each feature lives in `modules/<name>/` with a hexagonal layering:

```
modules/<name>/
  domain/          business rules, types, errors, zod schemas
  application/      services, ports (use-case orchestration)
  infrastructure/   persistence, external APIs, tokens, hashing
  presentation/      HTTP request/response shaping consumed by app/api routes
app/
  api/**/route.ts    Next.js route handlers (wire HTTP to modules/*/application)
  layout.tsx, page.tsx, globals.css, (future) components/, hooks/
prisma/              schema + migrations
openspec/             spec-driven change process (specs/, changes/, changes/archive/)
Docs/                 all project documentation (design system, changelog, this scope doc)
```

## Scope — what you may edit

**Frontend / presentation surface only:**

- `app/**` — pages, layouts, UI components, styles — **except** `app/api/**/route.ts`
- `modules/*/presentation/**` — this is the HTTP-adapter layer (response shaping, error mapping, request parsing helpers like `authenticateRequest`). It is the closest thing to a FE/BE seam in this codebase and is in scope.
- `Docs/**` — design docs, changelog, review notes, spec-gap proposals

**Never edit — backend / domain surface, read-only reference only:**

- `modules/*/domain/**`
- `modules/*/application/**`
- `modules/*/infrastructure/**`
- `app/api/**/route.ts` (route handlers — these wire modules together; treat as backend)
- `prisma/**` (schema, migrations)
- `modules/database/**`

If a task seems to require changing anything in the "never edit" list, stop and flag it instead of working around the boundary (e.g. don't shape data client-side to fake a field the API doesn't return).

## API contract discipline

The backend is the single source of truth for what data and endpoints exist. Never invent an endpoint, field, status code, or error shape that doesn't already exist in:

- `app/api/**/route.ts` (what's actually exposed)
- `modules/*/presentation/route-helpers.ts` (actual response/error shapes)
- `modules/*/domain/*.schemas.ts` / `*.types.ts` (actual data contracts)
- `openspec/specs/*/spec.md` (documented capability specs)

Before building a feature, read these files for the module involved. When the backend changes (new fields, new routes, changed error codes), re-read them — do not rely on memory of a previous shape.

### When the frontend needs something the backend doesn't provide

Do not fabricate it (no fake endpoints, no client-side stubs pretending to be real data, no guessed field names). Instead, write an OpenSpec change proposal for a backend developer to pick up, following the existing convention in `openspec/changes/` (see `openspec/changes/archive/*` for real examples):

```
openspec/changes/<slug>/
  proposal.md   # Why / What Changes / Capabilities / Impact
  design.md     # optional — technical approach if non-trivial
  tasks.md      # optional — implementation checklist
```

Use `proposal.md`'s "Why / What Changes / Impact" structure (see any file under `openspec/changes/archive/`). Note in "Impact" which frontend feature is blocked on it.

## Design system

`Docs/DESIGN.md` is the canonical frontend style reference (tokens, components, do's/don'ts). Follow it for any UI work. Changes to the design system itself require explicit product-owner approval and a corresponding update to that document — don't drift from it silently.

## Changelog discipline

Every frontend change (in scope per above) must add an entry to `Docs/CHANGELOG.md` under `[Unreleased]`, using Keep a Changelog categories (Added / Changed / Fixed / Removed). This is how backend developers and other agents track what moved on the frontend without reading every diff.

## Testing & conventions

- Tests run via `vitest` (`pnpm test`). Existing modules colocate `*.test.ts` next to source — follow that pattern for any new frontend test.
- Lint via `pnpm lint` (ESLint flat config, `eslint.config.mjs`).
- This project favors small, typed, colocated code — match existing module conventions rather than introducing new patterns.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
