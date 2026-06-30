import type { EnrichmentProvider, EnrichmentResult } from '../types';

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v1/scrape';
const SUMMARY_CHARS = 1500;

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

export class FirecrawlProvider implements EnrichmentProvider {
  private readonly key = process.env.FIRECRAWL_API_KEY;

  async fetchWebsite(url: string): Promise<EnrichmentResult> {
    const markdown = await this.scrapeMarkdown(url);
    return { raw: { url, markdown }, summary: summarize(markdown) };
  }

  async fetchLinkedIn(url: string): Promise<EnrichmentResult | null> {
    try {
      const markdown = await this.scrapeMarkdown(url);
      if (!markdown || looksBlocked(markdown)) return null;
      return { raw: { url, markdown }, summary: summarize(markdown) };
    } catch {
      return null; // best-effort: never block the pipeline on LinkedIn
    }
  }

  private async scrapeMarkdown(url: string): Promise<string> {
    if (!this.key) throw new Error('FIRECRAWL_API_KEY is not set');
    const res = await fetch(FIRECRAWL_SCRAPE, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.key}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    });
    if (!res.ok) {
      throw new Error(`Firecrawl ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const data = await res.json();
    return data?.data?.markdown ?? '';
  }
}
