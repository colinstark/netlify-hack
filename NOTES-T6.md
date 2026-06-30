# T6 — i18n edge function + catalogs: status & verification

## Done (automated)
- **Edge function** (`netlify/edge-functions/i18n.ts`, Deno, typed via `@netlify/edge-functions`):
  - Priority detection: `lang` cookie → `Accept-Language` (q-value parsed) → Netlify geo country code → `en`.
  - Resolves to one of `de` / `en` / `es`; seeds a `lang` cookie (1 year, SameSite=Lax) on the first document request only — never overwrites an explicit choice.
  - Runs on `path: "/*"` with `excludedPath: ["/api/*", "/.netlify/*"]`; bails on non-HTML requests so static assets and API traffic pass through untouched.
  - Country→locale map covers DACH + LI/LU/BE → de, all major Spanish-speaking → es, EN-speaking → en.
- **Locale catalogs** `src/locales/{de,en,es}.json` — every user-facing string incl. status badges.
- **FE i18n** (`src/i18n/index.tsx`): `I18nProvider` + `useI18n()` + `t(key, params?)` with `{param}` interpolation; `TranslationKey` derived from `en.json` for compile-time key checks; locale read from cookie (seeded by the edge fn).
- **Language switcher** (`src/components/LanguageSwitcher.tsx`): endonymic labels (Deutsch/English/Español), writes the `lang` cookie and re-renders; placed in the top nav + on the login gate. CSS added.
- All routes translated: `App`, `Login`, `NewCandidate`, `CandidateList` (incl. dynamic `status.*` badges), `CandidateReport`.
- `@netlify/edge-functions` added as a devDependency (types only — the runtime ships with Netlify).
- ✅ `npm run typecheck` clean · ✅ `npm run build` green.

## How locale resolution works end-to-end
1. First visit: edge fn detects from `Accept-Language`/geo → sets `Set-Cookie: lang=<locale>` on the HTML response → browser stores it → SPA reads `document.cookie` and renders that locale.
2. Manual switch: switcher calls `setLocale(code)` → React re-renders in the new locale AND writes the cookie, so reloads keep it.
3. Reload: edge fn sees the cookie, skips detection (cookie wins), passes through.

## TODO — you must do this (Netlify dashboard, can't be done headlessly)
1. **Edge Functions** are on by default on paid plans; on the free tier confirm the site has Edge Functions enabled (Site → Integrations / Functions). No env vars needed.
2. Edge functions are not fully emulated by `netlify dev` for geo/cookie wiring — **a deployed preview is the real test** for `context.geo` and `Accept-Language` detection. Locally `netlify dev` will run the function but geo may be empty, so only the cookie + Accept-Language paths exercise locally.

## Verify
```bash
netlify dev
# 1. App boots in English (browser default).
# 2. Click "Español" in the nav → entire UI switches to Spanish; reload stays Spanish.
# 3. Click "Deutsch" → switches to German.
# 4. In devtools: Application → Cookies → `lang` reflects the current locale.

# Test Accept-Language detection (deployed preview):
curl -sI -H 'Accept-Language: es' <deploy-url>/ | grep -i 'set-cookie'
# expect: set-cookie: lang=es; ...
curl -sI -H 'Accept-Language: de-DE,de;q=0.9' <deploy-url>/ | grep -i 'set-cookie'
# expect: set-cookie: lang=de; ...
# Geo detection needs a real external request (e.g. from a VPN) — covered by the country map.
```

## Decisions / follow-ups
- **In-file `config` over `netlify.toml` `[[edge_functions]]`**: the task said "configure its path in netlify.toml", but in-file config supports `excludedPath` (toml declarations don't). Used in-file + a documenting comment in `netlify.toml`. Same net effect, cleaner routing of API traffic.
- `t()` is typed off `en.json`; the `CandidateList` status badge uses a template literal `t(\`status.${c.status}\`)` which TS narrows against `CandidateStatus` — no cast needed.
- Catalogs are statically imported (bundled, ~tiny). If message volume grows, switch to dynamic `import()` per locale.
- No SSR locale flash fix (e.g. edge HTMLRewriting `<html lang>`) — acceptable for a client-rendered SPA; React picks the locale synchronously on mount from the cookie.
- `report.body` keeps the T5 placeholder; the `<code>` wrapper around `{id}` was dropped in favour of `{id}` interpolation. T5 can restyle freely.
