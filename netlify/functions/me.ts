import type { Handler } from '@netlify/functions';
import { requireUser, UnauthorizedError, unauthorizedResponse } from '../lib/auth';

/**
 * Auth-gated example endpoint (legacy handler form so context.clientContext.user
 * is populated). Returns 401 without a valid Identity token, 200 with the user.
 */
export const handler: Handler = async (_event, context) => {
  try {
    const user = requireUser(context);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: user.sub, email: user.email ?? null }),
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: String(error) }),
    };
  }
};
