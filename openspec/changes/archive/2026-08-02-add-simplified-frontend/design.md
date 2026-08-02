## Context

The App Router currently contains only the default `create-next-app` page, root layout, and global CSS. There are no shared UI components, browser API client, frontend authentication state, protected page shell, or component testing environment.

The backend already supports registration, login, refresh-token rotation through an HttpOnly cookie scoped to `/api/auth`, logout, current-user retrieval, and owner-scoped presentation listing. Access JWTs expire after 15 minutes and are returned in JSON; refresh tokens are never available to JavaScript. This creates a frontend constraint: protected browser requests need an in-memory access token, while page reloads must restore the session through `/api/auth/refresh` and `/api/auth/me`.

The requested first frontend slice deliberately stops before the report/template generation wizard. Create actions still need a valid destination so navigation never ends at a missing page.

## Goals / Non-Goals

**Goals:**

- Establish a distinctive but restrained responsive visual system.
- Provide public landing, login, and registration routes.
- Restore an existing refresh session without persistent access-token storage.
- Protect the dashboard and create placeholder from unauthenticated access.
- Display the user's presentation summaries with loading, error, empty, and populated states.
- Show authenticated identity and logout consistently in the protected shell.
- Make keyboard, focus, labels, status feedback, and reduced-motion behavior explicit.

**Non-Goals:**

- Build the outline approval, report/template upload, generation progress, detail viewer, editor, or delete UI.
- Add social login, password reset, email verification, profile editing, or session management.
- Add dark mode, localization, a component library, state-management dependency, or form library.
- Change backend auth/presentation APIs or persist access tokens in cookies, local storage, or session storage.

## Decisions

### Use a small route structure with public and protected shells

Routes:

```text
/
/login
/register
/home
/slides/new
```

The root landing page is a server component with a compact wordmark and only two primary actions: Log in and Register. Login/register share an auth-page shell. `/home` and `/slides/new` share an authenticated layout containing the navbar and auth gate.

The protected shell is client-guarded because the server cannot read the access token and the refresh cookie is intentionally scoped to `/api/auth`, so a server component cannot validate it directly without changing the backend cookie contract. It renders a stable full-page loading state during bootstrap, redirects anonymous users to `/login?next=<encoded-path>`, and only then renders protected children.

### Keep access tokens in memory and bootstrap from the refresh cookie

Create an `AuthProvider` client component exposing:

- `status`: `loading | authenticated | anonymous`
- `user`
- `login(credentials)`
- `register(credentials)`
- `logout()`
- `authFetch(input, init)`

On first mount, a module-scoped singleton bootstrap promise calls `POST /api/auth/refresh` with same-origin credentials, then `GET /api/auth/me` with the returned bearer token. Deduplicating the promise prevents React development Strict Mode from rotating the same refresh token twice. A failed refresh clears in-memory state and resolves as anonymous without displaying a global error.

Login/register store only the returned access token and sanitized user in provider state. No access or refresh token is written to Web Storage. Logout calls the idempotent API, clears local state regardless of network outcome, and replaces navigation with `/`.

`authFetch` sends the current bearer token. On one `401`, it performs one deduplicated refresh, updates the token, and retries once. If refresh fails, it transitions to anonymous and lets the protected layout redirect. It never retries non-authentication failures or loops.

### Use controlled native forms with shared primitives

Login and registration use controlled inputs, native email/password autocomplete attributes, Zod-compatible frontend constraints (valid email, password 8-128 characters), and one shared `AuthForm` component configured by mode. Submission disables fields/button, prevents duplicate requests, clears stale errors, and places API/server feedback in an `aria-live` region.

Successful login/registration uses `router.replace` to the validated internal `next` query when present, otherwise `/home`. Only paths beginning with one `/` and not `//` are accepted, preventing open redirects. Authenticated visits to `/login` or `/register` replace to `/home`.

The register API can return generic conflict details; the form presents a concise non-enumerating message. Invalid credentials use the backend's generic message.

### Build a minimal visual language, not a generic dashboard template

Use the existing Geist Sans/Mono fonts with a fixed light palette:

