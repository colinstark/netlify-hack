# VC Scout — Candidate Ingestion & Scoring (Netlify-native)

## Context

A VC scout needs a tool to (1) **ingest** potential candidate companies/founders (title, URL, LinkedIn/GitHub links, PDFs/docs), (2) **enrich** them by crawling the site, querying GitHub, attempting LinkedIn, and inferring industry/business model/pricing, then (3) **score** each candidate 0–100 with a detailed, reason-by-reason report (e.g. "+ technical founder, ex-Microsoft, prestigious school" / "− business is highly automatable / AI-displaceable").

Hard constraint: **everything runs on Netlify primitives** wherever one exists. The only unavoidable external dependency is scraping — **Netlify has no scraping API** (confirmed), so company-site/LinkedIn enrichment goes through a third party behind a pluggable adapter. GitHub uses the official GitHub API (no scraping).

**Decisions (from user):** Auth = Netlify Identity · Scope = small team, shared candidate pool · Enrichment = Firecrawl + pluggable adapter (LinkedIn best-effort) · Frontend = Vite React SPA.

## Netlify primitive → responsibility map

| Need | Netlify primitive | Notes |
|---|---|---|
| Frontend | Static deploy (Vite React SPA) | `/dist` published |
| Login | **Netlify Identity** | Reversed its deprecation Feb 2026; widget on FE, `context.clientContext` in functions |
| App DB | **Netlify DB** (serverless Postgres / Neon, GA Apr 2026) | candidates, enrichment, scores |
| File storage | **Netlify Blobs** | uploaded PDFs/docs |
| Sync API | **Functions** (10s limit) | CRUD: create candidate, list, get report |
| Crawl + score pipeline | **Background Functions** (up to 15 min) | long-running enrich + score |
| Scoring LLM | **AI Gateway** | Anthropic SDK; `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL` auto-injected, billed via Netlify credits |
| Language switch | **Edge Function** | geo/`Accept-Language` → de/en/es |
| Website/LinkedIn enrichment | **External (Firecrawl)** behind adapter | not a Netlify feature |

## Architecture / data flow

```
[React SPA] --Identity JWT--> [Functions]
   create candidate ─► POST /candidates (sync fn): write row (status=pending),
                       upload files ─► Blobs, then fire background fn
                                            │
                       [enrich-candidate-background] (≤15m):
                         • website  → Firecrawl adapter
                         • github   → GitHub REST/GraphQL (repos, collaborators, activity)
                         • linkedin → adapter (best-effort, may no-op)
                         • files    → read from Blobs, extract text
                         → write `enrichment` rows, status=enriched
                         → call [score-candidate] (AI Gateway, Anthropic)
                         → write `scores` row (score + rationale jsonb), status=scored
   poll GET /candidates/:id ◄── FE shows live status, then report
```

## Data model (Netlify DB / Postgres, via Drizzle)

- **candidates**: `id`, `title`, `project_url`, `linkedin_urls jsonb`, `github_urls jsonb`, `notes`, `created_by` (Identity `sub`), `status` (`pending|enriching|enriched|scoring|scored|failed`), `error`, `created_at`, `updated_at`. *Shared pool — no per-user isolation; `created_by` is informational.*
- **candidate_files**: `id`, `candidate_id`, `blob_key`, `filename`, `content_type`, `size`, `extracted_text`.
- **enrichment**: `id`, `candidate_id`, `source_type` (`website|github|linkedin|file`), `raw jsonb`, `summary`, `status`, `error`, `fetched_at`.
- **scores**: `id`, `candidate_id`, `score int`, `model`, `prompt_version`, `rationale jsonb` (array of `{factor, sentiment, weight, detail}`), `created_at`. *Keep history — re-scoring inserts a new row.*

## Enrichment adapter contract

Single interface so providers are swappable (satisfies "pluggable"):
```ts
interface EnrichmentProvider {
  fetchWebsite(url): Promise<{ raw; summary }>;
  fetchLinkedIn(url): Promise<{ raw; summary } | null>; // null = unsupported/blocked
}
```
- `FirecrawlProvider` — implements `fetchWebsite` (markdown/structured), `fetchLinkedIn` best-effort.
- GitHub is its own module (`github.ts`) using official API — not part of the scrape adapter.
- **LinkedIn risk noted:** anti-bot + ToS; treat as best-effort, never block the pipeline on it, surface "LinkedIn unavailable" in the report.
- Provider chosen via env var so TinyFish/Linkup can be dropped in later.

## Scoring

- Function calls Anthropic SDK through AI Gateway (latest Claude model). System prompt is **versioned** (`prompt_version`) and lives in `netlify/lib/scoring-prompt.ts` so it can be iterated/tested independently.
- Prompt instructs: return strict JSON `{ score, rationale: [{factor, sentiment:+/-, weight, detail}] }`. v1 factors seeded from user's examples (technical founder, prestigious company/school = positive; automatable / AI-displaceable business = negative). Validate/parse JSON defensively.

