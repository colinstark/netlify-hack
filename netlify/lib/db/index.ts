import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const connectionString = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'Database connection string missing. Set NETLIFY_DATABASE_URL (auto-injected by Netlify ' +
      'once the DB is provisioned) or DATABASE_URL for local dev. See NOTES-T0.md.',
  );
}

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
export { schema };
