# T1 — Auth (Netlify Identity)

**Read first:** `tasks/plan.md`. **Depends on:** T0 (scaffold + DB must exist).

## Goal
Add Netlify Identity login to the SPA and a function-side auth guard. Small shared team: any logged-in user can see/score the shared candidate pool.

## Build
- Integrate **Netlify Identity** in the React app (identity widget or `gotrue-js`): login, signup (invite-only is fine), logout, current-user state in a context/hook.
- **Gate the app routes** — unauthenticated users see a login screen; authenticated users see the app shell.
- `netlify/lib/auth.ts` — helper that reads `context.clientContext` (Identity injects the user when a valid Bearer token is sent) and returns the user or throws/`401`. All non-public functions call this.
- Wire the SPA's API calls to send the Identity JWT as `Authorization: Bearer <token>`.
- Expose the user's Identity `sub` so later tasks can set `candidates.created_by`.

## Acceptance
- Visiting the app while logged out shows the login gate; logging in reveals the app.
- A protected test function returns `401` without a token and `200` with a valid Identity token.
- Logout clears state and returns to the gate.
- Project gate (build/lint) green.
