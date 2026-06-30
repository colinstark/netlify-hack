import { eq } from 'drizzle-orm';
import { db } from './db';
import { candidates, enrichment, scores } from './db/schema';
import { PROMPT_VERSION, SYSTEM_PROMPT } from './scoring-prompt';
import type { Candidate, Enrichment, RationaleItem, Sentiment } from './types';

// Overridable per-deploy; defaults to gpt-5.5.
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.5';
const MAX_RAW_CHARS = 4000;
const MAX_RATIONALE_DETAIL_CHARS = 700;

interface ScoreResult {
  score: number;
  rationale: RationaleItem[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
      refusal?: string | null;
    };
  }>;
}

function buildUserPrompt(candidate: Candidate, rows: Enrichment[]): string {
  const lines: string[] = [
    `# Candidate: ${candidate.title}`,
    candidate.projectUrl ? `Website: ${candidate.projectUrl}` : '',
    candidate.linkedinUrls.length ? `LinkedIn: ${candidate.linkedinUrls.join(', ')}` : '',
    candidate.githubUrls.length ? `GitHub: ${candidate.githubUrls.join(', ')}` : '',
    candidate.crunchbaseUrls.length ? `Crunchbase: ${candidate.crunchbaseUrls.join(', ')}` : '',
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

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function truncate(text: string, max = MAX_RATIONALE_DETAIL_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

function scoreFromValue(value: unknown, keyHint = ''): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampScore(value <= 10 && /score|composite|final|overall/i.test(keyHint) ? value * 10 : value);
  }
  if (typeof value !== 'string') return null;

  const percent = value.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (percent) return clampScore(Number(percent[1]));

  const ratio = value.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(10|100)\b/);
  if (ratio) {
    const n = Number(ratio[1]);
    const denom = Number(ratio[2]);
    return clampScore(denom === 10 ? n * 10 : n);
  }

  const numeric = value.match(/(?:score|composite|final|overall|banded)[^\d-]*(-?\d+(?:\.\d+)?)/i);
  if (!numeric) return null;
  const n = Number(numeric[1]);
  return clampScore(n <= 10 ? n * 10 : n);
}

function scoreFromObject(obj: Record<string, unknown>): number | null {
  const preferred = [
    'score',
    'final_score',
    'finalScore',
    'overall_score',
    'overallScore',
    'composite_score',
    'compositeScore',
    'banded_score',
    'bandedScore',
    'investment_score',
    'investmentScore',
  ];

  for (const key of preferred) {
    if (key in obj) {
      const score = scoreFromValue(obj[key], key);
      if (score != null) return score;
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (!/score|composite|final|overall|banded/i.test(key)) continue;
    const score = scoreFromValue(value, key);
    if (score != null) return score;
  }
  return null;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function scoreFromText(text: string): number | null {
  const patterns = [
    /(?:final|overall|composite|banded|investment|company)\s+score[^\d-]{0,40}(-?\d+(?:\.\d+)?)\s*\/\s*(10|100)\b/i,
    /(?:final|overall|composite|banded|investment|company)\s+score[^\d-]{0,40}(-?\d+(?:\.\d+)?)\s*%/i,
    /(?:final|overall|composite|banded|investment|company)\s+score[^\d-]{0,40}(-?\d+(?:\.\d+)?)/i,
    /\bscore[^\d-]{0,30}(-?\d+(?:\.\d+)?)\s*\/\s*(10|100)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const n = Number(match[1]);
    const denom = match[2] ? Number(match[2]) : undefined;
    return clampScore(denom === 10 || (!denom && n <= 10) ? n * 10 : n);
  }
  return null;
}

function linesAfterHeading(text: string, headingPattern: RegExp, limit: number): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start === -1) return [];

  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s+\S/.test(line) && out.length > 0) break;
    const cleaned = line.replace(/^[-*•\d.)\s]+/, '').trim();
    if (cleaned.length < 8) continue;
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

