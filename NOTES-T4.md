# T4 — Scoring (Netlify AI Gateway): status & verification

## Done (automated)
- **`netlify/lib/scoring-prompt.ts`** — versioned prompt (`PROMPT_VERSION = 'v1'`) with the user's
  positive/negative factor rubric; instructs strict-JSON output `{score, rationale:[{factor,sentiment,weight,detail}]}`.
- **`netlify/lib/scoring.ts`** — `scoreCandidate(id)`:
  - sets `status='scoring'`, builds a prompt from the candidate + `enrichment` rows
  - calls Anthropic via the SDK (`new Anthropic()` → AI-Gateway-injected key/base-url on deploy),
    model `claude-opus-4-8` (override `ANTHROPIC_MODEL`), adaptive thinking
  - `parseScoreJson()` defensively extracts/validates the JSON (strips fences, clamps score 0-100,
    normalizes rationale); handles `stop_reason: 'refusal'`
  - inserts a new `scores` row, sets `status='scored'`; on failure → `status='failed'` + error
- **`netlify/functions/score-candidate-background.ts`** — `-background` fn (≤15 min) that runs scoring;
  triggered at the end of enrichment (T3) and by rescore.
- **Rescore endpoint** — `POST /api/candidates/:id/rescore` (auth-gated) sets `scoring` and fires the
  background fn; each run inserts a fresh `scores` row (history preserved).
- ✅ `npm run typecheck` clean · ✅ `npm run build` green.

## Needs AI Gateway (deploy) or a local key to run
- **Deployed:** enable **AI Gateway** on the Netlify project — it injects `ANTHROPIC_API_KEY` +
  `ANTHROPIC_BASE_URL`, billed via Netlify credits. Nothing else to configure.
- **Local (`netlify dev`):** the Gateway isn't injected locally, so set your own `ANTHROPIC_API_KEY`
  in `.env` to test scoring against the Anthropic API directly.

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
