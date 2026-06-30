import type { EnrichmentProvider } from '../types';
import { FirecrawlProvider } from './firecrawl';

/**
 * Returns the configured enrichment provider. Swap via ENRICHMENT_PROVIDER
 * (firecrawl | tinyfish | linkup | ...). New providers implement EnrichmentProvider
 * and get wired in here. GitHub is handled separately (github.ts), not via this.
 */
export function getProvider(): EnrichmentProvider {
  const name = (process.env.ENRICHMENT_PROVIDER ?? 'firecrawl').toLowerCase();
  switch (name) {
    case 'firecrawl':
    default:
      return new FirecrawlProvider();
  }
}
