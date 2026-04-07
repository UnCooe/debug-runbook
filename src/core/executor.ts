// Executor - Runbook Execution Scheduler
// Dynamically invokes the corresponding Adapter based on the selected Runbook's steps
// All adapter parameters (table, key, etc.) are read from step.params, not hardcoded
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { IncidentInput, EvidenceItem, AgentDebuggerConfig, IncidentReport } from '../types/index.js';
import { LangfuseClient } from '../adapters/langfuse/client.js';
import { runLangfuseAdapter } from '../adapters/langfuse/normalizer.js';
import { DbReadonlyClient } from '../adapters/db/client.js';
import { runDbAdapter } from '../adapters/db/normalizer.js';
import { RedisClient } from '../adapters/redis/client.js';
import { runRedisAdapter } from '../adapters/redis/normalizer.js';
import { determineConclusion, buildReport } from './reporter.js';
import { resolveRunbookFilePath } from './runbook-paths.js';

// ─────────────────────────────────────────
// Runbook YAML Type Definitions
// ─────────────────────────────────────────

interface RunbookStep {
  id: string;
  tool: string;
  required: boolean;
  purpose: string;
  params?: {
    // DB Parameters
    table?: string;
    table_by_context_type?: Record<string, string>;
    match_column?: string;
    match_column_by_context_type?: Record<string, string>;
    // Redis Parameters (Supports {{context_id}} interpolation)
    key_template?: string;
    key_template_by_context_type?: Record<string, string>;
    // Trace Parameters: If context_type is not trace_id, used to query associated trace_id in DB
    trace_ref_column?: string;
    trace_ref_column_by_context_type?: Record<string, string>;
    trace_ref_table?: string;
    trace_ref_table_by_context_type?: Record<string, string>;
    trace_ref_match_column?: string;
    trace_ref_match_column_by_context_type?: Record<string, string>;
  };
}

interface RunbookYaml {
  name: string;
  match?: {
    context_types?: string[];
  };
  steps: RunbookStep[];
}

interface ExecutionMetadata {
  name: string;
  operations: string[];
}

interface DecisionMetadata {
  name: string;
  confirmed_fact_templates?: Array<{ finding_type: string; text: string }>;
  default_confirmed_facts?: string[];
  rules?: Array<{
    id: string;
    all?: string[];
    conclusion: string;
    confidence: number;
    root_cause?: string;
    alternative_hypotheses?: string[];
    recommended_next_actions?: string[];
  }>;
  fallback?: {
    id?: string;
    conclusion: string;
    confidence: number;
    root_cause?: string;
    alternative_hypotheses?: string[];
    recommended_next_actions?: string[];
  };
}

export interface ExecutionContext {
  incident: IncidentInput;
  config: AgentDebuggerConfig;
  selectedRunbook: string;
  configuredRunbooks?: string[];
}

// ─────────────────────────────────────────
// Main Entrypoint
// ─────────────────────────────────────────

export async function executeRunbook(ctx: ExecutionContext): Promise<IncidentReport> {
  const { incident, config, selectedRunbook } = ctx;
  const configuredRunbooks = ctx.configuredRunbooks ?? config.runbooks;

  // Load YAML and JSON metadata
  const [runbookYaml, decision] = await Promise.all([
    loadRunbookYaml(selectedRunbook, configuredRunbooks),
    loadRunbookJson<DecisionMetadata>(selectedRunbook, 'decision', configuredRunbooks),
  ]);
  validateRunbookContext(runbookYaml, incident.context_type, selectedRunbook);

  // Execute sequentially per YAML steps (backward compatible with execution.json operations)
  const steps = runbookYaml.steps ?? (await getFallbackSteps(selectedRunbook, configuredRunbooks));
  const evidence: EvidenceItem[] = [];

  for (const step of steps) {
    const result = await runStep(step, incident, config);
    evidence.push(...result.evidence);
    if (!result.ok && step.required) {
      // Required step failed: log warning, do not abort (try to collect more evidence)
      evidence.push(makeErrorEvidence(step.id, result.errors[0] ?? 'Unknown error', incident.context_id));
    }
  }

  // Derive cross-source evidence
  evidence.push(...deriveCrossSourceEvidence(evidence, incident.context_id));

  // Deduplicate -> Decision -> Report
  const deduped = dedupeEvidence(evidence);
  const decisionResult = determineConclusion(decision, deduped);
  return buildReport(incident, selectedRunbook, decision, deduped, decisionResult);
}

