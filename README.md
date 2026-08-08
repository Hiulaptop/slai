# SLAI

SLAI is an AI-assisted presentation service that turns source reports and visual templates into editable HTML slide decks. It supports a review-first workflow: the model proposes a structured outline, the user approves or changes it, and the service generates a presentation that follows both the report content and template design.

The backend also provides password authentication, owner-scoped presentation access, batch slide editing, immutable revisions, and undo.

## Features

- Email/password registration and login
- Short-lived JWT access tokens and rotating refresh sessions
- AI-generated presentation outlines for user approval
- HTML presentation generation from a report, template, and approved outline
- Strict slide structure and sanitized model output
- Atomic batch editing of one or more slides
- Immutable revision history and repeated undo
- Owner-only list, detail, edit, undo, and delete operations
- Stable cursor pagination for presentation lists
- OpenAI- and Gemini-compatible CLIProxy adapters

## Technology

- [Next.js 16](https://nextjs.org/) with the App Router
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Prisma 7](https://www.prisma.io/) with the MariaDB driver adapter
- MySQL or MariaDB
- [Zod](https://zod.dev/) for runtime validation
- [jose](https://github.com/panva/jose) and bcrypt for authentication
- [Cheerio](https://cheerio.js.org/) and `sanitize-html` for generated HTML processing
- [Vitest](https://vitest.dev/) and ESLint
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) for change specifications

## Workflow

1. Upload a report to receive a proposed presentation title and slide outline.
2. Review or modify the outline in the client.
3. Submit the report, visual template, and approved outline.
4. Receive a sanitized HTML presentation.
5. Edit one or more slides in a single atomic request.
6. Undo an edit by restoring its parent revision.

Every generated slide uses this wrapper contract:

```html
<div class="slai-slide" data-slide-number="1">
  <!-- Slide content -->
</div>
```

Slide numbers are unique, contiguous, and one-based. A generated presentation is a complete HTML document, while a model-generated edit contains only replacement slide wrappers.

## Architecture

The codebase follows a feature-oriented, layered architecture. HTTP handlers stay thin, application services orchestrate use cases, domain modules define contracts and rules, and infrastructure modules implement database and AI integrations.

```text
app/
  api/
    auth/                    Authentication route handlers
    slides/                  Presentation route handlers

modules/
  ai/
    domain/                  Provider-neutral AI request schema
    infrastructure/         OpenAI/Gemini CLIProxy adapters
  auth/
    domain/                  Credentials, auth types, and errors
    application/             Auth service and ports
    infrastructure/          JWT, password, refresh token, Prisma repository
    presentation/            Request authentication and response helpers
  database/
    infrastructure/         Shared server-only Prisma client
  slides/
    domain/                  Outline/edit schemas, prompts, HTML and cursor rules
    application/             Slide service, repository ports, access policy
    infrastructure/          Prisma repository and AI composition root
    presentation/            Parsing, serialization, and error responses

prisma/
  schema.prisma              Database schema
  migrations/                Forward MySQL migrations

openspec/
  specs/                     Current behavior specifications
  changes/archive/           Completed change artifacts
```

### Request Flow

```text
HTTP route
  -> bearer authentication
  -> Zod transport validation
  -> application service
  -> presentation access policy
  -> repository and/or provider-neutral AI port
  -> Prisma or CLIProxy adapter
  -> safe response DTO
```

### Authentication

- Passwords are stored as bcrypt hashes.
- Access tokens are HS256 JWTs with a 15-minute lifetime.
- Refresh tokens contain at least 256 bits of randomness and expire after 30 days.
- Only SHA-256 refresh-token hashes are stored.
- Refresh tokens rotate after every successful refresh.
- The refresh token is delivered through the `slai_refresh_token` HttpOnly cookie.
- Protected routes require `Authorization: Bearer <access-token>`.

### Presentation Access

All slides inherit access from their parent presentation. There are no per-slide ACL rows.

- Only the owner can list or retrieve a presentation.
- Only completed presentations can be edited or undone.
- Processing presentations cannot be deleted.
- Missing and cross-owner resources both return `404` to conceal ownership.
- List queries use `(createdAt DESC, id DESC)` cursor pagination.

### AI Boundary

The slide application service depends on a provider-neutral `AIGenerator` port. A server-only composition root chooses the OpenAI or Gemini CLIProxy adapter from environment configuration.

System prompts define three strict model contracts:

- Outline generation returns validated JSON.
- Presentation generation returns one complete HTML5 document.
- Batch editing returns JSON containing exactly one replacement wrapper per requested slide.

Uploaded files are treated as untrusted source data. Generated HTML is parsed, sanitized, structurally validated, and size-limited before persistence. Clients should still render presentation HTML in a sandboxed iframe.

### Persistence

The primary data model contains:

- `User`: account and status
- `AuthSession`: hashed rotating refresh session
- `SlideGeneration`: owned presentation, current HTML, outline, lifecycle, and provider metadata
- `SlideRevision`: immutable full-HTML snapshot with a parent revision
- `ApiRequestLog` and `SystemLog`: optional operational logging records

An edit creates one revision for the entire batch. Undo moves the current revision pointer to its parent without deleting history. Editing after undo creates a new branch with a monotonically increasing revision number.

## Requirements

- Node.js 20.9 or newer
- pnpm
- MySQL 8+ or a compatible MariaDB server
- A running CLIProxy endpoint compatible with either the OpenAI Chat Completions API or Gemini API

## Local Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the environment

Create `.env` from the example:

```bash
cp .env.example .env
```

Environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | MySQL connection URL used by Prisma and the MariaDB adapter |
| `JWT_SECRET` | Yes | HS256 secret containing at least 32 UTF-8 bytes |
| `CLIPROXY_PROVIDER` | Yes | AI adapter to use: `openai` or `gemini` |
| `CLIPROXY_BASE_URL` | Yes | Base URL of the running CLIProxy service |
| `CLIPROXY_API_KEY` | Yes | Bearer key accepted by CLIProxy |
| `SLIDE_MODEL_ID` | Yes | Provider model used for outline, generation, and editing |

Example:

```dotenv
DATABASE_URL="mysql://slai:slai@localhost:3306/slai"
JWT_SECRET="replace-with-a-random-secret-at-least-32-bytes-long"
CLIPROXY_PROVIDER="openai"
CLIPROXY_BASE_URL="http://localhost:8317"
CLIPROXY_API_KEY="replace-with-your-cliproxy-api-key"
SLIDE_MODEL_ID="gpt-4.1-mini"
```

### 3. Create the database

Create the database and credentials referenced by `DATABASE_URL`. For the example configuration:

```sql
CREATE DATABASE slai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'slai'@'%' IDENTIFIED BY 'slai';
GRANT ALL PRIVILEGES ON slai.* TO 'slai'@'%';
FLUSH PRIVILEGES;
```

### 4. Generate Prisma Client and apply migrations

For local development:

```bash
pnpm db:generate
pnpm db:migrate
```

For an existing deployment where migrations must run non-interactively:

```bash
pnpm db:generate
pnpm db:deploy
```

### 5. Run the development server

```bash
pnpm dev
```

The application is available at [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js development server |
| `pnpm build` | Create a production build |
| `pnpm start` | Run the production server after a build |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run the complete Vitest suite once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm db:format` | Format `prisma/schema.prisma` |
| `pnpm db:validate` | Validate the Prisma schema |
| `pnpm db:migrate` | Create/apply a development migration |
| `pnpm db:deploy` | Apply existing migrations non-interactively |
| `pnpm db:studio` | Open Prisma Studio |

## Deployment

The initial GitHub Actions rollout and PM2/server setup are documented in [Docs/DEPLOYMENT.md](Docs/DEPLOYMENT.md). CI currently targets pull requests to `deploy/ci-cd`; deployment uses `/usr/bin/pm2` and verifies `https://slai.studev.net` after restart.

Recommended verification before a pull request:

```bash
pnpm db:generate
pnpm db:validate
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

## API Reference

Base URL during local development:

```text
http://localhost:3000
```

All request and response bodies use JSON unless an endpoint is documented as `multipart/form-data`. Date values are ISO 8601 strings. Protected routes require:

```http
Authorization: Bearer <access-token>
```

### Error Format

Errors use a stable envelope:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Invalid request"
  }
}
```

Common statuses:

| Status | Meaning |
| --- | --- |
| `400` | Malformed JSON, invalid parameters, invalid files, or schema validation failure |
| `401` | Missing or invalid authentication |
| `404` | Presentation not found or not owned by the caller |
| `409` | Duplicate registration, invalid presentation state, stale edit/delete, or nothing to undo |
| `502` | AI provider failure or invalid model output |
| `500` | Unexpected internal error |

## Authentication API

### Register

```http
POST /api/auth/register
Content-Type: application/json
```

Request:

```json
{
  "email": "user@example.com",
  "password": "strong-password"
}
```

The email is trimmed and normalized to lowercase. Password length must be 8 through 128 characters.

Success: `201 Created`

```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "status": "ACTIVE",
    "lastLoginAt": null,
    "createdAt": "2026-08-02T00:00:00.000Z",
    "updatedAt": "2026-08-02T00:00:00.000Z"
  },
  "accessToken": "eyJ..."
}
```

The response also sets the HttpOnly refresh cookie. Duplicate registration returns `409` with a generic error.

Example:

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"strong-password"}' \
  http://localhost:3000/api/auth/register
```

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

Request uses the same email/password schema as registration.

Success: `200 OK`

```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "status": "ACTIVE",
    "lastLoginAt": "2026-08-02T00:05:00.000Z",
    "createdAt": "2026-08-02T00:00:00.000Z",
    "updatedAt": "2026-08-02T00:05:00.000Z"
  },
  "accessToken": "eyJ..."
}
```

Unknown email, invalid password, and disabled accounts return the same `401` response.

### Refresh Access Token

```http
POST /api/auth/refresh
Cookie: slai_refresh_token=<refresh-token>
```

Success: `200 OK`

```json
{
  "accessToken": "eyJ..."
}
```

The refresh token is rotated and a replacement cookie is set. An invalid or reused token returns `401` and clears the cookie.

```bash
curl -i -b cookies.txt -c cookies.txt \
  -X POST http://localhost:3000/api/auth/refresh
```

### Current User

```http
GET /api/auth/me
Authorization: Bearer <access-token>
```

Success: `200 OK`

```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "status": "ACTIVE",
    "lastLoginAt": "2026-08-02T00:05:00.000Z",
    "createdAt": "2026-08-02T00:00:00.000Z",
    "updatedAt": "2026-08-02T00:05:00.000Z"
  }
}
```

### Logout

```http
POST /api/auth/logout
Cookie: slai_refresh_token=<refresh-token>
```

Success: `204 No Content`. Logout is idempotent and always clears the refresh cookie.

## Presentation API

Every presentation endpoint is protected by bearer authentication.

### Suggest an Outline

```http
POST /api/slides/outline
Content-Type: multipart/form-data
Authorization: Bearer <access-token>
```

Multipart fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | String | Yes | Presentation title, up to 500 characters |
| `prompt` | String | Yes | User direction, up to 4,000 characters |
| `slideCount` | Integer string | Yes | Positive requested slide count |
| `dataFiles` | File (repeatable) | Yes | One or more factual source files |

Supported report types:

- `application/pdf`
- `text/plain`
- `text/markdown`
- DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- OpenDocument text (`application/vnd.oasis.opendocument.text`)

Each data file must be non-empty and at most 10 MiB. The combined upload must not exceed 100 MiB. Template files selected in the creation workspace are retained for generation but are not sent to the outline model.

Success: `200 OK`

```json
{
  "outline": {
    "title": "Quarterly Business Review",
    "slides": [
      {
        "number": 1,
        "title": "Executive Summary",
        "summary": "Summarize performance, risks, and next steps."
      }
    ]
  }
}
```

An outline contains exactly `slideCount` slides. Numbers must be contiguous and one-based, titles are limited to 200 characters, and summaries are limited to 2,000 characters. There is no arbitrary slide-count ceiling, although provider context, request, timeout, and output-size limits still apply.

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "title=Quarterly Business Review" \
  -F "prompt=Summarize performance, risks, and decisions" \
  -F "slideCount=12" \
  -F "dataFiles=@./report.pdf;type=application/pdf" \
  http://localhost:3000/api/slides/outline
```

