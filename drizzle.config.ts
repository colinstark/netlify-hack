import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  // Our real schema (the netlify db init sample at db/schema.ts is removed).
  schema: './netlify/lib/db/schema.ts',
  out: './netlify/database/migrations',
  dbCredentials: {
    // Netlify injects NETLIFY_DATABASE_URL; DATABASE_URL is a local fallback.
    url: process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
});
