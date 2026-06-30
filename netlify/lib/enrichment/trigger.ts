/**
 * Fire-and-forget invocation of the enrichment background function (T3).
 * Background functions reply 202 immediately. Network errors and non-2xx
 * responses are surfaced to the caller so candidate status can be updated.
 */
export async function triggerEnrichment(candidateId: string, baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/.netlify/functions/enrich-candidate-background`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidateId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Enrichment trigger failed (${res.status}): ${body.slice(0, 500)}`);
  }
}
