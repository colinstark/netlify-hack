# T2 — Input form + ingest

**Read first:** `tasks/plan.md`. **Depends on:** T0. **Auth-gate the function once T1 lands** (use `netlify/lib/auth.ts`).

## Goal
Let a scout submit a candidate, persist it + any files, and kick off the enrichment pipeline.

## Build
- **"New candidate" form** (`/new`): `title`, `project_url`, repeatable **LinkedIn URL** fields, repeatable **GitHub URL** fields, free-text `notes`, and **file upload** (PDF/docs, multiple).
- **`POST /candidates`** sync function (`netlify/functions/candidates.ts`):
  - Validate input.
  - Insert `candidates` row with `status='pending'`, `created_by` = Identity sub (once T1 lands).
  - Stream each uploaded file → **Netlify Blobs**, insert `candidate_files` rows (`blob_key`, `filename`, `content_type`, `size`).
  - After commit, **invoke the enrichment background function** (`enrich-candidate-background`) for this candidate id. (If T3 isn't built yet, stub the invoke so it no-ops gracefully.)
  - Return the created candidate.
- **List view** (`/`): show candidates with `status` (live-ish via poll/refresh) and link to report.
- Add `GET /candidates` (list) and `GET /candidates/:id` (single) to the same function for the list/report views.

## Acceptance
- Submitting the form creates a `candidates` row (`pending`) + `candidate_files` rows + Blobs objects.
- List view shows the new candidate with its status.
- Background function is invoked (or cleanly stubbed) on create.
- Function rejects unauthenticated calls once T1 is in.
- Project gate green.
