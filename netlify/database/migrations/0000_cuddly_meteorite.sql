CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'enriching', 'enriched', 'scoring', 'scored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."enrichment_status" AS ENUM('pending', 'ok', 'failed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('website', 'github', 'linkedin', 'file');--> statement-breakpoint
CREATE TABLE "candidate_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"blob_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size" integer,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"project_url" text,
	"linkedin_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"github_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"raw" jsonb,
	"summary" text,
	"status" "enrichment_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"model" text,
	"prompt_version" text,
	"rationale" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_files" ADD CONSTRAINT "candidate_files_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment" ADD CONSTRAINT "enrichment_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;