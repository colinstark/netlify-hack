// Frontend-facing domain types (JSON shape returned by the API — dates as ISO strings).
// Backend row types live in netlify/lib/types.ts (inferred from the Drizzle schema).

export type CandidateStatus =
  | 'pending'
  | 'enriching'
  | 'enriched'
  | 'scoring'
  | 'scored'
  | 'failed';

export type EnrichmentSourceType = 'website' | 'github' | 'linkedin' | 'crunchbase' | 'file';
export type EnrichmentStatus = 'pending' | 'ok' | 'failed' | 'unavailable';
export type Sentiment = '+' | '-';

export interface RationaleItem {
  factor: string;
  sentiment: Sentiment;
  weight: number;
  detail: string;
}

export interface Candidate {
  id: string;
  title: string;
  projectUrl: string | null;
  linkedinUrls: string[];
  githubUrls: string[];
  crunchbaseUrls: string[];
  notes: string | null;
  status: CandidateStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Score {
  id: string;
  candidateId: string;
  score: number;
  model: string | null;
  promptVersion: string | null;
  rationale: RationaleItem[] | null;
  createdAt: string;
}

/** Candidate row with its latest score attached (GET /api/candidates list response). */
export type CandidateListItem = Candidate & { latestScore: Score | null };

export interface Enrichment {
  id: string;
  candidateId: string;
  sourceType: EnrichmentSourceType;
  raw: unknown;
  summary: string | null;
  status: EnrichmentStatus;
  error: string | null;
  fetchedAt: string;
}

export interface CandidateFile {
  id: string;
  candidateId: string;
  blobKey: string;
  filename: string;
  contentType: string | null;
  size: number | null;
  extractedText: string | null;
  createdAt: string;
}

/** Composite returned by GET /api/candidates/:id. */
export interface CandidateReport {
  candidate: Candidate;
  latestScore: Score | null;
  scoreHistory: Score[];
  enrichment: Enrichment[];
  files: CandidateFile[];
}
