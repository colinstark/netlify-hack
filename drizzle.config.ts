import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './netlify/lib/db/schema.ts',
  out: './db',
  dialect: 'postgresql',
  dbCredentials: {
    // Netlify injects NETLIFY_DATABASE_URL once the DB is provisioned/linked.
    // DATABASE_URL is read as a fallback for local dev.
    url: process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
});
