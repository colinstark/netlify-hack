# T1 — Auth (Netlify Identity): status & manual steps

## Done (automated)
- `netlify-identity-widget` + types installed.
- `src/auth/identity.tsx` — `AuthProvider` + `useAuth()` (user, ready, login, logout, getToken).
- App is **fully gated**: no session → login gate (`src/routes/Login.tsx`); session → app shell with email + log-out.
- `src/api.ts` — `apiFetch()` attaches `Authorization: Bearer <jwt>` (used by T2+).
- `netlify/lib/auth.ts` — `getUser` / `requireUser(context)` / `unauthorizedResponse()` (legacy-handler form, reads `context.clientContext.user`).
- `netlify/functions/me.ts` — auth-gated example: 401 without token, 200 `{id,email}` with token.
- ✅ `npm run typecheck` clean · ✅ `npm run build` green.

## TODO — you must do this (Netlify dashboard, can't be done headlessly)
1. **Enable Identity** on the site: Netlify dashboard → your site → **Identity → Enable Identity**.
   (Identity is supported again after the Feb 2026 deprecation reversal.)
2. Set registration to **Invite only** (recommended for an internal scout tool), then invite your team.
3. Identity must be reachable from the app origin — run locally with **`netlify dev`** (NOT plain `vite`),
   which proxies the Identity endpoint. The widget won't authenticate under a bare Vite server.

## Verify (after T0's DB step + Identity enabled)
```bash
netlify dev
# Browser: app shows the login gate → "Log in / Sign up" opens the Identity modal → after login, app shell appears.

# Guard returns 401 without a token:
curl -i http://localhost:8888/.netlify/functions/me            # → 401 {"error":"Authentication required"}
# With a valid token (copy a fresh JWT from the app / netlifyIdentity.refresh()):
curl -i -H "Authorization: Bearer <JWT>" http://localhost:8888/.netlify/functions/me   # → 200 {"id":...,"email":...}
```

## Notes / follow-ups
- `apiFetch` calls `refresh()` per request; fine for MVP, could be cached if it adds latency.
- Whole-app gate chosen (shared-team model). For public pages later, switch to a per-route `RequireAuth`.
- `me.ts` uses the legacy handler (needed for `clientContext.user`); `health.ts` stays on the modern API. Intentional.
