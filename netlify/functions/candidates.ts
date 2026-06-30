import type { Config, Handler, HandlerEvent } from '@netlify/functions';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../lib/db';
import { candidates, candidateFiles, enrichment, scores } from '../lib/db/schema';
import { requireUser, UnauthorizedError, unauthorizedResponse } from '../lib/auth';
import { putCandidateFile, fileBlobKey } from '../lib/blobs';
import { triggerEnrichment } from '../lib/enrichment/trigger';

interface UploadedFile {
  filename: string;
  contentType?: string;
  /** Base64-encoded file contents (no data: prefix). */
  dataBase64: string;
}

interface CreateCandidateBody {
  title?: string;
  projectUrl?: string;
  linkedinUrls?: string[];
  githubUrls?: string[];
  crunchbaseUrls?: string[];
  notes?: string;
  files?: UploadedFile[];
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function cleanUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => String(u).trim()).filter((u) => u.length > 0);
}

function baseUrl(event: HandlerEvent): string {
  if (process.env.URL) return process.env.URL;
  const proto = (event.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = event.headers.host ?? 'localhost:8888';
  return `${proto}://${host}`;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function listCandidates() {
  const candidateRows = await db.select().from(candidates).orderBy(desc(candidates.createdAt));
  if (candidateRows.length === 0) return json(200, []);

  // Keep this compatible with the Drizzle version in the project by querying
  // relevant scores and taking the first newest row per candidate in memory.
  const latestScores = await db
    .select()
    .from(scores)
    .where(inArray(scores.candidateId, candidateRows.map((c) => c.id)))
    .orderBy(desc(scores.createdAt));

  const scoreByCandidate = new Map<(typeof latestScores)[number]['candidateId'], (typeof latestScores)[number]>();
  for (const score of latestScores) {
    if (!scoreByCandidate.has(score.candidateId)) {
      scoreByCandidate.set(score.candidateId, score);
    }
  }
  return json(
    200,
    candidateRows.map((c) => ({ ...c, latestScore: scoreByCandidate.get(c.id) ?? null })),
  );
}

/** Composite report: candidate + latest score + history + enrichment + files. */
async function getCandidateReport(id: string) {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (!candidate) return json(404, { error: 'Candidate not found' });

  const [enrichmentRows, fileRows, scoreRows] = await Promise.all([
    db.select().from(enrichment).where(eq(enrichment.candidateId, id)).orderBy(asc(enrichment.fetchedAt)),
    db.select().from(candidateFiles).where(eq(candidateFiles.candidateId, id)).orderBy(asc(candidateFiles.createdAt)),
    db.select().from(scores).where(eq(scores.candidateId, id)).orderBy(desc(scores.createdAt)),
  ]);

  return json(200, {
    candidate,
    latestScore: scoreRows[0] ?? null,
    scoreHistory: scoreRows,
    enrichment: enrichmentRows,
    files: fileRows,
  });
}

async function createCandidate(event: HandlerEvent, createdBy: string) {
  let body: CreateCandidateBody;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const title = body.title?.trim();
  if (!title) return json(400, { error: 'title is required' });

  const [candidate] = await db
    .insert(candidates)
    .values({
      title,
      projectUrl: body.projectUrl?.trim() || null,
      linkedinUrls: cleanUrls(body.linkedinUrls),
      githubUrls: cleanUrls(body.githubUrls),
      crunchbaseUrls: cleanUrls(body.crunchbaseUrls),
      notes: body.notes?.trim() || null,
      createdBy,
      status: 'pending',
    })
    .returning();

  // Persist uploaded files to Blobs + index rows.
  const files = Array.isArray(body.files) ? body.files : [];
  for (const file of files) {
    if (!file?.filename || !file?.dataBase64) continue;
    const data = base64ToArrayBuffer(file.dataBase64);
    const key = fileBlobKey(candidate.id, file.filename);
    await putCandidateFile(key, data);
    await db.insert(candidateFiles).values({
      candidateId: candidate.id,
      blobKey: key,
      filename: file.filename,
      contentType: file.contentType ?? null,
      size: data.byteLength,
    });
  }

  // Kick off enrichment (T3). Ingest still succeeds, but a trigger failure is
  // recorded immediately so the row never sits in `pending` indefinitely.
  try {
    await triggerEnrichment(candidate.id, baseUrl(event));
  } catch (error) {
    const message = String(error);
    await db
      .update(candidates)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id));
    return json(201, { ...candidate, status: 'failed', error: message });
  }

  return json(201, candidate);
}

async function rescoreCandidate(event: HandlerEvent, id: string) {
  const rows = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (rows.length === 0) return json(404, { error: 'Candidate not found' });

  await db
    .update(candidates)
    .set({ status: 'scoring', updatedAt: new Date() })
    .where(eq(candidates.id, id));

  // Fire-and-forget the scoring background function (keeps a fresh scores-row history).
  try {
    const res = await fetch(`${baseUrl(event)}/.netlify/functions/score-candidate-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId: id }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Scoring trigger failed (${res.status}): ${body.slice(0, 500)}`);
    }
  } catch (error) {
    const message = String(error);
    await db
      .update(candidates)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(candidates.id, id));
    return json(502, { error: message });
  }
  return json(202, { status: 'scoring' });
}

export const handler: Handler = async (event, context) => {
  let user;
  try {
    user = requireUser(context);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  try {
    const rescoreMatch = event.path.match(/\/candidates\/([^/]+)\/rescore\/?$/);
    const idMatch = event.path.match(/\/candidates\/([^/]+)\/?$/);
    if (event.httpMethod === 'POST' && rescoreMatch) return await rescoreCandidate(event, rescoreMatch[1]);
    if (event.httpMethod === 'GET' && idMatch) return await getCandidateReport(idMatch[1]);
    if (event.httpMethod === 'GET') return await listCandidates();
    if (event.httpMethod === 'POST') return await createCandidate(event, user.sub);
    return json(405, { error: 'Method not allowed' });
  } catch (error) {
    return json(500, { error: String(error) });
  }
};

export const config: Config = {
  path: ['/api/candidates', '/api/candidates/:id', '/api/candidates/:id/rescore'],
};
