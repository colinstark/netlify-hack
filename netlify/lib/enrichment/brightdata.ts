import type { EnrichmentProvider, EnrichmentResult } from '../types';
import { TinyfishProvider } from './tinyfish';

const BRIGHTDATA_SCRAPE = 'https://api.brightdata.com/datasets/v3/scrape';
const DATASETS = {
  githubRepository: 'gd_lyrexgxc24b3d4imjt',
  linkedinPerson: 'gd_l1viktl72bvl7bjuj0',
  linkedinCompany: 'gd_l1vikfnt1wgvvqz95w',
} as const;
const SUMMARY_CHARS = 2000;

type BrightDataDatasetId = (typeof DATASETS)[keyof typeof DATASETS] | string;

function summarize(raw: unknown): string {
  return JSON.stringify(raw, null, 2).slice(0, SUMMARY_CHARS);
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function isLinkedInPerson(url: string): boolean {
  try {
    const u = new URL(normalizeUrl(url));
    return u.pathname.split('/').filter(Boolean)[0] === 'in';
  } catch {
    return false;
  }
}

function hasProviderError(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  if (Array.isArray(raw)) return raw.some((item) => hasProviderError(item));
  const record = raw as Record<string, unknown>;
  return ['error', 'error_code', 'error_message'].some((key) => {
    const value = record[key];
    return value != null && value !== '';
  });
}

export class BrightDataProvider implements EnrichmentProvider {
  private readonly key = process.env.BRIGHTDATA_API_KEY;
  private readonly websiteProvider = new TinyfishProvider();

  async fetchWebsite(url: string): Promise<EnrichmentResult> {
    return this.websiteProvider.fetchWebsite(url);
  }

  async fetchLinkedIn(url: string): Promise<EnrichmentResult | null> {
    const datasetId = isLinkedInPerson(url) ? DATASETS.linkedinPerson : DATASETS.linkedinCompany;
    return this.scrapeUrl(datasetId, url);
  }

  async fetchGitHub(url: string): Promise<EnrichmentResult | null> {
    return this.scrapeUrl(DATASETS.githubRepository, url);
  }

  async fetchCrunchbase(url: string): Promise<EnrichmentResult | null> {
    const datasetId = process.env.BRIGHTDATA_CRUNCHBASE_DATASET_ID;
    if (!datasetId) {
      throw new Error('BRIGHTDATA_CRUNCHBASE_DATASET_ID is not set');
    }
    return this.scrapeUrl(datasetId, url);
  }

  private async scrapeUrl(datasetId: BrightDataDatasetId, url: string): Promise<EnrichmentResult | null> {
    if (!this.key) throw new Error('BRIGHTDATA_API_KEY is not set');

    const res = await fetch(`${BRIGHTDATA_SCRAPE}?dataset_id=${datasetId}&notify=false&include_errors=true`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        input: [{ url: normalizeUrl(url) }],
        limit_per_input: null,
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      throw new Error(`BrightData ${res.status}: ${body.slice(0, 500)}`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      throw new Error(`BrightData returned invalid JSON: ${body.slice(0, 500)}`);
    }

    if (hasProviderError(raw)) return null;
    return { raw, summary: summarize(raw) };
  }
}
