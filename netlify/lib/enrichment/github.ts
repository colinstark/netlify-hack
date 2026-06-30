export interface GitHubResult {
  raw: unknown;
  summary: string;
  status: 'ok' | 'failed' | 'unavailable';
}

class RateLimitError extends Error {}

/** github.com/{owner} (user/org) or github.com/{owner}/{repo}. */
function parseGitHubPath(url: string): { owner: string; repo?: string } | null {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    if (!u.hostname.endsWith('github.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

/**
 * GitHub REST call. Token is OPTIONAL — sent only if GITHUB_TOKEN is set
 * (60 req/hr/IP unauthenticated, 5000/hr with a token). 403/429 → RateLimitError.
 */
async function gh<T = unknown>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'vc-scout',
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    throw new RateLimitError(`GitHub rate-limited (remaining=${remaining})`);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

interface RepoData {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  [k: string]: unknown;
}
interface UserData {
  login: string;
  type: string;
  public_repos: number;
  followers: number;
  [k: string]: unknown;
}

export async function enrichGitHub(url: string): Promise<GitHubResult> {
  const parsed = parseGitHubPath(url);
  if (!parsed) return { raw: { url }, summary: 'Unrecognized GitHub URL', status: 'failed' };

  try {
    if (parsed.repo) {
      const repo = await gh<RepoData>(`/repos/${parsed.owner}/${parsed.repo}`);
      const contributors = await gh<unknown[]>(
        `/repos/${parsed.owner}/${parsed.repo}/contributors?per_page=20`,
      ).catch(() => []);
      const count = Array.isArray(contributors) ? contributors.length : 0;
      const summary = `${repo.full_name}: ${repo.description ?? ''} | ★${repo.stargazers_count} | ${repo.language ?? 'n/a'} | ${count} contributors`;
      return { raw: { repo, contributors }, summary, status: 'ok' };
    }

    const user = await gh<UserData>(`/users/${parsed.owner}`);
    const repos = await gh<unknown[]>(
      `/users/${parsed.owner}/repos?per_page=100&sort=updated`,
    ).catch(() => []);
    const events = await gh<unknown[]>(
      `/users/${parsed.owner}/events/public?per_page=30`,
    ).catch(() => []);
    const recent = Array.isArray(events) ? events.length : 0;
    const summary = `${user.login} (${user.type}): ${user.public_repos} public repos, ${user.followers} followers, ${recent} recent public events`;
    return { raw: { user, repos, events }, summary, status: 'ok' };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { raw: { url, note: String(error) }, summary: 'GitHub rate-limited', status: 'unavailable' };
    }
    return { raw: { url, error: String(error) }, summary: 'GitHub fetch failed', status: 'failed' };
  }
}
