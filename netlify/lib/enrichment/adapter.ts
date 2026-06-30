import type { EnrichmentProvider } from '../types';
import { BrightDataProvider } from './brightdata';
import { FirecrawlProvider } from './firecrawl';
import { TinyfishProvider } from './tinyfish';

/**
 * Returns the configured enrichment provider. Swap via ENRICHMENT_PROVIDER
 * (firecrawl | tinyfish | brightdata | ...). New providers implement
 * EnrichmentProvider and get wired in here. GitHub falls back to the official
 * API when the selected provider does not implement fetchGitHub.
 */
export function getProvider(): EnrichmentProvider {
  const name = (process.env.ENRICHMENT_PROVIDER ?? 'tinyfish').toLowerCase();
  switch (name) {
    case 'brightdata':
      return new BrightDataProvider();
    case 'tinyfish':
      return new TinyfishProvider();
    case 'firecrawl':
      return new FirecrawlProvider();
    default:
      throw new Error(`Unknown ENRICHMENT_PROVIDER: ${name}`);
  }
}
