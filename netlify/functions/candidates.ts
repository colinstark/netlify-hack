import type { Config, Context } from '@netlify/functions';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../lib/db';
import { candidates, candidateFiles, enrichment, scores } from '../lib/db/schema';
import type { IdentityUser } from '../lib/auth';
import { putCandidateFile, deleteCandidateFile, fileBlobKey } from '../lib/blobs';
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
  status: statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function cleanUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => String(u).trim()).filter((u) => u.length > 0);
}

function toResponse(response: ReturnType<typeof json>): Response {
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

function baseUrl(req: Request): string {
  if (process.env.URL) return process.env.URL;
  return new URL(req.url).origin;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function requireUser(req: Request): Promise<IdentityUser> {
  const authorization = req.headers.get('authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    throw new UnauthorizedError();
  }

  const res = await fetch(`${baseUrl(req)}/.netlify/identity/user`, {
    headers: { authorization },
  });
  if (!res.ok) throw new UnauthorizedError();

  const data = (await res.json()) as Record<string, unknown>;
  const sub = typeof data.sub === 'string' ? data.sub : typeof data.id === 'string' ? data.id : '';
  if (!sub) throw new UnauthorizedError();

  return {
    ...data,
    sub,
    email: typeof data.email === 'string' ? data.email : undefined,
    app_metadata:
      data.app_metadata && typeof data.app_metadata === 'object'
        ? (data.app_metadata as IdentityUser['app_metadata'])
        : undefined,
    user_metadata:
      data.user_metadata && typeof data.user_metadata === 'object'
        ? (data.user_metadata as IdentityUser['user_metadata'])
        : undefined,
  };
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

async function createCandidate(req: Request, createdBy: string) {
  let body: CreateCandidateBody;
  try {
    body = await req.json();
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
    await triggerEnrichment(candidate.id, baseUrl(req));
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

async function rescoreCandidate(req: Request, id: string) {
  const rows = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (rows.length === 0) return json(404, { error: 'Candidate not found' });

  await db
    .update(candidates)
    .set({ status: 'scoring', updatedAt: new Date() })
    .where(eq(candidates.id, id));

  // Fire-and-forget the scoring background function (keeps a fresh scores-row history).
  try {
    const res = await fetch(`${baseUrl(req)}/.netlify/functions/score-candidate-background`, {
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

async function deleteCandidate(id: string) {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (!candidate) return json(404, { error: 'Candidate not found' });

  const fileRows = await db
    .select({ blobKey: candidateFiles.blobKey })
    .from(candidateFiles)
    .where(eq(candidateFiles.candidateId, id));

  await db.delete(candidates).where(eq(candidates.id, id));

  await Promise.allSettled(fileRows.map((file) => deleteCandidateFile(file.blobKey)));
  return json(200, { deleted: true });
}

export default async (req: Request, _context: Context) => {
  let user: IdentityUser;
  try {
    user = await requireUser(req);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return toResponse(json(401, { error: error.message }));
    }
    throw error;
  }

  try {
    const path = new URL(req.url).pathname;
    const rescoreMatch = path.match(/\/candidates\/([^/]+)\/rescore\/?$/);
    const idMatch = path.match(/\/candidates\/([^/]+)\/?$/);
    if (req.method === 'POST' && rescoreMatch) return toResponse(await rescoreCandidate(req, rescoreMatch[1]));
    if (req.method === 'DELETE' && idMatch) return toResponse(await deleteCandidate(idMatch[1]));
    if (req.method === 'GET' && idMatch) return toResponse(await getCandidateReport(idMatch[1]));
    if (req.method === 'GET') return toResponse(await listCandidates());
    if (req.method === 'POST') return toResponse(await createCandidate(req, user.sub));
    return toResponse(json(405, { error: 'Method not allowed' }));
  } catch (error) {
    return toResponse(json(500, { error: String(error) }));
  }
};

export const config: Config = {
  path: ['/api/candidates', '/api/candidates/:id', '/api/candidates/:id/rescore'],
};
