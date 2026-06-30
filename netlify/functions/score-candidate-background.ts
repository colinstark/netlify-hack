import type { Context } from '@netlify/functions';
import { scoreCandidate } from '../lib/scoring';

/**
 * Background scoring (≤15 min). Triggered at the end of enrichment and by the
 * rescore endpoint. Reads { candidateId } and runs the AI-Gateway scoring pass.
 */
export default async (req: Request, _context: Context) => {
  let candidateId: string | undefined;
  try {
    ({ candidateId } = await req.json());
  } catch {
    return new Response('Invalid body', { status: 400 });
  }
  if (!candidateId) return new Response('Missing candidateId', { status: 400 });

  try {
    await scoreCandidate(candidateId);
    return new Response('scored');
  } catch (error) {
    return new Response(`Scoring failed: ${String(error)}`, { status: 500 });
  }
};
