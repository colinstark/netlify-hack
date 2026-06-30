import type { HandlerContext } from '@netlify/functions';

/** Decoded Netlify Identity JWT claims, populated on context.clientContext.user. */
export interface IdentityUser {
  sub: string;
  email?: string;
  app_metadata?: { roles?: string[]; [k: string]: unknown };
  user_metadata?: Record<string, unknown>;
  [k: string]: unknown;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Netlify auto-populates context.clientContext.user with the decoded Identity
 * JWT claims when the request carries a valid `Authorization: Bearer <jwt>`.
 * Returns null when the caller is anonymous.
 */
export function getUser(context: HandlerContext): IdentityUser | null {
  const clientContext = context.clientContext as { user?: IdentityUser } | undefined;
  return clientContext?.user ?? null;
}

/** Like getUser but throws UnauthorizedError when no valid user is present. */
export function requireUser(context: HandlerContext): IdentityUser {
  const user = getUser(context);
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Standard 401 body for auth-gated legacy-handler functions. */
export function unauthorizedResponse() {
  return {
    statusCode: 401,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: 'Authentication required' }),
  };
}