### Generate a Presentation

```http
POST /api/slides/generate
Content-Type: multipart/form-data
Authorization: Bearer <access-token>
```

Multipart fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `title` | String | Yes | Presentation title |
| `prompt` | String | Yes | User direction |
| `slideCount` | Integer string | Yes | Positive count matching the outline length |
| `dataFiles` | File (repeatable) | Yes | One or more factual source files |
| `templateFiles` | File (repeatable) | Yes | One or more visual references |
| `outline` | JSON string | Yes | User-approved outline |

Supported template types:

- `text/html`
- `application/pdf`
- `image/png`
- `image/jpeg`
- `image/webp`

Each file must be non-empty and at most 10 MiB, and all files together must not exceed 100 MiB. Generation is synchronous and may take as long as the configured model request.

During generation, data files are the only authoritative factual source. Template files influence visual design only. A template PDF is interpreted page by page as an ordered collection of rendered visual references; text, names, dates, and numbers visible in templates must not be copied as presentation facts. Missing data is omitted or identified as unavailable rather than invented.

Generated slides are self-contained HTML/CSS only. JavaScript and other executable content are rejected, and at least one non-empty head `<style>` element is required. External stylesheets, CSS imports, CDN utility classes without local definitions, and script-generated styles are not supported. Each slide is constrained to the full fixed viewport with `width: 100%`, `height: 100%`, `box-sizing: border-box`, and `overflow: hidden`; slide viewers do not expose scrollbars. Phase 3 preserves body attributes and non-slide ancestor containers so selectors and CSS variables based on the generated document hierarchy continue to render correctly.

