import type { Context } from '@netlify/functions';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { candidates, candidateFiles, enrichment } from '../lib/db/schema';
import type { EnrichmentSourceType } from '../lib/types';
import { getProvider } from '../lib/enrichment/adapter';
import { enrichGitHub } from '../lib/enrichment/github';
import { extractFileText } from '../lib/enrichment/files';

type SourceStatus = 'ok' | 'failed' | 'unavailable';
interface SourceOutcome {
  raw: unknown;
  summary: string;
  status: SourceStatus;
}

async function setStatus(candidateId: string, status: 'enriching' | 'enriched' | 'failed', error?: string) {
  await db
    .update(candidates)
    .set({ status, error: error ?? null, updatedAt: new Date() })
    .where(eq(candidates.id, candidateId));
}

/** Run one source in isolation: a thrown error becomes a `failed` row, never aborts the run. */
async function runSource(
  candidateId: string,
  sourceType: EnrichmentSourceType,
  fn: () => Promise<SourceOutcome>,
) {
  try {
    const outcome = await fn();
    await db.insert(enrichment).values({
      candidateId,
      sourceType,
      raw: outcome.raw,
      summary: outcome.summary,
      status: outcome.status,
    });
  } catch (error) {
    await db.insert(enrichment).values({
      candidateId,
      sourceType,
      status: 'failed',
      error: String(error),
    });
  }
}

function baseUrl(req: Request): string {
  return process.env.URL ?? new URL(req.url).origin;
}

/** Fire-and-forget scoring trigger (T4). Swallowed so enrichment completes regardless. */
async function triggerScoring(candidateId: string, base: string): Promise<void> {
  try {
    await fetch(`${base}/.netlify/functions/score-candidate-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    });
  } catch {
    // T4 not deployed yet — leave the candidate at `enriched`.
  }
}

export default async (req: Request, _context: Context) => {
  let candidateId: string | undefined;
  try {
    ({ candidateId } = await req.json());
  } catch {
    return new Response('Invalid body', { status: 400 });
  }
  if (!candidateId) return new Response('Missing candidateId', { status: 400 });

  const [candidate] = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);
  if (!candidate) return new Response('Candidate not found', { status: 404 });

  try {
    await setStatus(candidateId, 'enriching');
    const provider = getProvider();

    if (candidate.projectUrl) {
      const url = candidate.projectUrl;
      await runSource(candidateId, 'website', async () => {
        const r = await provider.fetchWebsite(url);
        return { raw: r.raw, summary: r.summary, status: 'ok' };
      });
    }

    for (const url of candidate.githubUrls) {
      await runSource(candidateId, 'github', async () => {
        const r = await provider.fetchGitHub?.(url);
        if (r) return { raw: r.raw, summary: r.summary, status: 'ok' };
        return enrichGitHub(url);
      });
    }

    for (const url of candidate.linkedinUrls) {
      await runSource(candidateId, 'linkedin', async () => {
        const r = await provider.fetchLinkedIn(url);
        if (!r) return { raw: { url }, summary: 'LinkedIn unavailable', status: 'unavailable' };
        return { raw: r.raw, summary: r.summary, status: 'ok' };
      });
    }

    for (const url of candidate.crunchbaseUrls) {
      await runSource(candidateId, 'crunchbase', async () => {
        const r = await provider.fetchCrunchbase?.(url);
        if (!r) return { raw: { url }, summary: 'Crunchbase unavailable', status: 'unavailable' };
        return { raw: r.raw, summary: r.summary, status: 'ok' };
      });
    }

    const files = await db
      .select()
      .from(candidateFiles)
      .where(eq(candidateFiles.candidateId, candidateId));
    for (const file of files) {
      await runSource(candidateId, 'file', async () => {
        const text = await extractFileText(file.blobKey, file.contentType);
        await db
          .update(candidateFiles)
          .set({ extractedText: text })
          .where(eq(candidateFiles.id, file.id));
        return {
          raw: { filename: file.filename, chars: text.length },
          summary: text.slice(0, 2000),
          status: 'ok',
        };
      });
    }

    await setStatus(candidateId, 'enriched');
    await triggerScoring(candidateId, baseUrl(req));
    return new Response('enriched');
  } catch (error) {
    await setStatus(candidateId, 'failed', String(error));
    return new Response(`Enrichment failed: ${String(error)}`, { status: 500 });
  }
};
