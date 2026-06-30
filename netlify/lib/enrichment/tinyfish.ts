import type { EnrichmentProvider, EnrichmentResult } from '../types';

const TINYFISH_FETCH = 'https://api.fetch.tinyfish.ai';
const SUMMARY_CHARS = 1500;
const REQUEST_TIMEOUT_MS = 150_000;
const PER_URL_TIMEOUT_MS = 110_000;

interface TinyfishFetchResult {
  url?: string;
  final_url?: string;
  title?: string | null;
  description?: string | null;
  language?: string | null;
  text?: unknown;
  author?: string | null;
  published_date?: string | null;
  latency_ms?: number;
  format?: string;
}

interface TinyfishFetchError {
  url?: string;
  code?: string;
  message?: string;
}

interface TinyfishFetchResponse {
  results?: TinyfishFetchResult[];
  errors?: TinyfishFetchError[];
}

/** Trim scraped markdown to a concise excerpt. Deep inference happens at scoring (T4). */
function summarize(markdown: string): string {
  return markdown.trim().slice(0, SUMMARY_CHARS);
}

/** Heuristic: LinkedIn often returns an auth/login wall instead of the profile. */
function looksBlocked(markdown: string): boolean {
  const text = markdown.toLowerCase();
  if (text.length < 80) return true;
  return (
    text.includes('sign in to linkedin') ||
    text.includes('join linkedin') ||
    text.includes('log in to continue')
  );
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function resultText(result: TinyfishFetchResult): string {
  if (typeof result.text === 'string') return result.text;
  if (result.text && typeof result.text === 'object') return JSON.stringify(result.text);
  return '';
}

function errorMessage(error: TinyfishFetchError): string {
  return [error.code, error.message].filter(Boolean).join(': ') || 'unknown error';
}

export class TinyfishProvider implements EnrichmentProvider {
  private readonly key = process.env.TINYFISH_API_KEY;

  async fetchWebsite(url: string): Promise<EnrichmentResult> {
    const result = await this.fetchMarkdown(url);
    const markdown = resultText(result);
    return { raw: { ...result, markdown }, summary: summarize(markdown) };
  }

  async fetchLinkedIn(url: string): Promise<EnrichmentResult | null> {
    try {
      const result = await this.fetchMarkdown(url);
      const markdown = resultText(result);
      if (!markdown || looksBlocked(markdown)) return null;
      return { raw: { ...result, markdown }, summary: summarize(markdown) };
    } catch {
      return null; // best-effort: never block the pipeline on LinkedIn
    }
  }

  async fetchGitHub(url: string): Promise<EnrichmentResult | null> {
    const result = await this.fetchMarkdown(url);
    const markdown = resultText(result);
    if (!markdown) return null;
    return { raw: { ...result, markdown }, summary: summarize(markdown) };
  }

  private async fetchMarkdown(url: string): Promise<TinyfishFetchResult> {
    if (!this.key) throw new Error('TINYFISH_API_KEY is not set');

    const normalized = normalizeUrl(url);
    const res = await fetch(TINYFISH_FETCH, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.key,
      },
      body: JSON.stringify({
        urls: [normalized],
        format: 'markdown',
        ttl: 0,
        per_url_timeout_ms: PER_URL_TIMEOUT_MS,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = await res.text();
    if (!res.ok) {
      throw new Error(`Tinyfish ${res.status}: ${body.slice(0, 500)}`);
    }

    let data: TinyfishFetchResponse;
    try {
      data = JSON.parse(body) as TinyfishFetchResponse;
    } catch {
      throw new Error(`Tinyfish returned invalid JSON: ${body.slice(0, 500)}`);
    }

    const result = data.results?.[0];
    if (result) return result;

    const error = data.errors?.[0];
    throw new Error(`Tinyfish failed for ${normalized}: ${error ? errorMessage(error) : 'no result'}`);
  }
}