The editor's Download HTML action exports every slide in one standalone file. The application adds its own fixed, trusted navigation code to that download so it opens on slide 1 and supports Previous, Next, ArrowLeft, and ArrowRight without requiring the SLAI runtime. LLM-generated JavaScript remains prohibited; the export navigation is maintained by the application.

Example outline field:

```json
{
  "title": "Quarterly Business Review",
  "slides": [
    {
      "number": 1,
      "title": "Executive Summary",
      "summary": "Summarize performance, risks, and next steps."
    }
  ]
}
```

Success: `201 Created`

```json
{
  "id": "presentation-uuid",
  "title": "Quarterly Business Review",
  "status": "COMPLETED",
  "outline": {
    "title": "Quarterly Business Review",
    "slides": [
      {
        "number": 1,
        "title": "Executive Summary",
        "summary": "Summarize performance, risks, and next steps."
      }
    ]
  },
  "html": "<!doctype html><html>...</html>",
  "revisionNumber": 1,
  "undoableSlideNumbers": [],
  "createdAt": "2026-08-02T00:00:00.000Z",
  "updatedAt": "2026-08-02T00:01:00.000Z",
  "completedAt": "2026-08-02T00:01:00.000Z",
  "provider": "openai",
  "modelId": "gpt-4.1-mini",
  "finishReason": "stop",
  "usage": {
    "promptTokens": 1000,
    "completionTokens": 2000,
    "totalTokens": 3000
  }
}
```

