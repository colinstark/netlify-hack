import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { RationaleItem } from '../types';

export const candidateStatus = pgEnum('candidate_status', [
  'pending',
  'enriching',
  'enriched',
  'scoring',
  'scored',
  'failed',
]);

export const sourceType = pgEnum('source_type', ['website', 'github', 'linkedin', 'crunchbase', 'file']);

export const enrichmentStatus = pgEnum('enrichment_status', [
  'pending',
  'ok',
  'failed',
  'unavailable',
]);

export const candidates = pgTable('candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  projectUrl: text('project_url'),
  linkedinUrls: jsonb('linkedin_urls').$type<string[]>().default([]).notNull(),
  githubUrls: jsonb('github_urls').$type<string[]>().default([]).notNull(),
  crunchbaseUrls: jsonb('crunchbase_urls').$type<string[]>().default([]).notNull(),
  notes: text('notes'),
  // Netlify Identity `sub` of the scout who created the row (shared pool — informational).
  createdBy: text('created_by'),
  status: candidateStatus('status').default('pending').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const candidateFiles = pgTable('candidate_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  blobKey: text('blob_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type'),
  size: integer('size'),
  extractedText: text('extracted_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const enrichment = pgTable('enrichment', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  sourceType: sourceType('source_type').notNull(),
  raw: jsonb('raw'),
  summary: text('summary'),
  status: enrichmentStatus('status').default('pending').notNull(),
  error: text('error'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
});

export const scores = pgTable('scores', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateId: uuid('candidate_id')
    .notNull()
    .references(() => candidates.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  model: text('model'),
  promptVersion: text('prompt_version'),
  // Array of { factor, sentiment: '+'|'-', weight, detail } — see RationaleItem.
  rationale: jsonb('rationale').$type<RationaleItem[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
