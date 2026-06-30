# T3 — Enrichment pipeline

**Read first:** `tasks/plan.md`. **Depends on:** T2 (candidates + files + invoke exist).

## Goal
Implement the background function that enriches a candidate from all sources and writes `enrichment` rows, advancing `status`.

## Build
- **`netlify/functions/enrich-candidate-background.ts`** (must use the `-background` suffix so Netlify runs it as a ≤15-min background function). Receives a candidate id.
  - Set `status='enriching'`.
  - **Website** → Firecrawl adapter (clean markdown/structured). Also infer industry/business model/pricing into the `summary`.
  - **GitHub** → official GitHub API (`netlify/lib/enrichment/github.ts`): repos, collaborators, contribution/activity for the linked users/orgs. **Token is optional** — send `Authorization` only if `GITHUB_TOKEN` is set, otherwise call unauthenticated (60 req/hr/IP). Handle `403`/`429` rate-limit responses gracefully: mark that enrichment row "GitHub rate-limited" and continue — never fail the whole run on it.
  - **LinkedIn** → adapter `fetchLinkedIn`, **best-effort**; if blocked/unsupported, return null and record an `enrichment` row noting "unavailable". **Never fail the run on LinkedIn.**
  - **Files** → read from Blobs, extract text (PDF/doc), store in `candidate_files.extracted_text` and/or an `enrichment` row.
  - Write one `enrichment` row per source (`source_type`, `raw`, `summary`, `status`, `error`).
  - On completion set `status='enriched'`. Resilient: one source failing → that row `status='failed'`, others still proceed.
  - At the end, **trigger scoring** (T4). If T4 isn't built, stop at `enriched`.
- **Adapter** (`netlify/lib/enrichment/adapter.ts`) implementing the plan's `EnrichmentProvider` interface; `FirecrawlProvider` in `firecrawl.ts`. Provider selected via `ENRICHMENT_PROVIDER` env var.

## Acceptance
- Submitting a candidate with a real site + GitHub org/user reaches `status='enriched'` with populated `enrichment` rows.
- A failing/blocked source does not fail the whole run (verify by passing a bad URL).
- LinkedIn unavailable is recorded gracefully.
- Project gate green.
