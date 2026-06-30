# T0 — Foundation & scaffold

**Read first:** `tasks/plan.md` (full architecture, data model, file layout).

**This task blocks all others. Nothing else can start until this is green.**

## Goal
Stand up the empty Netlify-native project skeleton: Vite React SPA + Netlify config + Netlify DB (Postgres/Neon) with Drizzle schema & first migration + Blobs helper + shared types. App boots, DB is migrated, `netlify dev` runs clean.

## Build
- **Vite React + TypeScript** SPA in `/src` (basic shell + router; routes can be placeholders: `/login`, `/new`, `/`, `/candidate/:id`).
- `netlify.toml` — publish `dist`, functions dir `netlify/functions`, edge functions dir `netlify/edge-functions`.
- **Netlify DB**: provision via the Netlify CLI/integration. Add **Drizzle** (`drizzle-orm`, `drizzle-kit`, Neon serverless driver). DB client in `netlify/lib/db/`.
- **Schema + migration** for all four tables exactly as specified in the plan: `candidates`, `candidate_files`, `enrichment`, `scores`. Generate and apply the first migration to `/db`.
- **Blobs helper** in `netlify/lib/blobs.ts` (get store, put/get/delete by key).
- **Shared types** (`netlify/lib/types.ts` or `src/types.ts` shared): `Candidate`, `CandidateFile`, `Enrichment`, `Score`, and the `EnrichmentProvider` interface from the plan.
- **Env scaffolding**: `.env.example` with `TINYFISH_API_KEY`, `ENRICHMENT_PROVIDER` (default `tinyfish`), and an **optional** `GITHUB_TOKEN` (commented out — GitHub works unauthenticated at 60 req/hr/IP; token only needed for headroom). Document that AI Gateway injects `ANTHROPIC_*` automatically.

## Acceptance
- `netlify dev` boots the SPA with no errors and functions load.
- `drizzle-kit` migration applied; the four tables exist in Netlify DB.
- A trivial `GET` function can query the DB and return a row count.
- `npm run build` (or project gate) is green.

## Notes
- Use the latest Claude model later for scoring — don't hardcode model choices here.
- Keep it minimal; auth, forms, pipeline come in later tasks. Do **not** build features beyond the skeleton.
