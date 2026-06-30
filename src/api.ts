import netlifyIdentity from 'netlify-identity-widget';

/**
 * fetch wrapper that attaches the Netlify Identity JWT as a Bearer token so
 * auth-gated functions (see netlify/lib/auth.ts) can identify the caller.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const current = netlifyIdentity.currentUser();
  let token: string | null = null;
  if (current) {
    try {
      token = await netlifyIdentity.refresh();
    } catch {
      token = current.token?.access_token ?? null;
    }
  }

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(path, { ...init, headers });
}