```bash
OUTLINE='{"title":"Quarterly Business Review","slides":[{"number":1,"title":"Executive Summary","summary":"Summarize performance, risks, and next steps."}]}'

curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "title=Quarterly Business Review" \
  -F "prompt=Summarize performance, risks, and decisions" \
  -F "slideCount=1" \
  -F "dataFiles=@./report.pdf;type=application/pdf" \
  -F "templateFiles=@./template.pdf;type=application/pdf" \
  -F "outline=$OUTLINE" \
  http://localhost:3000/api/slides/generate
```

### List Presentations

```http
GET /api/slides?limit=20&cursor=<opaque-cursor>
Authorization: Bearer <access-token>
```

Query parameters:

| Parameter | Required | Description |
| --- | --- | --- |
| `limit` | No | Integer from 1 through 50; defaults to 20 |
| `cursor` | No | Opaque `nextCursor` returned by the previous page |

Success: `200 OK`

```json
{
  "items": [
    {
      "id": "presentation-uuid",
      "title": "Quarterly Business Review",
      "status": "COMPLETED",
      "currentRevisionNumber": 1,
      "createdAt": "2026-08-02T00:00:00.000Z",
      "updatedAt": "2026-08-02T00:01:00.000Z",
      "completedAt": "2026-08-02T00:01:00.000Z"
    }
  ],
  "nextCursor": null
}
```

List items intentionally exclude HTML, outlines, provider metadata, token usage, payloads, and revisions.

### Get Presentation Detail

```http
GET /api/slides/{generationId}
Authorization: Bearer <access-token>
```

`generationId` must be a UUID. Success returns the same safe presentation DTO used by generation, editing, and undo, including `undoableSlideNumbers`. Pending, processing, and failed presentations can be retrieved with unavailable output fields set to `null`.

### Batch Edit Slides

