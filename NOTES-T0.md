# T0 — Foundation: status & manual steps

## Done (automated)
- Vite React + TS SPA in `src/` with placeholder routes (`/`, `/new`, `/candidate/:id`, `/login`).
- `netlify.toml` (publish `dist`, functions `netlify/functions`, SPA fallback redirect).
- Drizzle wired up: schema at `netlify/lib/db/schema.ts`, client at `netlify/lib/db/index.ts`.
- **Migration generated** for all four tables → `db/0000_*.sql` (NOT yet applied — needs a DB).
- Netlify Blobs helper (`netlify/lib/blobs.ts`), shared types (`netlify/lib/types.ts` incl. `EnrichmentProvider`; `src/types.ts` for the frontend).
- Health function at `GET /api/health` (`netlify/functions/health.ts`) — returns candidate row count.
- `.env.example` with Tinyfish + optional GitHub token + AI Gateway notes.
- ✅ `npm run typecheck` clean · ✅ `npm run build` green.

## TODO — you must run these (need interactive Netlify auth)
The Netlify DB can't be provisioned headlessly. Run:

```bash
netlify login                 # opens browser
netlify link                  # or `netlify init` to create the site
netlify db init               # provisions the Neon Postgres DB + injects NETLIFY_DATABASE_URL
npm run db:migrate            # applies db/0000_*.sql to the new database
```

Then verify end-to-end:

```bash
netlify dev                   # boots SPA + functions, loads injected env vars
curl http://localhost:8888/api/health
# expect: {"ok":true,"candidates":0}
```

If `npm run db:migrate` can't see the URL locally, pull env first: `netlify env:list` / run via `netlify dev`, or set `DATABASE_URL` in a local `.env` (gitignored).

## Acceptance still pending on the above
- [ ] DB provisioned + migration applied (4 tables exist)
- [ ] `/api/health` returns `{ ok: true, candidates: 0 }` under `netlify dev`

Everything else for T0 is complete. Next tasks: T1 (auth), T2 (form+ingest), T6 (i18n) can run in parallel.
