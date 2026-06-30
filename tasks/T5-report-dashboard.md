# T5 — Report & dashboard UI

**Read first:** `tasks/plan.md`. **Depends on:** T4 (scores exist).

## Goal
Surface the full candidate report and a sortable dashboard.

## Build
- **Candidate detail page** (`/candidate/:id`):
  - Prominent **score** (latest `scores` row, 0–100).
  - **Rationale** grouped by `+` (strengths) and `−` (risks), each with `factor`, `weight`, `detail`.
  - **Raw enrichment**: website summary (industry/business model/pricing), GitHub stats (repos, collaborators, activity), LinkedIn result-or-"unavailable", extracted file text.
  - **Re-score** button → calls the rescore endpoint, shows the new result; optionally show score history.
- **Dashboard** (`/`): candidate list, **sortable by score and status**, with live-ish status; click through to detail.
- Use the project's existing styling approach. Keep it clean and scannable.

## Acceptance
- A scored candidate shows a complete report (score + grouped rationale + raw enrichment).
- Dashboard sorts by score and status and links to detail.
- Re-score updates the displayed report.
- Project gate green.