// ─────────────────────────────────────────
// Step Dispatching: Call adapter based on tool type + step.params
// ─────────────────────────────────────────

async function runStep(
  step: RunbookStep,
  incident: IncidentInput,
  config: AgentDebuggerConfig,
): Promise<{ ok: boolean; evidence: EvidenceItem[]; errors: string[] }> {
  const { tool, params, id } = step;
  const entityId = incident.context_id;

  // ── Trace Operations ──────────────────────────
  if (tool.startsWith('trace.')) {
    if (!config.adapters.langfuse) {
      return { ok: false, evidence: [], errors: [`[${id}] langfuse adapter not configured`] };
    }
    // Use directly if context_type is already trace_id, otherwise query DB for mapping
    const traceRefTable = resolveContextParam(
      params?.trace_ref_table,
      params?.trace_ref_table_by_context_type,
      incident.context_type,
    ) ?? 'orders';
    const traceRefColumn = resolveContextParam(
      params?.trace_ref_column,
      params?.trace_ref_column_by_context_type,
      incident.context_type,
    ) ?? 'trace_id';
    const traceRefMatchColumn = resolveContextParam(
      params?.trace_ref_match_column,
      params?.trace_ref_match_column_by_context_type,
      incident.context_type,
    ) ?? incident.context_type;
    const traceId = incident.context_type === 'trace_id'
      ? entityId
      : await resolveTraceId(
        incident,
        config,
        traceRefTable,
        traceRefColumn,
        traceRefMatchColumn,
      );

    if (!traceId) {
      return { ok: false, evidence: [], errors: [`[${id}] cannot resolve to trace_id`] };
    }

    const client = new LangfuseClient(config.adapters.langfuse);
    const result = await runLangfuseAdapter(client, traceId, entityId);
    return { ok: result.ok, evidence: result.evidence, errors: result.errors };
  }

  // ── DB Operations ──────────────────────────────
  if (tool.startsWith('db.')) {
    if (!config.adapters.db) {
      return { ok: false, evidence: [], errors: [`[${id}] db adapter not configured`] };
    }
    const table = resolveContextParam(params?.table, params?.table_by_context_type, incident.context_type) ?? 'orders';
    const matchColumn = resolveContextParam(
      params?.match_column,
      params?.match_column_by_context_type,
      incident.context_type,
    ) ?? incident.context_type;
    const client = new DbReadonlyClient(config.adapters.db);
    const result = await runDbAdapter(client, table, matchColumn, entityId, entityId);
    await client.close();
    return { ok: result.ok, evidence: result.evidence, errors: result.errors };
  }

  // ── Redis Operations ──────────────────────────
  if (tool.startsWith('redis.')) {
    if (!config.adapters.redis) {
      return { ok: false, evidence: [], errors: [`[${id}] redis adapter not configured`] };
    }
    // Supports {{context_id}} interpolation
    const keyTemplate = resolveContextParam(
      params?.key_template,
      params?.key_template_by_context_type,
      incident.context_type,
    ) ?? `{{context_id}}`;
    const key = keyTemplate.replace(/\{\{context_id\}\}/g, entityId);

    const client = new RedisClient(config.adapters.redis);
    const result = await runRedisAdapter(client, key, entityId);
    await client.close();
    return { ok: result.ok, evidence: result.evidence, errors: result.errors };
  }

  return { ok: false, evidence: [], errors: [`[${id}] Unknown tool type: ${tool}`] };
}

// ─────────────────────────────────────────
// trace_id mapping query (when context_type != trace_id)
// Example: order_id -> first check trace_id column in DB
// ─────────────────────────────────────────

