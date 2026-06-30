import { getDatabase } from '@netlify/database';
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleServer, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * @netlify/database resolves the right connection for the environment:
 * a local Postgres pool (`driver: 'server'`) under `netlify dev`, or a Neon
 * serverless pool (`driver: 'serverless'`) when deployed. We wrap whichever it
 * returns in the matching Drizzle adapter. The query API is identical, so we
 * expose a single `NodePgDatabase`-typed handle to callers.
 */
const connection = getDatabase();

export const db: NodePgDatabase<typeof schema> =
  connection.driver === 'serverless'
    ? (drizzleServerless(connection.pool, { schema }) as unknown as NodePgDatabase<typeof schema>)
    : drizzleServer(connection.pool, { schema });

export { schema };
