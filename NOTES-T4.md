# T4 — Scoring (Netlify AI Gateway): status & verification

## Done (automated)
- **`netlify/lib/scoring-prompt.ts`** — versioned prompt (`PROMPT_VERSION = 'v1'`) with the user's
  positive/negative factor rubric; instructs strict-JSON output `{score, rationale:[{factor,sentiment,weight,detail}]}`.
- **`netlify/lib/scoring.ts`** — `scoreCandidate(id)`:
  - sets `status='scoring'`, builds a prompt from the candidate + `enrichment` rows
  - calls OpenAI via Netlify AI Gateway's OpenAI-compatible REST endpoint using the
    Gateway-injected `OPENAI_API_KEY` + `OPENAI_BASE_URL`; model `gpt-5.5`
    (override `OPENAI_MODEL`)
  - `parseScoreJson()` defensively extracts/validates the JSON (strips fences, clamps score 0-100,
    normalizes rationale); handles `stop_reason: 'refusal'`
  - inserts a new `scores` row, sets `status='scored'`; on failure → `status='failed'` + error
- **`netlify/functions/score-candidate-background.ts`** — `-background` fn (≤15 min) that runs scoring;
  triggered at the end of enrichment (T3) and by rescore.
- **Rescore endpoint** — `POST /api/candidates/:id/rescore` (auth-gated) sets `scoring` and fires the
  background fn; each run inserts a fresh `scores` row (history preserved).
- ✅ `npm run typecheck` clean · ✅ `npm run build` green.

## Needs AI Gateway to run
- **Deployed:** enable **AI Gateway** on the Netlify project — it injects `OPENAI_API_KEY` +
  `OPENAI_BASE_URL`, billed via Netlify credits. No project-owned OpenAI key is required.
- **Local (`netlify dev`):** use Netlify Dev against a deploy with AI Gateway available, or expect
  scoring to fail clearly with a missing `OPENAI_*` Gateway env error.

## Verify (after DB + enrichment working, and a key/Gateway available)
```bash
netlify dev
# Create a candidate, let it reach `enriched` — scoring auto-fires and it advances to `scored`.
# Or re-score on demand:
curl -X POST -H "Authorization: Bearer <JWT>" http://localhost:8888/api/candidates/<id>/rescore
```
Then check the DB:
```sql
select score, model, prompt_version, jsonb_array_length(rationale) as factors
from scores where candidate_id = '<id>' order by created_at desc;
```
Expect a row with a 0-100 score and a non-empty rationale array; candidate `status='scored'`.
Confirm AI Gateway usage shows in the Netlify dashboard (when deployed).

## Top concern (unverified until live)
The model call runs only with a real key/Gateway, so the end-to-end scoring path is untested here. Two
things to watch on first run: (1) whether adaptive thinking + the strict-JSON instruction reliably yields
parseable JSON — `parseScoreJson` is defensive (fence-stripping, brace-extraction) but a refusal or a very
chatty response still fails closed to `status='failed'`; (2) AI Gateway must actually be enabled on the
project or the deployed call 401s. Both surface clearly as a `failed` candidate with the error stored.
