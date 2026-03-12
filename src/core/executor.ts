// Executor - Runbook 执行调度器
// 根据选定的 Runbook 的 steps 声明动态调用对应 Adapter
// 所有 adapter 参数（table、key 等）均从 step.params 读取，不硬编码
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { IncidentInput, EvidenceItem, AgentDebuggerConfig, IncidentReport } from '../types/index.js';
import { LangfuseClient } from '../adapters/langfuse/client.js';
import { runLangfuseAdapter } from '../adapters/langfuse/normalizer.js';
import { DbReadonlyClient } from '../adapters/db/client.js';
import { runDbAdapter } from '../adapters/db/normalizer.js';
import { RedisClient } from '../adapters/redis/client.js';
import { runRedisAdapter } from '../adapters/redis/normalizer.js';
import { determineConclusion, buildReport } from './reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNBOOK_DIR = path.resolve(__dirname, '..', '..', 'runbooks');

// ─────────────────────────────────────────
// Runbook YAML 类型定义
// ─────────────────────────────────────────

interface RunbookStep {
  id: string;
  tool: string;
  required: boolean;
  purpose: string;
  params?: {
    // DB 参数
    table?: string;
    match_column?: string;
    // Redis 参数（支持 {{context_id}} 插值）
    key_template?: string;
    // Trace 参数：若 context_type 非 trace_id，用于在 DB 中关联查询 trace_id
    trace_ref_column?: string;
  };
}

interface RunbookYaml {
  name: string;
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
}

// ─────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────

export async function executeRunbook(ctx: ExecutionContext): Promise<IncidentReport> {
  const { incident, config, selectedRunbook } = ctx;

  // 加载 YAML 和 JSON 元数据
  const [runbookYaml, decision] = await Promise.all([
    loadRunbookYaml(selectedRunbook),
    loadRunbookJson<DecisionMetadata>(selectedRunbook, 'decision'),
  ]);

  // 按 YAML steps 顺序执行（兼容旧 execution.json operation 列表）
  const steps = runbookYaml.steps ?? (await getFallbackSteps(selectedRunbook));
  const evidence: EvidenceItem[] = [];

  for (const step of steps) {
    const result = await runStep(step, incident, config);
    evidence.push(...result.evidence);
    if (!result.ok && step.required) {
      // 必选步骤失败：记录 warning，不中止（尽量收集更多证据）
      evidence.push(makeErrorEvidence(step.id, result.errors[0] ?? '未知错误', incident.context_id));
    }
  }

  // 跨源派生证据
  evidence.push(...deriveCrossSourceEvidence(evidence, incident.context_id));

  // 去重 → 决策 → 报告
  const deduped = dedupeEvidence(evidence);
  const decisionResult = determineConclusion(decision, deduped);
  return buildReport(incident, selectedRunbook, decision, deduped, decisionResult);
}

// ─────────────────────────────────────────
// Step 分发：根据 tool 类型 + step.params 调用对应 adapter
// ─────────────────────────────────────────

async function runStep(
  step: RunbookStep,
  incident: IncidentInput,
  config: AgentDebuggerConfig,
): Promise<{ ok: boolean; evidence: EvidenceItem[]; errors: string[] }> {
  const { tool, params, id } = step;
  const entityId = incident.context_id;

  // ── Trace 操作 ──────────────────────────
  if (tool.startsWith('trace.')) {
    if (!config.adapters.langfuse) {
      return { ok: false, evidence: [], errors: [`[${id}] langfuse adapter 未配置`] };
    }
    // 若 context_type 已是 trace_id 直接用，否则需要先查 DB 关联
    const traceId = incident.context_type === 'trace_id'
      ? entityId
      : await resolveTraceId(incident, config, params?.trace_ref_column ?? 'trace_id');

    if (!traceId) {
      return { ok: false, evidence: [], errors: [`[${id}] 无法关联到 trace_id`] };
    }

    const result = await runLangfuseAdapter(config.adapters.langfuse, traceId, entityId);
    return { ok: result.ok, evidence: result.evidence, errors: result.errors };
  }

  // ── DB 操作 ──────────────────────────────
  if (tool.startsWith('db.')) {
    if (!config.adapters.db) {
      return { ok: false, evidence: [], errors: [`[${id}] db adapter 未配置`] };
    }
    const table = params?.table ?? 'orders';
    const matchColumn = params?.match_column ?? incident.context_type;
    const client = new DbReadonlyClient(config.adapters.db);
    const result = await runDbAdapter(client, table, matchColumn, entityId, entityId);
    await client.close();
    return { ok: result.ok, evidence: result.evidence, errors: result.errors };
  }

  // ── Redis 操作 ──────────────────────────
  if (tool.startsWith('redis.')) {
    if (!config.adapters.redis) {
      return { ok: false, evidence: [], errors: [`[${id}] redis adapter 未配置`] };
    }
    // 支持 {{context_id}} 插值
    const keyTemplate = params?.key_template ?? `{{context_id}}`;
    const key = keyTemplate.replace(/\{\{context_id\}\}/g, entityId);

    const client = new RedisClient(config.adapters.redis);
    const result = await runRedisAdapter(client, key, entityId);
    await client.close();
    return { ok: result.ok, evidence: result.evidence, errors: result.errors };
  }

  return { ok: false, evidence: [], errors: [`[${id}] 未知操作类型: ${tool}`] };
}

// ─────────────────────────────────────────
// trace_id 关联查询（context_type != trace_id 的情况）
// 例如：order_id → 先查 DB 的 trace_id 列
// ─────────────────────────────────────────

async function resolveTraceId(
  incident: IncidentInput,
  config: AgentDebuggerConfig,
  traceRefColumn: string,
): Promise<string | null> {
  if (!config.adapters.db) return null;

  const client = new DbReadonlyClient(config.adapters.db);
  try {
    const matchColumn = incident.context_type; // e.g. "order_id"
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

// ─────────────────────────────────────────
// 跨源派生证据（Redis vs DB 状态冲突）
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
      summary: 'Redis 缓存中发现数据，但数据库中对应记录不存在，存在状态不一致',
      confidence: 0.85,
      raw_ref: 'derived:redis-vs-db',
      normalization_status: 'complete',
      severity: 'warning',
    }];
  }
  return [];
}

// ─────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────

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

/** 兼容旧版 execution.json：若 YAML 无 steps，降级用 operations 列表生成 step 对象 */
async function getFallbackSteps(runbookName: string): Promise<RunbookStep[]> {
  const execution = await loadRunbookJson<ExecutionMetadata>(runbookName, 'execution');
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
    summary: `步骤 [${stepId}] 执行失败：${message}`,
    confidence: 1,
    raw_ref: `step:${stepId}`,
    severity: 'error',
    normalization_status: 'complete',
  };
}