## i18n (edge function)

- Edge function on the SPA route: detect `Accept-Language` / Netlify geo → set a `lang` cookie / rewrite, default English; locales **de / en / es**.
- FE reads locale, loads JSON message catalog (`/locales/{de,en,es}.json`). Manual override (lang switcher) persists to cookie.

## File layout (target)

```
/                      vite.config.ts, netlify.toml, drizzle.config.ts, package.json
/src                   React SPA (routes: login, new candidate, list, report)
/src/locales           de.json, en.json, es.json
/netlify/functions     candidates.ts (CRUD), enrich-candidate-background.ts
/netlify/edge-functions i18n.ts
/netlify/lib           db (drizzle schema/client), auth.ts, blobs.ts,
                       enrichment/ (adapter, firecrawl, github, files),
                       scoring.ts, scoring-prompt.ts
/db                    drizzle migrations
```

---

## Tasks (each fireable in its own session)

> Sequence: **T0 first.** Then T1/T2/T6 can run in parallel. T3→T4→T5 are a chain. Each task starts by reading this plan file.

### T0 — Foundation & scaffold  *(blocks everything)*
Vite React + TS SPA; `netlify.toml`; provision **Netlify DB**; Drizzle schema + first migration for all four tables; Netlify Blobs helper; shared TS types (`Candidate`, `Enrichment`, `Score`, adapter interface); `netlify dev` runs locally; env var scaffolding (Firecrawl key, provider selector). **Deliverable:** empty app boots, DB migrated, `netlify dev` green.

### T1 — Auth (Netlify Identity)  *(needs T0)*
Identity widget in React; login/logout; gate app routes; `netlify/lib/auth.ts` helper that reads `context.clientContext` and rejects unauthenticated function calls. **Deliverable:** unauthenticated users hit a login gate; functions reject anonymous calls.

### T2 — Input form + ingest  *(needs T0; auth-gate once T1 lands)*
"New candidate" form (title, project URL, repeatable LinkedIn/GitHub URL fields, notes, file upload). `POST /candidates` sync function: validate, write row (`status=pending`), stream files → Blobs + `candidate_files` rows, then invoke the enrichment background function. List view of candidates with live status. **Deliverable:** submitting the form creates a candidate + files and kicks off the pipeline.

### T3 — Enrichment pipeline  *(needs T2)*
`enrich-candidate-background.ts`: orchestrate website (Firecrawl adapter) + GitHub API (repos, collaborators, contribution/activity) + LinkedIn (best-effort) + file text extraction; write `enrichment` rows; update `status`. Implement adapter interface + `FirecrawlProvider` + `github.ts`. Resilient: one source failing doesn't fail the whole run. **Deliverable:** a submitted candidate reaches `status=enriched` with populated `enrichment` rows.

### T4 — Scoring (AI Gateway)  *(needs T3)*
`scoring.ts` + versioned `scoring-prompt.ts`; call Anthropic via AI Gateway with enrichment as input; parse/validate strict-JSON result; write `scores` row; `status=scored`. Chain from end of T3 (or standalone re-score endpoint). **Deliverable:** enriched candidate gets a numeric score + structured rationale.

### T5 — Report & dashboard UI  *(needs T4)*
Candidate detail page: big score, rationale grouped by + / −, raw enrichment (site summary, GitHub stats, LinkedIn status, file extracts), re-score button. Dashboard list sortable by score/status. **Deliverable:** end-to-end visible report.

### T6 — i18n edge function + catalogs  *(needs T0; independent of pipeline)*
`netlify/edge-functions/i18n.ts` (Accept-Language/geo → de/en/es, cookie persistence); locale JSON catalogs; FE message loading + language switcher. **Deliverable:** app renders in de/en/es with auto + manual selection.

---

## Verification (end-to-end)

1. `netlify dev` → app boots, login gate works (T1).
2. Submit a real candidate (e.g. a known startup site + a GitHub org + a LinkedIn URL + a PDF). Row appears `pending`.
3. Watch status progress `pending → enriching → enriched → scoring → scored` (poll/refresh).
4. Open report: score present, rationale lists +/− factors, GitHub stats populated, website summarized, LinkedIn shows result-or-unavailable, PDF text extracted.
5. Hit re-score → new `scores` row, updated report.
6. Switch `Accept-Language`/cookie → UI in de/es/en.
7. Confirm AI Gateway usage shows in Netlify dashboard; confirm DB rows + Blobs objects exist.

## Top concern (self-critique)

LinkedIn enrichment is the weakest link — it may simply not work reliably or at all without violating ToS. The plan deliberately makes it best-effort and non-blocking so the product is fully functional without it; if LinkedIn is actually important, that's a candidate for TinyFish (agentic) and should be decided before T3 rather than discovered during it. Secondary risk: the enrich→score chain could exceed the 15-min background-function window for candidates with many large sources — if that shows up, split scoring into its own background function triggered by a `status=enriched` poll rather than chaining inline.
