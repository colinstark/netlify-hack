import type { InferSelectModel } from 'drizzle-orm';
import type { candidates, candidateFiles, enrichment, scores } from './db/schema';

/** Direction of a scoring factor: strength (+) or risk (-). */
export type Sentiment = '+' | '-';

/** One reason in a candidate's score breakdown. */
export interface RationaleItem {
  factor: string;
  sentiment: Sentiment;
  weight: number;
  detail: string;
}

// Row types inferred from the Drizzle schema — single source of truth.
export type Candidate = InferSelectModel<typeof candidates>;
export type CandidateFile = InferSelectModel<typeof candidateFiles>;
export type Enrichment = InferSelectModel<typeof enrichment>;
export type Score = InferSelectModel<typeof scores>;

export type EnrichmentSourceType = 'website' | 'github' | 'linkedin' | 'file';

export interface EnrichmentResult {
  /** Provider-native payload, stored verbatim in enrichment.raw. */
  raw: unknown;
  /** Human/LLM-readable summary (industry, business model, pricing, etc.). */
  summary: string;
}

/**
 * Pluggable enrichment provider. Swap implementations via the ENRICHMENT_PROVIDER
 * env var (firecrawl | tinyfish | linkup | ...). GitHub is handled separately
 * via the official API, not through this interface. Implemented in T3.
 */
export interface EnrichmentProvider {
  fetchWebsite(url: string): Promise<EnrichmentResult>;
  /** Best-effort. Returns null when LinkedIn is blocked/unsupported. */
  fetchLinkedIn(url: string): Promise<EnrichmentResult | null>;
}
