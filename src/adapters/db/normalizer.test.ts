import { describe, it, expect, vi } from 'vitest';
import { runDbAdapter } from './normalizer.js';
import { DbReadonlyClient } from './client.js';

vi.mock('./client.js', () => {
  return {
    DbReadonlyClient: vi.fn().mockImplementation(() => {
      return {
        lookupEntity: vi.fn(),
        close: vi.fn()
      };
    })
  };
});

describe('DB Normalizer', () => {
  it('应当返回 db_row_found evidence (有数据)', async () => {
    // 伪造 DbReadonlyClient 实例，它只需要方法就行，构造函数其实在此处没用，因为我们直接用实例参数传入
    // normalizer 接收的 client 类型只需要有 lookupEntity
    const clientMock = {
      lookupEntity: vi.fn().mockResolvedValue({
        rows: [{ id: 'ord-123', status: 'PAID' }],
        rowCount: 1,
        table: 'orders'
      })
    } as unknown as DbReadonlyClient;

    const result = await runDbAdapter(clientMock, 'orders', 'order_id', 'ord-123', 'ctx-1');

    expect(result.ok).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.finding_type).toBe('db_row_found');
    expect(result.evidence[0]!.severity).toBe('informational');
    expect(result.evidence[0]!.summary).toContain('1 条');
  });

  it('应当返回 db_row_missing evidence (0 行数据)', async () => {
    const clientMock = {
      lookupEntity: vi.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
        table: 'orders'
      })
    } as unknown as DbReadonlyClient;

    const result = await runDbAdapter(clientMock, 'orders', 'order_id', 'ord-404', 'ctx-2');

    expect(result.ok).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.finding_type).toBe('db_row_missing');
    expect(result.evidence[0]!.severity).toBe('warning');
    expect(result.evidence[0]!.summary).toContain('未找到');
  });

  it('抛出异常时应当返回 {ok: false}', async () => {
    const clientMock = {
      lookupEntity: vi.fn().mockRejectedValue(new Error('DB Timeout'))
    } as unknown as DbReadonlyClient;

    const result = await runDbAdapter(clientMock, 'orders', 'order_id', 'ord-err', 'ctx-3');

    expect(result.ok).toBe(false);
    expect(result.evidence).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DB Timeout');
  });
});
