// Global type definitions - Ensuring runtime type safety via Zod Schema
import { z } from 'zod';

// ─────────────────────────────────────────
// Evidence Object
// ─────────────────────────────────────────

export const ConfidenceSchema = z.union([
  z.number().min(0).max(1),
  z.enum(['low', 'medium', 'high'])
]);

export const EvidenceItemSchema = z.object({
  id: z.string(),
  source: z.enum(['trace', 'db', 'redis', 'derived']),
  entity_id: z.string(),
  timestamp: z.string().datetime(),
  finding_type: z.string(),
  summary: z.string(),
  confidence: ConfidenceSchema,
  raw_ref: z.string(),
  // Optional fields
  service: z.string().optional(),
  span_id: z.string().optional(),
  table: z.string().optional(),
  key: z.string().optional(),
  severity: z.enum(['informational', 'warning', 'error']).optional(),
  normalization_status: z.enum(['complete', 'partial', 'ambiguous']).optional(),
  tags: z.array(z.string()).optional(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

// ─────────────────────────────────────────
// Incident Input
// ─────────────────────────────────────────

export const ContextTypeSchema = z.enum([
  'trace_id',
  'request_id',
  'order_id',
  'task_id',
  'message_id',
  'user_id',
]);

export const IncidentInputSchema = z.object({
  context_id: z.string().min(1, 'Context ID cannot be empty'),
  context_type: ContextTypeSchema,
  symptom: z.string().min(1, 'Symptom description cannot be empty'),
  expected: z.string().min(1, 'Expected behavior cannot be empty'),
});

export type IncidentInput = z.infer<typeof IncidentInputSchema>;
export type ContextType = z.infer<typeof ContextTypeSchema>;

// ─────────────────────────────────────────
// Incident Report
// ─────────────────────────────────────────

export const IncidentReportSchema = z.object({
  incident_summary: z.string(),
  selected_runbook: z.string(),
  confirmed_facts: z.array(z.string()),
  most_likely_root_cause: z.string(),
  primary_conclusion: z.string(),
  confidence: ConfidenceSchema,
  alternative_hypotheses: z.array(z.string()),
  evidence: z.array(EvidenceItemSchema),
  recommended_next_actions: z.array(z.string()),
  matched_decision_rule: z.string(),
  generated_at: z.string().datetime(),
});

export type IncidentReport = z.infer<typeof IncidentReportSchema>;

// ─────────────────────────────────────────
// Generic Adapter Output
// ─────────────────────────────────────────

export const AdapterResponseSchema = z.object({
  ok: z.boolean(),
  source: z.string(),
  evidence: z.array(EvidenceItemSchema).default([]),
  errors: z.array(z.string()).default([]),
  raw_ref: z.string().optional(),
});

export type AdapterResponse = z.infer<typeof AdapterResponseSchema>;

// ─────────────────────────────────────────
// Configuration Schema
// ─────────────────────────────────────────

export const LangfuseConfigSchema = z.object({
  base_url: z.string().url().default('https://cloud.langfuse.com'),
  secret_key: z.string().min(1),
  public_key: z.string().min(1),
  span_field_allowlist: z.array(z.string()).default([
    'input', 'output', 'metadata.error', 'level', 'statusMessage', 'latency',
  ]),
});

export const DbConfigSchema = z.object({
  type: z.enum(['postgres']).default('postgres'),
  connection_string: z.string().min(1),
  allowed_tables: z.array(z.string()).default([]),
});

export const RedisConfigSchema = z.object({
  url: z.string().min(1),
  key_prefix_allowlist: z.array(z.string()).default([]),
});

export const AgentDebuggerConfigSchema = z.object({
  adapters: z.object({
    langfuse: LangfuseConfigSchema.optional(),
    db: DbConfigSchema.optional(),
    redis: RedisConfigSchema.optional(),
  }).default({}),
  runbooks: z.array(z.string()).default([]),
});

export type AgentDebuggerConfig = z.infer<typeof AgentDebuggerConfigSchema>;
export type LangfuseConfig = z.infer<typeof LangfuseConfigSchema>;
export type DbConfig = z.infer<typeof DbConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
