# VC Scout — Task Queue

Each `T*.md` file in this folder is a **self-contained prompt** you can paste into a fresh Claude Code session. They all reference the approved plan at:

`tasks/plan.md`

## Order & dependencies

```
T0  Foundation & scaffold      ← do this first, blocks everything
 ├─ T1  Auth (Netlify Identity)        ┐
 ├─ T2  Input form + ingest            │  can run in parallel after T0
 └─ T6  i18n edge function             ┘
T2 ─► T3  Enrichment pipeline ─► T4  Scoring ─► T5  Report & dashboard   (chain)
```

- **T0** must complete before anything else.
- After T0: **T1, T2, T6** can run in parallel sessions.
- **T3 → T4 → T5** is a strict chain (each needs the previous).
- T2 should be auth-gated once T1 lands (note in T2).

## How to run one
Open a new session in this repo and paste the contents of the task file (or say "read tasks/T3-enrichment.md and do it"). Start each session by reading the plan file for full architecture context.
