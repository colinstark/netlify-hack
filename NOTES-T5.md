# T5 — Report & dashboard UI: status & verification

## Done (automated)
- **Backend — composite report** (`netlify/functions/candidates.ts`): `GET /api/candidates/:id` now returns
  `{ candidate, latestScore, scoreHistory[], enrichment[], files[] }` (candidate row + newest score + full
  score history + enrichment rows + file rows) in one call. `rescore`/list routes unchanged.
- **Backend — list carries latest score**: `GET /api/candidates` attaches `latestScore` to each candidate row
  so the dashboard can sort by score. Resolved newest-first in-memory per `candidateId` (the Drizzle version
  in this project exposes distinct-on via `db.selectDistinctOn(...)`, but the in-memory dedupe is version-
  robust and trivial for the shared small-team pool).
- **Types** (`netlify/lib/types.ts` + `src/types.ts`): added `CandidateReport` composite (backend) and the
  matching `CandidateReport`, `Enrichment`, `CandidateFile`, `CandidateListItem` FE types (added `error` to
  the FE `Candidate` so failures surface).
- **Candidate detail page** (`src/routes/CandidateReport.tsx`):
  - Prominent color-coded **score** (0–100, green/accent/red tiers) with model + timestamp.
  - **Rationale** split into two cards: **Strengths (+)** and **Risks (−)**, each item showing `factor · weight · detail`.
  - **Enrichment** cards per source (Website / GitHub / LinkedIn) with status badge, summary, and raw JSON
    behind a collapsible `<details>`; LinkedIn `unavailable` status shows the localized "Unavailable".
  - **Uploaded files** with extracted text behind a collapsible (full text from `candidate_files.extractedText`).
  - **Re-score** button → `POST /api/candidates/:id/rescore`, optimistic `scoring` state, then polls the
    report every 3 s until the candidate leaves `scoring` and re-renders.
  - **Score history** list (all `scores` rows, newest first; latest highlighted).
- **Dashboard** (`src/routes/CandidateList.tsx`): sort control (Newest / Score / Status), a score pill per row
  (unscored rows show no pill), keeps the existing 4 s live-status polling.
- **i18n**: ~35 new keys added to `en`/`de`/`es.json` in sync (section labels, statuses, source names, sort
  options, rescore/history); the T6 placeholder `report.body` was replaced with real report strings.
  `TranslationKey` (derived from `en.json`) type-checks all `t()` calls.
- **Styling** (`src/index.css`): score block, two-column rationale cards, enrichment/file cards, score pill +
  history list — all using existing dark-theme tokens (`--accent`, `#6ee7a8`/`#ff8080`); responsive collapse
  on narrow screens. No new dependencies.
- ✅ `npm run typecheck` clean · ✅ `npm run build` green.

## Decisions
- **Composite `GET /:id` over a separate `/report` endpoint** — single call, simpler FE; the list endpoint
  keeps returning candidate rows (now + `latestScore`), so the `Candidate`/`CandidateListItem` split stays clean.
- **File text shown once** — T3 writes extracted text to both `candidate_files.extractedText` and a `file`-type
  `enrichment` row. To avoid duplication, the Files section reads `candidate_files.extractedText` (full text)
  and `file` rows are filtered out of the Enrichment section.
- **Latest score via in-memory dedupe** rather than `DISTINCT ON` — avoids a version-specific Drizzle chain
  method; identical result for the expected data volume.

## Verify (needs DB + Identity + a scored candidate)
```bash
netlify dev
# 1. Dashboard (/): candidates list shows score pills; Sort → Score orders high→low (unscored last),
#    Sort → Status groups by status; live polling still flips badges as the pipeline runs.
# 2. Click a scored candidate → report: big score, Strengths/Risks cards populated, enrichment cards
#    (website summary / GitHub stats / LinkedIn result-or-"Unavailable") + extracted file text.
# 3. Hit "Re-score" → button shows "Re-scoring…", polls, and the report + history update with a new row.
curl -H "Authorization: Bearer <JWT>" http://localhost:8888/api/candidates/<id> | jq .
# expect: { candidate, latestScore, scoreHistory:[…], enrichment:[…], files:[…] }
curl -H "Authorization: Bearer <JWT>" http://localhost:8888/api/candidates | jq '.[0].latestScore.score'
# expect: the latest score embedded on each list row
```

## Top concern (unverified until live)
The UI is type-clean and builds, but the end-to-end visual report depends on a candidate that has actually
reached `scored` with a populated `rationale` + enrichment rows — which requires the T4 scoring path to have
run against a real key/Gateway (see NOTES-T4). Until then the report renders the "Not scored yet" / empty
states. Also: the latest-score list query fetches all scores for the visible candidates each poll — fine for a
small shared pool, but worth switching to `db.selectDistinctOn` (or a subquery) if re-score volume grows.