async function resolveTraceId(
  incident: IncidentInput,
  config: AgentDebuggerConfig,
  traceRefTable: string,
  traceRefColumn: string,
  traceRefMatchColumn: string,
): Promise<string | null> {
  if (!config.adapters.db) return null;

  const client = new DbReadonlyClient(config.adapters.db);
  try {
    assertSafeIdentifier(traceRefTable);
    assertSafeIdentifier(traceRefColumn);
    assertSafeIdentifier(traceRefMatchColumn);
    const sql = `SELECT ${traceRefColumn} FROM ${traceRefTable} WHERE ${traceRefMatchColumn} = $1 LIMIT 1`;
    const result = await client.query(sql, [incident.context_id], traceRefTable);
    const row = result.rows[0];
    return (row?.[traceRefColumn] as string | undefined) ?? null;
  } catch {
    return null;
  } finally {
    await client.close();
  }
}

// ─────────────────────────────────────────
// Cross-source derived evidence (Redis vs DB status conflict)
// ─────────────────────────────────────────

function deriveCrossSourceEvidence(evidence: EvidenceItem[], entityId: string): EvidenceItem[] {
  const findingTypes = new Set(evidence.map((e) => e.finding_type));

  if (findingTypes.has('cache_key_exists') && findingTypes.has('db_row_missing')) {
    return [{
      id: `${entityId}-derived-status-mismatch`,
      source: 'derived',
      entity_id: entityId,
      timestamp: new Date().toISOString(),
      finding_type: 'status_mismatch',
      summary: 'Data found in Redis cache, but corresponding record missing in DB; status inconsistent',
      confidence: 0.85,
      raw_ref: 'derived:redis-vs-db',
      normalization_status: 'complete',
      severity: 'warning',
    }];
  }
  return [];
}

// ─────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────

async function loadRunbookYaml(runbookName: string, configuredRunbooks: string[] = []): Promise<RunbookYaml> {
  const filePath = await resolveRunbookFilePath(runbookName, 'yaml', configuredRunbooks);
  const content = await readFile(filePath, 'utf-8');
  return parseYaml(content) as RunbookYaml;
}

async function loadRunbookJson<T>(
  runbookName: string,
  kind: 'selector' | 'execution' | 'decision',
  configuredRunbooks: string[] = [],
): Promise<T> {
  const filePath = await resolveRunbookFilePath(runbookName, kind, configuredRunbooks);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/** Backward compatibility for execution.json: if YAML has no steps, generate step objects from operations array */
async function getFallbackSteps(runbookName: string, configuredRunbooks: string[] = []): Promise<RunbookStep[]> {
  const execution = await loadRunbookJson<ExecutionMetadata>(runbookName, 'execution', configuredRunbooks);
  return (execution.operations ?? []).map((op) => ({
    id: op,
    tool: op,
    required: false,
    purpose: op,
  }));
}

function dedupeEvidence(evidence: EvidenceItem[]): EvidenceItem[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.finding_type}:${item.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeErrorEvidence(stepId: string, message: string, entityId: string): EvidenceItem {
  return {
    id: `${entityId}-step-error-${stepId}`,
    source: 'derived',
    entity_id: entityId,
    timestamp: new Date().toISOString(),
    finding_type: 'step_error',
    summary: `Step [${stepId}] execution failed: ${message}`,
    confidence: 1,
    raw_ref: `step:${stepId}`,
    severity: 'error',
    normalization_status: 'complete',
  };
}

function resolveContextParam(
  directValue: string | undefined,
  mappedValue: Record<string, string> | undefined,
  contextType: string,
): string | undefined {
  return mappedValue?.[contextType] ?? directValue;
}

function assertSafeIdentifier(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
}

function validateRunbookContext(runbookYaml: RunbookYaml, contextType: string, runbookName: string): void {
  const supported = runbookYaml.match?.context_types;
  if (supported && supported.length > 0 && !supported.includes(contextType)) {
    throw new Error(`Runbook "${runbookName}" does not support context_type "${contextType}".`);
  }
}