function rationaleFromReport(text: string, score: number): RationaleItem[] {
  const items: RationaleItem[] = [];

  for (const line of linesAfterHeading(text, /red flags/i, 3)) {
    items.push({ factor: 'Red flag', sentiment: '-', weight: 8, detail: truncate(line) });
  }

  for (const line of linesAfterHeading(text, /data gaps|acquisition plan/i, 2)) {
    items.push({ factor: 'Data gap', sentiment: '-', weight: 6, detail: truncate(line) });
  }

  for (const line of linesAfterHeading(text, /durability|market|competition|economics|team|regulatory|runway/i, 4)) {
    if (items.length >= 8) break;
    const negative = /\b(risk|weak|red|veto|no|undisclosed|unpriced|onerous|dependency|gap)\b/i.test(line);
    items.push({
      factor: negative ? 'Risk' : 'Verdict',
      sentiment: negative ? '-' : '+',
      weight: negative ? 6 : 5,
      detail: truncate(line),
    });
  }

  if (items.length === 0) {
    const firstParagraph = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p.length > 40);
    items.push({
      factor: 'Model report',
      sentiment: score >= 60 ? '+' : '-',
      weight: 5,
      detail: truncate(firstParagraph ?? text),
    });
  }

  return items;
}

/** Defensively extract scoring data from either legacy JSON or report-style model output. */
export function parseScoreOutput(text: string): ScoreResult {
  const parsed = extractJsonObject(text);
  if (parsed) {
    const score = scoreFromObject(parsed);
    if (score == null) throw new Error('Model JSON output missing a numeric score');
    const rationale = Array.isArray(parsed.rationale)
      ? parsed.rationale.map(normalizeRationale).filter((r): r is RationaleItem => r !== null)
      : [];
    return { score, rationale: rationale.length > 0 ? rationale : rationaleFromReport(text, score) };
  }

  const score = scoreFromText(text);
  if (score == null) {
    throw new Error('Model output missing a parseable score. Include a final/composite score like "Final score: 72/100".');
  }
  return { score, rationale: rationaleFromReport(text, score) };
}

/** @deprecated use parseScoreOutput; kept as a compatibility export for older tests. */
export function parseScoreJson(text: string): ScoreResult {
  const parsed = extractJsonObject(text);
  if (!parsed) throw new Error('No JSON object found in model output');
  const score = scoreFromObject(parsed);
  if (score == null) throw new Error('Model output missing a numeric score');
  const rationale = Array.isArray(parsed.rationale)
    ? parsed.rationale.map(normalizeRationale).filter((r): r is RationaleItem => r !== null)
    : [];
  return { score, rationale };
}

function openAiGatewayUrl(): string {
  const base = process.env.OPENAI_BASE_URL?.replace(/\/$/, '');
  if (!base) {
    throw new Error('OPENAI_BASE_URL is not set; enable Netlify AI Gateway for this deploy.');
  }
  return `${base}${base.endsWith('/v1') ? '' : '/v1'}/chat/completions`;
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const p = part as Record<string, unknown>;
      return typeof p.text === 'string' ? p.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

async function createScoringCompletion(userPrompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set; enable Netlify AI Gateway for this deploy.');
  }

  const res = await fetch(openAiGatewayUrl(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 8000,
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);

  let data: ChatCompletionResponse;
  try {
    data = JSON.parse(body) as ChatCompletionResponse;
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${body.slice(0, 500)}`);
  }

  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('Empty response from model');
  if (message.refusal) throw new Error(`Model refused to score this candidate: ${message.refusal}`);

  const text = contentToText(message.content);
  if (!text.trim()) throw new Error('Model returned an empty scoring response');
  return text;
}

/**
 * Score one enriched candidate via Netlify AI Gateway's OpenAI-compatible
 * endpoint. Netlify injects OPENAI_API_KEY and OPENAI_BASE_URL when AI Gateway
 * is enabled for the deploy. Writes a new `scores` row and advances the
 * candidate to `scored`. Throws on failure (caller records `failed`).
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
    const text = await createScoringCompletion(buildUserPrompt(candidate, rows));
    const result = parseScoreOutput(text);

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
