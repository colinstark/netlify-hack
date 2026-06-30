# T3 — Enrichment pipeline: status & verification

## Done (automated)
- **`netlify/functions/enrich-candidate-background.ts`** (`-background` → ≤15 min). Reads `{candidateId}`:
  - sets `status='enriching'`
  - **website** → provider.fetchWebsite (Tinyfish by default; Firecrawl still available)
  - **github** (per URL) → `enrichGitHub` (official API)
  - **linkedin** (per URL) → provider.fetchLinkedIn, best-effort → `unavailable` when blocked
  - **files** → `extractFileText` from Blobs (PDF via unpdf, text/* decoded), saved to `candidate_files.extracted_text`
  - writes one `enrichment` row per source; isolated try/catch per source (one failure ≠ run failure)
  - sets `status='enriched'`, then fires the scoring trigger (T4, swallowed)
- **Adapter**: `netlify/lib/enrichment/adapter.ts` (`getProvider()` via `ENRICHMENT_PROVIDER`) + `tinyfish.ts` (`TinyfishProvider`), `brightdata.ts` (`BrightDataProvider` for LinkedIn/GitHub/Crunchbase datasets), and `firecrawl.ts` (`FirecrawlProvider` fallback).
- **GitHub**: `github.ts` — token optional; `403/429` → row `unavailable` "GitHub rate-limited", never fails the run.
- **Files**: `files.ts` — `unpdf` for PDFs; docx intentionally returns '' (later enhancement).
- ✅ `npm run typecheck` clean (covers functions) · ✅ `npm run build` green.

## Deliberate deviation from the task wording
The task says "infer industry/business model/pricing into the summary." That inference is an LLM job, so
the **summary is a trimmed page excerpt** here and the real inference is done by the LLM at **T4** (which
reads `enrichment.raw`). Keeps the adapter LLM-free and the responsibilities clean.

## Needs your keys / live env to verify
- **Tinyfish**: set `TINYFISH_API_KEY` (Netlify env or local `.env`). Without it, website/LinkedIn rows
  come back `failed`/`unavailable` but the pipeline still completes → `enriched`.
- **BrightData**: set `ENRICHMENT_PROVIDER=brightdata` and `BRIGHTDATA_API_KEY` to use BrightData for
  LinkedIn and GitHub URL lookups while Tinyfish still handles the generic website crawl. Crunchbase also
  requires `BRIGHTDATA_CRUNCHBASE_DATASET_ID`.
- **Firecrawl fallback**: set `ENRICHMENT_PROVIDER=firecrawl` and `FIRECRAWL_API_KEY`.
- GitHub works with no token (60/hr). Set `GITHUB_TOKEN` only for headroom.

## Verify (after DB provisioned + Tinyfish key)
```bash
netlify dev
# Create a candidate via /new with a real site + a github.com/<org-or-repo> URL + a small PDF.
# Watch the list badge go pending -> enriching -> enriched.
```
Then check the DB:
```sql
select source_type, status, left(summary,80) from enrichment where candidate_id = '<id>';
select filename, length(extracted_text) from candidate_files where candidate_id = '<id>';
```
Expect: a `website` row (ok if key set), `github` row(s) ok/unavailable, `linkedin` row(s) usually
`unavailable`, `file` row(s) ok with extracted text. `score-candidate-background` 404s until T4 — expected.

## Top concern (unverified until live)
`unpdf` bundles pdf.js; serverless bundlers occasionally trip on it (worker/asset resolution). It typechecks
and builds, but the real check is a PDF extraction running under `netlify dev`/deploy. If it errors at runtime,
fallback options: pin a pdf.js-legacy build, or move file extraction to a separate step. Secondary: the
Tinyfish fetch response shape is assumed `{ results: [{ text }], errors: [] }`; if their API differs,
website rows fail gracefully.
