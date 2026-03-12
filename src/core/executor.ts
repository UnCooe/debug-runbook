// Executor - Runbook 执行调度器
// 根据选定的 Runbook 执行 operations，调用对应 Adapter，聚合 Evidence
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncidentInput, EvidenceItem, AgentDebuggerConfig } from '../types/index.js';
import { LangfuseClient } from '../adapters/langfuse/client.js';
import { runLangfuseAdapter } from '../adapters/langfuse/normalizer.js';
import { DbReadonlyClient } from '../adapters/db/client.js';
import { runDbAdapter } from '../adapters/db/normalizer.js';
import { RedisClient } from '../adapters/redis/client.js';
import { runRedisAdapter } from '../adapters/redis/normalizer.js';
import { determineConclusion, buildReport } from './reporter.js';
import type { IncidentReport } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNBOOK_DIR = path.resolve(__dirname, '..', '..', 'runbooks');

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

export async function executeRunbook(ctx: ExecutionContext): Promise<IncidentReport> {
  const { incident, config, selectedRunbook } = ctx;

  // 1. 加载执行计划和决策元数据
  const [execution, decision] = await Promise.all([
    loadRunbookMetadata<ExecutionMetadata>(selectedRunbook, 'execution'),
    loadRunbookMetadata<DecisionMetadata>(selectedRunbook, 'decision'),
  ]);

  // 2. 依序执行 operations，收集 Evidence
  const evidence: EvidenceItem[] = [];
  const errors: string[] = [];

  for (const operation of execution.operations ?? []) {
    const result = await runOperation(operation, incident, config);
    evidence.push(...result.evidence);
    errors.push(...result.errors);
  }

  // 3. 跨源派生证据（status_mismatch 等）
  const derived = deriveCrossSourceEvidence(evidence, incident.context_id);
  evidence.push(...derived);

  // 4. 去重
  const deduped = dedupeEvidence(evidence);

  // 5. 决策 + 报告
  const decisionResult = determineConclusion(decision, deduped);
  return buildReport(incident, selectedRunbook, decision, deduped, decisionResult);
}

// ─────────────────────────────────────────
// Operation 分发
// ─────────────────────────────────────────

async function runOperation(
  operation: string,
  incident: IncidentInput,
  config: AgentDebuggerConfig,
): Promise<{ evidence: EvidenceItem[]; errors: string[] }> {
  const entityId = incident.context_id;

  // trace 操作 → Langfuse Adapter
  if (operation.startsWith('trace.')) {
    if (!config.adapters.langfuse) {
      return { evidence: [], errors: [`trace adapter 未配置，跳过操作: ${operation}`] };
    }
    const result = await runLangfuseAdapter(config.adapters.langfuse, entityId, entityId);
    return { evidence: result.evidence, errors: result.errors };
  }

  // db 操作 → DB Readonly Adapter
  if (operation.startsWith('db.')) {
    if (!config.adapters.db) {
      return { evidence: [], errors: [`db adapter 未配置，跳过操作: ${operation}`] };
    }
    const client = new DbReadonlyClient(config.adapters.db);
    // 使用 context_type 推断查询列名（如 order_id / trace_id）
    const column = incident.context_type.replace('_id', '') + '_id';
    const result = await runDbAdapter(client, 'orders', column, entityId, entityId);
    await client.close();
    return { evidence: result.evidence, errors: result.errors };
  }

  // redis 操作 → Redis Adapter
  if (operation.startsWith('redis.')) {
    if (!config.adapters.redis) {
      return { evidence: [], errors: [`redis adapter 未配置，跳过操作: ${operation}`] };
    }
    const client = new RedisClient(config.adapters.redis);
    // 使用配置白名单中第一个前缀 + entityId 作为 key（团队可在 runbook 中覆盖）
    const prefix = config.adapters.redis.key_prefix_allowlist[0] ?? '';
    const key = `${prefix}${entityId}`;
    const result = await runRedisAdapter(client, key, entityId);
    await client.close();
    return { evidence: result.evidence, errors: result.errors };
  }

  return { evidence: [], errors: [`未知操作类型: ${operation}`] };
}

// ─────────────────────────────────────────
// 跨源派生证据（Redis vs DB 状态冲突）
// ─────────────────────────────────────────

function deriveCrossSourceEvidence(evidence: EvidenceItem[], entityId: string): EvidenceItem[] {
  const findingTypes = new Set(evidence.map((e) => e.finding_type));

  // cache_key_exists + db_row_missing → status_mismatch
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

async function loadRunbookMetadata<T>(runbookName: string, kind: string): Promise<T> {
  const filePath = path.join(RUNBOOK_DIR, `${runbookName}.${kind}.json`);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
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
