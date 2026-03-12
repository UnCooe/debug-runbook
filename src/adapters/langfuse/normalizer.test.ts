import { describe, it, expect, vi } from 'vitest';
import { runLangfuseAdapter } from './normalizer.js';
import type { LangfuseClient } from './client.js';

describe('Langfuse Normalizer', () => {
  it('应当返回 trace_missing evidence (trace 不存在)', async () => {
    const clientMock = {
      lookupTrace: vi.fn().mockResolvedValue(null),
      inspectSpans: vi.fn().mockResolvedValue([])
    } as unknown as LangfuseClient;

    const result = await runLangfuseAdapter(clientMock, 'trace-404', 'trace-404');

    expect(result.ok).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.finding_type).toBe('trace_missing');
  });

  it('应当返回 trace_found 和 downstream_error (有 ERROR span)', async () => {
    const clientMock = {
      lookupTrace: vi.fn().mockResolvedValue({
        id: 'trace-123',
        name: 'PlaceOrder',
        userId: 'u1',
        sessionId: 's1',
        input: {}, output: {}, metadata: {},
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:05Z',
        totalCost: 0.01,
        latency: 5000
      }),
      inspectSpans: vi.fn().mockResolvedValue([
        {
          id: 'span-1', traceId: 'trace-123', name: 'SaveDB',
          type: 'SPAN', level: 'DEFAULT', statusMessage: null,
          startTime: '2023-01-01T00:00:01Z', endTime: '2023-01-01T00:00:02Z',
          latency: 1000, input: {}, output: {}, metadata: {}, parentObservationId: null
        },
        {
          id: 'span-2', traceId: 'trace-123', name: 'CallDownstream',
          type: 'SPAN', level: 'ERROR', statusMessage: 'Connection Timeout',
          startTime: '2023-01-01T00:00:02Z', endTime: '2023-01-01T00:00:05Z',
          latency: 3000, input: {}, output: {}, metadata: {}, parentObservationId: null
        }
      ])
    } as unknown as LangfuseClient;

    const result = await runLangfuseAdapter(clientMock, 'trace-123', 'trace-123');

    expect(result.ok).toBe(true);
    // 包含 1 个 trace_found, 1 个 downstream_error
    expect(result.evidence).toHaveLength(2);

    const traceFounds = result.evidence.filter(e => e.finding_type === 'trace_found');
    expect(traceFounds).toHaveLength(1);
    expect(traceFounds[0]!.severity).toBe('informational');

    const downstreamErrors = result.evidence.filter(e => e.finding_type === 'downstream_error');
    expect(downstreamErrors).toHaveLength(1);
    expect(downstreamErrors[0]!.summary).toContain('Connection Timeout');
    expect(downstreamErrors[0]!.severity).toBe('error');
  });
});
