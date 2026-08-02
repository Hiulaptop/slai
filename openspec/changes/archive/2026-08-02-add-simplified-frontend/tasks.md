## 1. Frontend Test Foundation

- [x] 1.1 Add jsdom, React Testing Library, jest-dom, and user-event development dependencies without changing the existing Node test environment
- [x] 1.2 Configure frontend test setup, environment selection, and shared DOM matchers; add a test command that runs both existing backend tests and frontend tests
- [x] 1.3 Add shared frontend domain types for authenticated users, access-token responses, pagination responses, and presentation summaries based on the existing API DTOs

## 2. Authenticated API Client

- [x] 2.1 Implement the in-memory auth client with login, registration, refresh, current-user, logout, and protected fetch operations
- [x] 2.2 Deduplicate refresh/bootstrap promises, send same-origin credentials, retry one expired protected request once, and clear state after refresh failure
- [x] 2.3 Implement safe internal `next` path validation and error normalization for form and protected-request consumers
- [x] 2.4 Implement the `AuthProvider` and hooks with loading, authenticated, and anonymous states; cover bootstrap, token non-persistence, retry, logout, and race behavior with tests

## 3. Shared Visual Foundation

- [x] 3.1 Replace starter metadata and update root layout language/title/description for SLAI
- [x] 3.2 Replace global starter CSS with simplified light design tokens, typography, focus-visible styles, selection, reduced-motion handling, and responsive base rules
- [x] 3.3 Create reusable button, field, status, loading, brand, and page-shell primitives with keyboard-accessible states
- [x] 3.4 Create public auth shell and protected shell components, including the stable bootstrap loading state and anonymous redirect with safe `next`
- [x] 3.5 Create the authenticated navbar with home link, accessible email truncation, pending logout state, and logout fallback behavior

## 4. Public Pages

- [x] 4.1 Replace `app/page.tsx` with the sparse responsive landing page containing only brand/context and login/register actions
- [x] 4.2 Implement the shared login/register form with labeled controlled fields, client validation, pending state, API errors, live announcements, and mode-switch links
- [x] 4.3 Add `/login` and `/register` routes using the auth shell, redirecting authenticated users to `/home`
- [x] 4.4 Add page/form tests for landing links, validation request suppression, successful navigation, API failures, authenticated redirects, and mobile-safe layout semantics

## 5. Protected Presentation Dashboard

- [x] 5.1 Add the protected `/home` route and fetch the authenticated user's presentations through the auth client with `limit=20`
- [x] 5.2 Implement loading skeletons, initial error/retry state, empty state, and populated presentation summary cards with accessible status and `<time>` metadata
- [x] 5.3 Implement cursor-based Load more behavior that appends results, prevents duplicate requests, and preserves existing items after pagination failure
- [x] 5.4 Add the empty-state primary create action and populated-state corner create action, both linking to `/slides/new`
- [x] 5.5 Add dashboard tests covering loading, empty, populated, error/retry, pagination, and create-action placement/navigation

## 6. Create Placeholder and Verification

- [x] 6.1 Add protected `/slides/new` placeholder with navbar, clear out-of-scope message, and return-to-home link
- [x] 6.2 Add protected-route and placeholder tests for anonymous redirect and authenticated rendering
- [x] 6.3 Run lint, TypeScript validation, all tests, and production build; fix accessibility, responsive, or App Router integration issues
- [x] 6.4 Manually verify landing, auth, logout, refresh-after-reload, dashboard empty/populated/error states, mobile layout, keyboard focus, and reduced-motion behavior
