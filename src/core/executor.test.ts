import { describe, it, expect, vi } from 'vitest';
import { executeRunbook } from './executor.js';
import { runLangfuseAdapter } from '../adapters/langfuse/normalizer.js';
import { runDbAdapter } from '../adapters/db/normalizer.js';
import { runRedisAdapter } from '../adapters/redis/normalizer.js';

// 模拟 adapters
vi.mock('../adapters/langfuse/normalizer.js', () => ({
  runLangfuseAdapter: vi.fn()
}));
vi.mock('../adapters/db/normalizer.js', () => ({
  runDbAdapter: vi.fn()
}));
vi.mock('../adapters/redis/normalizer.js', () => ({
  runRedisAdapter: vi.fn()
}));

// 因为我们只需测试执行引擎调度，并不想测内部调用的 constructor
// 所以再把 clients 模块 mock 掉
vi.mock('../adapters/langfuse/client.js', () => ({
  LangfuseClient: class {}
}));
vi.mock('../adapters/db/client.js', () => ({
  DbReadonlyClient: class {
    close = vi.fn();
    query = vi.fn();
  }
}));
vi.mock('../adapters/redis/client.js', () => ({
  RedisClient: class {
    close = vi.fn();
  }
}));

describe('Executor Engine', () => {
  it('应当能正常执行 cache_stale runbook 调度逻辑', async () => {
    // 准备 Mock 证据返回值
    vi.mocked(runLangfuseAdapter).mockResolvedValue({
      ok: true, source: 'trace', evidence: [
        { finding_type: 'trace_found', summary: 'Mock trace' } as any
      ], errors: [], raw: null
    });

    vi.mocked(runDbAdapter).mockResolvedValue({
      ok: true, source: 'db', evidence: [
        { finding_type: 'db_row_found', summary: 'Mock row' } as any
      ], errors: []
    });

    vi.mocked(runRedisAdapter).mockResolvedValue({
      ok: true, source: 'redis', evidence: [
        { finding_type: 'cache_key_exists', summary: 'Mock cache' } as any
      ], errors: [], raw: null
    });

    const report = await executeRunbook({
      incident: { context_id: '123', context_type: 'trace_id', symptom: '缓存陈旧', expected: '最新数据' },
      config: {
        adapters: {
          langfuse: { base_url: '', public_key: '', secret_key: '', span_field_allowlist: [] },
          db: { type: 'postgres', connection_string: '', allowed_tables: [] },
          redis: { url: '', key_prefix_allowlist: [] }
        },
        runbooks: []
      },
      selectedRunbook: 'cache_stale'
    });

    // 检查最终结果
    expect(report.incident_summary).toContain('缓存陈旧');
    expect(report.selected_runbook).toBe('cache_stale');
    
    // 它应该调用了 normalizer，生成了各种 finding，且决策引擎最终判定了结论
    expect(report.evidence.length).toBeGreaterThan(0);
    // 因为这三个找到证据，按照 cache_stale 的 rules，如果有 cache_key_exists + db_row_found
    // 可能还会引发一些衍生状态不一致（derived_status_mismatch 也可能出现）
    expect(report.primary_conclusion).toBeDefined();

    // 验证调用了对应的 mock 适配器
    expect(runLangfuseAdapter).toHaveBeenCalled();
    expect(runDbAdapter).toHaveBeenCalled();
    expect(runRedisAdapter).toHaveBeenCalled();
  });
});
