## Why

The project can call LLM providers and persist generated HTML, but it has no user-facing slide workflow or contract that makes model output predictable. Users need to review an outline before generation, produce slides that follow both their report and visual template, and safely revise individual slides without losing prior work.

## What Changes

- Add an authenticated route that sends an uploaded report to the configured AI adapter and returns a validated JSON outline containing the presentation title and per-slide title/summary suggestions.
- Add an authenticated route that accepts the report file, template file, and user-approved outline, generates a complete HTML presentation, validates a strict slide wrapper contract, and stores the result.
- Add one authenticated batch-edit route that accepts a generation ID and a JSON array of numbered slide edit instructions, updates only those slides, and preserves every unselected slide.
- Add revision history and an authenticated undo route so the latest generation or edit batch can be rolled back without losing prior HTML.
- Add centralized system prompts that constrain outline JSON, full presentation HTML, and batch slide HTML responses.
- Add provider configuration and an application-level AI generation port so routes do not construct or depend directly on CLIProxy adapters.

## Capabilities

### New Capabilities

- `slide-generation-workflow`: Covers report outline suggestion, approved-outline HTML generation, per-slide editing, persistence, ownership, revisions, and undo.

### Modified Capabilities

None.

## Impact

- Adds slide domain schemas, system prompts, application services, AI adapter composition, persistence, and authenticated Next.js route handlers.
- Uses the existing OpenAI/Gemini CLIProxy adapters, bearer authentication guard, `SlideGeneration` table, and shared Prisma client.
- Extends the database schema with stored approved outlines and immutable HTML revisions required for undo.
- Introduces multipart file handling limits and new CLIProxy provider/model environment configuration.
- Adds HTML parsing and sanitization dependencies; generated HTML must still be rendered in a sandboxed iframe by future UI code.
