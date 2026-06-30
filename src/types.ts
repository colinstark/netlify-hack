// Frontend-facing domain types (JSON shape returned by the API — dates as ISO strings).
// Backend row types live in netlify/lib/types.ts (inferred from the Drizzle schema).

export type CandidateStatus =
  | 'pending'
  | 'enriching'
  | 'enriched'
  | 'scoring'
  | 'scored'
  | 'failed';

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
  notes: string | null;
  status: CandidateStatus;
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
