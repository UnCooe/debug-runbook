// Executor - Runbook Execution Scheduler
// Dynamically invokes the corresponding adapter based on the selected runbook steps.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { AgentDebuggerConfig, EvidenceItem, IncidentInput, IncidentReport } from '../types/index.js';
import { DbReadonlyClient } from '../adapters/db/client.js';
import { runDbAdapter } from '../adapters/db/normalizer.js';
import { LangfuseClient } from '../adapters/langfuse/client.js';
import { runLangfuseAdapter } from '../adapters/langfuse/normalizer.js';
import { RedisClient } from '../adapters/redis/client.js';
import { runRedisAdapter } from '../adapters/redis/normalizer.js';
import {
  getAdapterHandler,
  makeStepErrorResult,
  registerAdapterHandler,
  type RunbookStep,
} from './adapter-registry.js';
import type { DecisionMetadata } from './decision.js';
import { buildReport, determineConclusion } from './reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNBOOK_DIR = path.resolve(__dirname, '..', '..', 'runbooks');

interface RunbookYaml {
  name: string;
  steps: RunbookStep[];
}

interface ExecutionMetadata {
  name: string;
  operations: string[];
}

export interface ExecutionContext {
  incident: IncidentInput;
  config: AgentDebuggerConfig;
  selectedRunbook: string;
}

registerAdapterHandler({
  prefix: 'trace.',
  async run({ incident, config, step }) {
    if (!config.adapters.langfuse) {
      return makeStepErrorResult(`[${step.id}] langfuse adapter not configured`);
    }

    const entityId = incident.context_id;
    const traceId = incident.context_type === 'trace_id'
      ? entityId
      : await resolveTraceId(incident, config, step.params?.trace_ref_column ?? 'trace_id');

    if (!traceId) {
      return makeStepErrorResult(`[${step.id}] cannot resolve to trace_id`);
    }

    const client = new LangfuseClient(config.adapters.langfuse);
    const result = await runLangfuseAdapter(client, traceId, entityId);
    return { ok: result.ok, source: result.source, evidence: result.evidence, errors: result.errors };
  },
});

registerAdapterHandler({
  prefix: 'db.',
  async run({ incident, config, step }) {
    if (!config.adapters.db) {
      return makeStepErrorResult(`[${step.id}] db adapter not configured`);
    }

    const entityId = incident.context_id;
    const table = step.params?.table ?? 'orders';
    const matchColumn = step.params?.match_column ?? incident.context_type;
    const client = new DbReadonlyClient(config.adapters.db);

    try {
      const result = await runDbAdapter(client, table, matchColumn, entityId, entityId);
      return { ok: result.ok, source: result.source, evidence: result.evidence, errors: result.errors };
    } finally {
      await client.close();
    }
  },
});

registerAdapterHandler({
  prefix: 'redis.',
  async run({ incident, config, step }) {
    if (!config.adapters.redis) {
      return makeStepErrorResult(`[${step.id}] redis adapter not configured`);
    }

    const entityId = incident.context_id;
    const keyTemplate = step.params?.key_template ?? '{{context_id}}';
    const key = keyTemplate.replace(/\{\{context_id\}\}/g, entityId);
    const client = new RedisClient(config.adapters.redis);

    try {
      const result = await runRedisAdapter(client, key, entityId);
      return { ok: result.ok, source: result.source, evidence: result.evidence, errors: result.errors };
    } finally {
      await client.close();
    }
  },
});

export async function executeRunbook(ctx: ExecutionContext): Promise<IncidentReport> {
  const { incident, config, selectedRunbook } = ctx;

  const [runbookYaml, decision] = await Promise.all([
    loadRunbookYaml(selectedRunbook),
    loadRunbookJson<DecisionMetadata>(selectedRunbook, 'decision'),
  ]);

  const steps = runbookYaml.steps ?? (await getFallbackSteps(selectedRunbook));
  const evidence: EvidenceItem[] = [];

  for (const step of steps) {
    const result = await runStep(step, incident, config);
    evidence.push(...result.evidence);
    if (!result.ok && step.required) {
      evidence.push(makeErrorEvidence(step.id, result.errors[0] ?? 'Unknown error', incident.context_id));
    }
  }

  evidence.push(...deriveCrossSourceEvidence(evidence, incident.context_id));

  const deduped = dedupeEvidence(evidence);
  const decisionResult = determineConclusion(decision, deduped);
  return buildReport(incident, selectedRunbook, decision, deduped, decisionResult);
}

async function runStep(
  step: RunbookStep,
  incident: IncidentInput,
  config: AgentDebuggerConfig,
): Promise<{ ok: boolean; evidence: EvidenceItem[]; errors: string[] }> {
  const handler = getAdapterHandler(step.tool);
  if (!handler) {
    return { ok: false, evidence: [], errors: [`[${step.id}] Unknown tool type: ${step.tool}`] };
  }

  const result = await handler.run({ step, incident, config });
  return { ok: result.ok, evidence: result.evidence, errors: result.errors };
}

async function resolveTraceId(
  incident: IncidentInput,
  config: AgentDebuggerConfig,
  traceRefColumn: string,
): Promise<string | null> {
  if (!config.adapters.db) return null;

  const client = new DbReadonlyClient(config.adapters.db);
  try {
    const matchColumn = incident.context_type;
    const sql = `SELECT ${traceRefColumn} FROM orders WHERE ${matchColumn} = $1 LIMIT 1`;
    const result = await client.query(sql, [incident.context_id], 'orders');
    const row = result.rows[0];
    return (row?.[traceRefColumn] as string | undefined) ?? null;
  } catch {
    return null;
  } finally {
    await client.close();
  }
}

function deriveCrossSourceEvidence(evidence: EvidenceItem[], entityId: string): EvidenceItem[] {
  const findingTypes = new Set(evidence.map((item) => item.finding_type));

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

async function loadRunbookYaml(runbookName: string): Promise<RunbookYaml> {
  const filePath = path.join(RUNBOOK_DIR, `${runbookName}.yaml`);
  const content = await readFile(filePath, 'utf-8');
  return parseYaml(content) as RunbookYaml;
}

async function loadRunbookJson<T>(runbookName: string, kind: string): Promise<T> {
  const filePath = path.join(RUNBOOK_DIR, `${runbookName}.${kind}.json`);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

async function getFallbackSteps(runbookName: string): Promise<RunbookStep[]> {
  const execution = await loadRunbookJson<ExecutionMetadata>(runbookName, 'execution');
  return (execution.operations ?? []).map((operation) => ({
    id: operation,
    tool: operation,
    required: false,
    purpose: operation,
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
