# T4 — Scoring (Netlify AI Gateway)

**Read first:** `~/.claude/plans/i-want-to-build-hashed-tulip.md`. **Depends on:** T3 (enriched data exists).

## Goal
Score an enriched candidate 0–100 with a structured, reason-by-reason rationale, using the Anthropic SDK through Netlify AI Gateway.

## Build
- **`netlify/lib/scoring-prompt.ts`** — versioned system prompt (export `PROMPT_VERSION` + the prompt string). Seed v1 factors from the user's examples: positive = technical founder, ex-prestigious company (e.g. Microsoft), prestigious school; negative = business highly automatable / at risk from AI. Instruct the model to return **strict JSON**: `{ score: number, rationale: [{ factor, sentiment: "+"|"-", weight, detail }] }`.
- **`netlify/lib/scoring.ts`** — uses the **Anthropic SDK** (relies on AI-Gateway-injected `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`; do not hardcode keys). Use the latest Claude model. Pass the candidate's `enrichment` rows as input. Parse/validate the JSON defensively (reject/repair non-conforming output).
- Set `status='scoring'` before the call; on success insert a **new `scores` row** (`score`, `model`, `prompt_version`, `rationale`) and set `status='scored'`.
- Trigger this from the end of T3's background function, **and** expose a standalone **`POST /candidates/:id/rescore`** endpoint (re-scoring inserts a new `scores` row — keep history).
- If the enrich→score chain risks exceeding 15 min, split scoring into its own `-background` function triggered off `status='enriched'` (see plan's self-critique).

## Acceptance
- An enriched candidate gets a `scores` row with a numeric score and a non-empty rationale array.
- Malformed model output is handled without crashing.
- Re-score creates an additional `scores` row.
- AI Gateway usage appears in the Netlify dashboard.
- Project gate green.
