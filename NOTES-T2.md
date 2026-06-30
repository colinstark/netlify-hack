# T2 — Input form + ingest: status & verification

## Done (automated)
- **Form** (`src/routes/NewCandidate.tsx`): title, project URL, repeatable LinkedIn + GitHub URL lists, notes, multi-file upload. Files are read as base64 and sent in the JSON body.
- **`/api/candidates` function** (`netlify/functions/candidates.ts`, legacy handler, auth-gated via `requireUser`):
  - `POST` → validate, insert candidate (`status='pending'`, `created_by` = Identity sub), write each file to Blobs + `candidate_files` row, then fire the enrichment trigger. Returns 201 + candidate.
  - `GET /api/candidates` → list (newest first).
  - `GET /api/candidates/:id` → single candidate (404 if missing).
- **Enrichment trigger** (`netlify/lib/enrichment/trigger.ts`): fire-and-forget POST to `enrich-candidate-background`; 404/errors swallowed so ingest never fails before T3 exists.
- **List view** (`src/routes/CandidateList.tsx`): loads candidates, polls every 4s, status badges, links to report.
- ✅ `npm run typecheck` clean · ✅ `npm run build` green.

## Blocked on the T0 DB step for live verification
Ingest writes to the DB, so you need the database provisioned first (see NOTES-T0.md):
```bash
netlify login && netlify link && netlify db init && npm run db:migrate
netlify dev
```
Then, signed in:
1. `/new` → fill title (required) + a URL or two + attach a small PDF → **Create candidate**.
2. Redirects to `/` → new candidate appears with a `pending` badge.
3. Confirm rows exist: a `candidates` row, `candidate_files` row(s), and a Blobs object per file.
4. `enrich-candidate-background` will 404 until T3 — expected, ingest still succeeds.

## Top concern (unverified until live)
`candidates.ts` is a **legacy handler with `config.path`**. The auth guard relies on Netlify
populating `context.clientContext.user` from the Bearer JWT. This is the documented behaviour, but
I haven't confirmed it works *together with* `config.path` routing on a live deploy. First `netlify dev`
run is the check — if `me`/`candidates` 401 even with a valid token, drop `config.path` and call the
function at `/.netlify/functions/candidates` (adjust the frontend paths), or verify the JWT manually.

## Limitations / follow-ups
- Files go base64-in-JSON → bounded by the ~6 MB sync-function body limit. Large decks would need a
  direct-to-Blobs upload (signed URL) later.
- List polls every 4s unconditionally; could pause when nothing is active.
