## Why

SLAI has complete authentication and presentation APIs but still shows the default Next.js starter screen, so users cannot complete the core workflow through the browser. A focused, minimal frontend is needed to establish the public entry point, authentication flow, and presentation dashboard before adding the full creation/editor experience.

## What Changes

- Replace the starter page with a sparse public landing page containing the SLAI identity and clear login/register actions.
- Add responsive login and registration pages with client validation, API error feedback, loading states, and links between both flows.
- Add a client authentication session that bootstraps from the HttpOnly refresh cookie, keeps access tokens out of persistent browser storage, and redirects users according to authentication state.
- Add a protected `/home` dashboard that lists the authenticated user's presentations with lifecycle and update metadata.
- Add a prominent centered create action when the list is empty and a visible corner create action when presentations exist.
- Add a shared authenticated navbar showing the current user's email and an idempotent logout action.
- Add a placeholder `/slides/new` destination so every create action has a valid route while the creation wizard remains out of scope.
- Update global metadata and styling to a restrained, high-contrast simplified visual system that works on desktop and mobile.

## Capabilities

### New Capabilities

- `simplified-web-frontend`: Covers public landing, browser authentication state, login/registration forms, protected navigation, presentation dashboard states, and responsive visual/accessibility behavior.

### Modified Capabilities

None.

## Impact

- Replaces the current `app/page.tsx` starter content and updates the root layout/global CSS.
- Adds App Router pages, route groups/layouts, shared React components, client auth/data utilities, and component/page tests.
- Consumes existing auth and presentation APIs without changing their external contracts.
- Introduces no third-party UI framework or persistent client token storage; Tailwind CSS and native browser APIs remain sufficient.
