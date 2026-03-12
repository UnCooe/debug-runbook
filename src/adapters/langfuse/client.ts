// Langfuse Adapter Client
// 封装 Langfuse API v2，只暴露调试框架所需的只读操作
// 支持 Cloud 和 Self-hosted 两种部署方式（base_url 可配置）
import type { LangfuseConfig } from '../../types/index.js';

// ─────────────────────────────────────────
// Langfuse API 原始类型定义
// ─────────────────────────────────────────

export interface LangfuseTrace {
  id: string;
  name: string | null;
  userId: string | null;
  sessionId: string | null;
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  totalCost: number | null;
  latency: number | null;
}

export interface LangfuseObservation {
  id: string;
  traceId: string;
  name: string | null;
  type: 'SPAN' | 'GENERATION' | 'EVENT';
  level: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  statusMessage: string | null;
  startTime: string;
  endTime: string | null;
  latency: number | null;
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown>;
  parentObservationId: string | null;
}

// ─────────────────────────────────────────
// Client
// ─────────────────────────────────────────

export class LangfuseClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly allowlist: string[];

  constructor(config: LangfuseConfig) {
    this.baseUrl = config.base_url.replace(/\/$/, '');
    // Basic Auth: public_key:secret_key（Langfuse 规范）
    const credentials = Buffer.from(`${config.public_key}:${config.secret_key}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
    this.allowlist = config.span_field_allowlist;
  }

  /**
   * 通过 trace_id 获取 trace 元信息
   */
  async lookupTrace(traceId: string): Promise<LangfuseTrace | null> {
    const response = await this.request(`/api/public/traces/${encodeURIComponent(traceId)}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Langfuse lookupTrace 失败: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<LangfuseTrace>;
  }

  /**
   * 获取 trace 下所有 observation（spans），按 allowlist 过滤字段后返回
   * 避免将完整 payload 传入大模型造成 token 爆炸
   */
  async inspectSpans(traceId: string): Promise<LangfuseObservation[]> {
    const response = await this.request(
      `/api/public/observations?traceId=${encodeURIComponent(traceId)}&limit=50`
    );
    if (!response.ok) {
      throw new Error(`Langfuse inspectSpans 失败: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as { data: LangfuseObservation[] };
    return (data.data || []).map((obs) => this.filterObservationFields(obs));
  }

  /**
   * 只返回 level=ERROR 的 observation
   */
  async getErrors(traceId: string): Promise<LangfuseObservation[]> {
    const spans = await this.inspectSpans(traceId);
    return spans.filter((obs) => obs.level === 'ERROR');
  }

  // ─── 内部工具 ───────────────────────────

  private async request(endpoint: string): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    return fetch(url, {
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000), // 15s 超时
    });
  }

  /**
   * 按 span_field_allowlist 过滤 observation 字段
   * 防止把完整 LLM input/output 注入进证据对象
   */
  private filterObservationFields(obs: LangfuseObservation): LangfuseObservation {
    const filtered = { ...obs };

    for (const field of ['input', 'output', 'metadata'] as const) {
      if (filtered[field] && typeof filtered[field] === 'object') {
        const picked = pickByAllowlist(filtered[field] as Record<string, unknown>, this.allowlist, field);
        (filtered as Record<string, unknown>)[field] = picked;
      }
    }

    return filtered;
  }
}

/**
 * 从对象中按点路径 allowlist 提取字段
 * 例如 allowlist=['metadata.error'] 只保留 metadata.error
 */
function pickByAllowlist(
  obj: Record<string, unknown>,
  allowlist: string[],
  prefix: string
): Record<string, unknown> {
  const relevant = allowlist
    .filter((path) => path === prefix || path.startsWith(`${prefix}.`))
    .map((path) => path.slice(prefix.length).replace(/^\./, ''));

  if (relevant.length === 0) return obj; // 无限制，返回全部

  const result: Record<string, unknown> = {};
  for (const key of relevant) {
    const value = key.split('.').reduce((cur: unknown, seg) =>
      cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[seg] : undefined, obj);
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
