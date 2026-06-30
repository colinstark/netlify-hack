import type { Config, Context } from '@netlify/functions';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { candidates } from '../lib/db/schema';

/** Trivial health check that proves the DB connection + schema are live. */
export default async (_req: Request, _context: Context) => {
  try {
    const rows = await db.select({ count: sql<number>`count(*)::int` }).from(candidates);
    return new Response(JSON.stringify({ ok: true, candidates: rows[0]?.count ?? 0 }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};

export const config: Config = { path: '/api/health' };
