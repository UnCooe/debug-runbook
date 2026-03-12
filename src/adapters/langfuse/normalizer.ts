// Langfuse Adapter Normalizer
// 将 Langfuse 原始 API 响应转换为标准 Evidence 对象
import type { EvidenceItem } from '../../types/index.js';
import type { LangfuseClient, LangfuseTrace, LangfuseObservation } from './client.js';

export interface LangfuseAdapterResult {
  ok: boolean;
  source: 'trace';
  evidence: EvidenceItem[];
  errors: string[];
  raw: {
    trace: LangfuseTrace | null;
    spans: LangfuseObservation[];
    errors: LangfuseObservation[];
  } | null;
}

export async function runLangfuseAdapter(
  client: LangfuseClient,
  traceId: string,
  entityId: string,
): Promise<LangfuseAdapterResult> {
  const timestamp = new Date().toISOString();
  const errors: string[] = [];

  // 1. 查找 trace
  let trace: LangfuseTrace | null = null;
  try {
    trace = await client.lookupTrace(traceId);
  } catch (err) {
    errors.push(`lookupTrace 失败: ${String(err)}`);
    return { ok: false, source: 'trace', evidence: [], errors, raw: null };
  }

  if (!trace) {
    // Trace 不存在 → trace_missing 证据
    return {
      ok: true,
      source: 'trace',
      evidence: [{
        id: `${entityId}-trace-missing`,
        source: 'trace',
        entity_id: entityId,
        timestamp,
        finding_type: 'trace_missing',
        summary: `未在 Langfuse 中找到 trace_id=${traceId}，该请求可能未到达可观测的服务流`,
        confidence: 'medium',
        raw_ref: `langfuse:traces/${traceId}`,
        normalization_status: 'complete',
      }],
      errors,
      raw: { trace: null, spans: [], errors: [] },
    };
  }

  // 2. 获取所有 spans 和错误
  let spans: LangfuseObservation[] = [];
  let errorSpans: LangfuseObservation[] = [];
  try {
    spans = await client.inspectSpans(traceId);
    errorSpans = spans.filter((s) => s.level === 'ERROR');
  } catch (err) {
    errors.push(`inspectSpans 失败: ${String(err)}`);
  }

  // 3. 规范化为 Evidence 列表
  const evidence: EvidenceItem[] = [];

  // trace_found
  evidence.push({
    id: `${entityId}-trace-found`,
    source: 'trace',
    entity_id: entityId,
    timestamp,
    finding_type: 'trace_found',
    summary: buildTraceSummary(trace),
    confidence: 'high',
    raw_ref: `langfuse:traces/${traceId}`,
    normalization_status: 'complete',
    severity: 'informational',
  });

  // 错误 spans → downstream_error
  for (const errSpan of errorSpans) {
    evidence.push({
      id: `${entityId}-span-error-${errSpan.id}`,
      source: 'trace',
      entity_id: entityId,
      timestamp: errSpan.startTime,
      finding_type: 'downstream_error',
      summary: buildSpanErrorSummary(errSpan),
      confidence: 'high',
      raw_ref: `langfuse:observations/${errSpan.id}`,
      span_id: errSpan.id,
      normalization_status: 'complete',
      severity: 'error',
    });
  }

  return {
    ok: true,
    source: 'trace',
    evidence,
    errors,
    raw: { trace, spans, errors: errorSpans },
  };
}

// ─── 格式化辅助函数 ───────────────────────────

function buildTraceSummary(trace: LangfuseTrace): string {
  const parts: string[] = [`Trace ${trace.id} 已找到`];
  if (trace.name) parts.push(`name=${trace.name}`);
  if (trace.latency != null) parts.push(`耗时=${trace.latency}ms`);
  if (trace.totalCost != null) parts.push(`cost=$${trace.totalCost.toFixed(4)}`);
  return parts.join('，');
}

function buildSpanErrorSummary(span: LangfuseObservation): string {
  const name = span.name ?? span.id;
  const msg = span.statusMessage ?? '无错误信息';
  return `Span [${name}] 报错：${msg}`;
}