```http
PATCH /api/slides/edit
Content-Type: application/json
Authorization: Bearer <access-token>
```

Request:

```json
{
  "generationId": "presentation-uuid",
  "edits": [
    {
      "slideNumber": 2,
      "prompt": "Shorten the text and emphasize revenue growth."
    },
    {
      "slideNumber": 5,
      "prompt": "Replace the chart with a bar chart using the template colors."
    }
  ]
}
```

Rules:

- `edits` contains one or more items and must fit configured request/provider limits.
- Slide numbers must be unique positive integers that exist in the presentation.
- Each prompt contains 1 through 2,000 characters after trimming.
- The presentation must be complete and owned by the caller.
- The model must return exactly one valid replacement per requested slide.
- The entire batch is atomic: if any replacement is invalid, no slide changes.
- A successful batch creates one immutable revision.

Success: `200 OK` with the updated presentation DTO.

```bash
curl -X PATCH \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"generationId":"presentation-uuid","edits":[{"slideNumber":2,"prompt":"Shorten this slide."}]}' \
  http://localhost:3000/api/slides/edit
```

### Undo One Slide

```http
POST /api/slides/{generationId}/undo
Content-Type: application/json
Authorization: Bearer <access-token>
```

Request:

```json
{ "slideNumber": 2 }
```

Success: `200 OK` with the updated presentation DTO. Only the selected slide is restored; all other current slides remain unchanged. If that slide has no earlier version, the endpoint returns `409`.

Undo does not delete revisions. It creates a new immutable `UNDO` revision whose parent is the current revision.

### Delete a Presentation

```http
DELETE /api/slides/{generationId}
Authorization: Bearer <access-token>
```

Success: `204 No Content`.

The presentation and its slide revisions are permanently deleted. A presentation in `PROCESSING` state cannot be deleted and returns `409`.

## End-to-End Example

The following sequence uses `jq` to extract JSON fields:

```bash
# Register and save the refresh cookie.
REGISTER_RESPONSE=$(curl -s -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"strong-password"}' \
  http://localhost:3000/api/auth/register)

export ACCESS_TOKEN=$(printf '%s' "$REGISTER_RESPONSE" | jq -r '.accessToken')

# Ask the model for an outline.
OUTLINE_RESPONSE=$(curl -s \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "title=Quarterly Business Review" \
  -F "prompt=Summarize performance, risks, and decisions" \
  -F "slideCount=1" \
  -F "dataFiles=@./report.pdf;type=application/pdf" \
  http://localhost:3000/api/slides/outline)

OUTLINE=$(printf '%s' "$OUTLINE_RESPONSE" | jq -c '.outline')

# Generate a presentation from the approved outline.
PRESENTATION=$(curl -s \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "title=Quarterly Business Review" \
  -F "prompt=Summarize performance, risks, and decisions" \
  -F "slideCount=1" \
  -F "dataFiles=@./report.pdf;type=application/pdf" \
  -F "templateFiles=@./template.html;type=text/html" \
  -F "outline=$OUTLINE" \
  http://localhost:3000/api/slides/generate)

PRESENTATION_ID=$(printf '%s' "$PRESENTATION" | jq -r '.id')

# Edit slide 1.
curl -s -X PATCH \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"generationId\":\"$PRESENTATION_ID\",\"edits\":[{\"slideNumber\":1,\"prompt\":\"Make the opening more concise.\"}]}" \
  http://localhost:3000/api/slides/edit

# Undo the edit.
curl -s -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slideNumber":1}' \
  "http://localhost:3000/api/slides/$PRESENTATION_ID/undo"
```

## Security Notes

- Never commit `.env`, database credentials, JWT secrets, or CLIProxy keys.
- Use a cryptographically random production `JWT_SECRET` with at least 32 bytes.
- Serve production traffic over HTTPS so the refresh cookie is marked Secure.
- Restrict CLIProxy network access and rotate its API key regularly.
- Render generated presentation HTML in a sandboxed iframe even though the server sanitizes it.
- Apply request size and timeout limits at the reverse proxy or deployment platform in addition to application validation.
- Database rows with a nullable historical `userId` are intentionally excluded from owner routes.

## OpenSpec

The current system behavior is documented under `openspec/specs/`. Completed design proposals and implementation task lists are stored under `openspec/changes/archive/`.

Validate all active specifications with:

```bash
openspec validate --all --strict --no-interactive
```
