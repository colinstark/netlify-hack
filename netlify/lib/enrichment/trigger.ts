/**
 * Fire-and-forget invocation of the enrichment background function (T3).
 * Background functions reply 202 immediately. Any failure here (e.g. the
 * function not existing yet) must NOT fail candidate ingest — hence swallowed.
 */
export async function triggerEnrichment(candidateId: string, baseUrl: string): Promise<void> {
  try {
    await fetch(`${baseUrl}/.netlify/functions/enrich-candidate-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    });
  } catch {
    // T3 not deployed yet, or transient error — ingest proceeds regardless.
  }
}
