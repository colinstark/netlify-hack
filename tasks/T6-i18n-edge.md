# T6 — i18n edge function + catalogs

**Read first:** `tasks/plan.md`. **Depends on:** T0 only (independent of the pipeline — can run in parallel with T1–T5).

## Goal
Auto-switch UI language between **German, English, Spanish** via a Netlify Edge Function, with a manual override.

## Build
- **`netlify/edge-functions/i18n.ts`** — on the SPA route, detect locale from `Accept-Language` header and/or Netlify geo context; resolve to one of `de` / `en` / `es` (default `en`); persist choice in a `lang` cookie. Configure its path in `netlify.toml`.
- **Locale catalogs**: `src/locales/{de,en,es}.json` with the app's UI strings.
- **FE message loading**: read the resolved locale (cookie/context), load the matching catalog, render strings through a small `t()` helper/hook.
- **Language switcher** in the UI that sets the `lang` cookie and re-renders.

## Acceptance
- Changing `Accept-Language` (or the `lang` cookie) renders the app in de/en/es.
- Manual switcher overrides detection and persists across reloads.
- Default falls back to English.
- Project gate green.
