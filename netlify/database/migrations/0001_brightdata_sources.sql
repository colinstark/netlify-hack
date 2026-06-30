ALTER TYPE "public"."source_type" ADD VALUE IF NOT EXISTS 'crunchbase';--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "crunchbase_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;