- warm off-white canvas
- near-black ink
- muted stone secondary text/borders
- deep cobalt accent for primary actions and status focus

Global CSS defines design tokens, selection/focus styles, and a subtle paper-grid or grain treatment with CSS only. Components use square-to-soft (`10-14px`) radii, hairline borders, generous whitespace, and typography hierarchy rather than gradients, glass cards, oversized hero copy, or decorative icon overload.

The landing page remains intentionally sparse: compact brand at the top/center and login/register actions at the visual center. It does not add feature sections, testimonials, statistics, or marketing copy beyond a short product descriptor if needed for context/accessibility.

### Render the dashboard as a presentation library

After authentication, `/home` requests `GET /api/slides?limit=20` through `authFetch`.

States:

- Loading: title skeleton and a small set of card skeletons.
- Error: concise inline message with a Retry button; existing shell remains usable.
- Empty: centered bordered workspace with a large `Create presentation` action linking to `/slides/new`.
- Populated: responsive one/two/three-column summary grid and a fixed or sticky high-visibility create action at the bottom-right, offset above mobile safe areas.

Each card shows title fallback (`Untitled presentation`), lifecycle status, last-updated date, and revision when present. Cards are not links in this slice because no detail UI route is in scope. A `Load more` action appears when `nextCursor` exists, appends results, and prevents duplicate loading; pagination errors preserve existing items and make retry possible.

Dates use `Intl.DateTimeFormat` and include a machine-readable `<time dateTime>` value. Status labels map the backend enum to clear labels and tones without relying on color alone.

### Provide a protected create placeholder

`/slides/new` uses the authenticated shell and presents a simple back link, title, and message that the creation workflow is the next implementation step. Both dashboard create actions point here. This is preferable to a disabled button or missing route and keeps the current scope honest.

### Keep the navbar state-aware and responsive

The authenticated navbar contains:

- SLAI wordmark linking to `/home`
- the current user's email, truncated visually but available through its title/accessibility text
- a text/button logout action

On narrow screens it preserves all three elements without a hamburger menu: brand left, email compressed in the center, logout right. Logout has a pending label and cannot be double-submitted.

### Add frontend-focused tests without a broad dependency stack

Add `jsdom`, React Testing Library, `@testing-library/jest-dom`, and `@testing-library/user-event` as development dependencies. Configure Vitest projects or per-file environment and a setup file while preserving existing Node tests.

Test the API client/session logic with mocked fetch and the UI with accessible role/label queries. Page tests mock `next/navigation` and the auth context. Browser E2E tooling is deferred; production build provides App Router integration validation.

## Risks / Trade-offs

- [Client-only protection briefly cannot know auth state] -> Render a deterministic loading shell until bootstrap completes; never flash protected data.
- [Refresh rotation races across Strict Mode or concurrent requests] -> Share one module-scoped refresh promise and clear it only after completion.
- [Multiple browser tabs can rotate one refresh token independently] -> Keep this slice single-tab safe; future cross-tab coordination can use `BroadcastChannel` if product usage requires it.
- [In-memory access tokens disappear on reload] -> Intentionally bootstrap through the HttpOnly refresh cookie; this is safer than Web Storage.
- [Refresh cookie path prevents server-side auth gating] -> Use a client protected shell without widening cookie scope or duplicating refresh logic in server routes.
- [Dashboard has no presentation detail destination] -> Keep summary cards non-interactive and provide only the valid creation placeholder route.
- [Initial list shows only 20 records] -> Provide cursor-based Load more using the existing API.
- [UI tests add several development dependencies] -> Limit them to standard Testing Library packages and avoid a production component framework.

## Migration Plan

1. Add frontend test dependencies and jsdom setup without changing existing Node test behavior.
2. Add shared frontend types/API helpers and the in-memory auth provider.
3. Add visual tokens, metadata, reusable buttons/forms/navbar/protected shell.
4. Replace the landing page and add login/register routes.
5. Add the protected home dashboard and create placeholder.
6. Verify responsive states, accessibility, auth/session behavior, tests, lint, TypeScript, and production build.

Rollback restores the previous root layout/page/CSS and removes the new routes/components/client utilities. No database or API migration is required.

## Open Questions

None.
