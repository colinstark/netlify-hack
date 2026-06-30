import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { candidates, enrichment, scores } from './db/schema';
import { PROMPT_VERSION, SYSTEM_PROMPT } from './scoring-prompt';
import type { Candidate, Enrichment, RationaleItem, Sentiment } from './types';

// Defaults to the latest, most capable Claude model; overridable per-deploy.
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';
const MAX_RAW_CHARS = 4000;

interface ScoreResult {
  score: number;
  rationale: RationaleItem[];
}

function buildUserPrompt(candidate: Candidate, rows: Enrichment[]): string {
  const lines: string[] = [
    `# Candidate: ${candidate.title}`,
    candidate.projectUrl ? `Website: ${candidate.projectUrl}` : '',
    candidate.linkedinUrls.length ? `LinkedIn: ${candidate.linkedinUrls.join(', ')}` : '',
    candidate.githubUrls.length ? `GitHub: ${candidate.githubUrls.join(', ')}` : '',
    candidate.notes ? `Scout notes: ${candidate.notes}` : '',
    '',
    '# Enrichment data',
  ].filter(Boolean);

  if (rows.length === 0) {
    lines.push('(no enrichment data was gathered)');
  }
  for (const row of rows) {
    lines.push(`\n## Source: ${row.sourceType} (status: ${row.status})`);
    if (row.summary) lines.push(`Summary: ${row.summary}`);
    if (row.error) lines.push(`Error: ${row.error}`);
    if (row.raw != null) {
      const raw = JSON.stringify(row.raw).slice(0, MAX_RAW_CHARS);
      lines.push(`Raw (truncated): ${raw}`);
    }
  }
  return lines.join('\n');
}

function normalizeRationale(item: unknown): RationaleItem | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  const sentiment: Sentiment = r.sentiment === '-' ? '-' : '+';
  const factor = typeof r.factor === 'string' ? r.factor : '';
  const detail = typeof r.detail === 'string' ? r.detail : '';
  if (!factor && !detail) return null;
  const weightNum = Math.round(Number(r.weight));
  const weight = Number.isFinite(weightNum) ? Math.max(1, Math.min(10, weightNum)) : 5;
  return { factor, sentiment, weight, detail };
}

/** Defensively extract the scoring JSON from the model's text output. */
export function parseScoreJson(text: string): ScoreResult {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model output');

  const parsed = JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  const scoreNum = Math.round(Number(parsed.score));
  if (!Number.isFinite(scoreNum)) throw new Error('Model output missing a numeric score');
  const score = Math.max(0, Math.min(100, scoreNum));
  const rationale = Array.isArray(parsed.rationale)
    ? parsed.rationale.map(normalizeRationale).filter((r): r is RationaleItem => r !== null)
    : [];
  return { score, rationale };
}

/**
 * Score one enriched candidate via the Anthropic SDK through Netlify AI Gateway
 * (ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL are injected at runtime when deployed;
 * set ANTHROPIC_API_KEY locally to test). Writes a new `scores` row and advances
 * the candidate to `scored`. Throws on failure (caller records `failed`).
 */
export async function scoreCandidate(candidateId: string): Promise<void> {
  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);
  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);

  await db
    .update(candidates)
    .set({ status: 'scoring', updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));

  try {
    const rows = await db.select().from(enrichment).where(eq(enrichment.candidateId, candidateId));
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(candidate, rows) }],
    });

    if (message.stop_reason === 'refusal') {
      throw new Error('Model refused to score this candidate');
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const result = parseScoreJson(text);

    await db.insert(scores).values({
      candidateId,
      score: result.score,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      rationale: result.rationale,
    });
    await db
      .update(candidates)
      .set({ status: 'scored', error: null, updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
  } catch (error) {
    await db
      .update(candidates)
      .set({ status: 'failed', error: String(error), updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
    throw error;
  }
}
