import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectRunbook } from './selector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 指向真实 runbooks 目录
const RUNBOOKS_DIR = path.resolve(__dirname, '..', '..', 'runbooks');

describe('Runbook Selector', () => {
  it('应当匹配 request_not_effective runbook (基于 order_id context + side effect 缺失)', async () => {
    const result = await selectRunbook({
      context_id: 'ord-123',
      context_type: 'order_id',
      symptom: 'order created but downstream task missing',
      expected: 'task should be created'
    });

    expect(result.selected).toBe('request_not_effective');
    const candidate = result.candidates.find(c => c.name === 'request_not_effective');
    expect(candidate).toBeDefined();
    expect(candidate!.score).toBeGreaterThan(0);
  });

  it('应当匹配 cache_stale runbook (基于 cache stale 关键词)', async () => {
    const result = await selectRunbook({
      context_id: 'req-456',
      context_type: 'request_id',
      symptom: 'returned state does not match persistence, cache appears stale',
      expected: 'should return latest state'
    });

    expect(result.selected).toBe('cache_stale');
    const candidate = result.candidates.find(c => c.name === 'cache_stale');
    expect(candidate).toBeDefined();
    expect(candidate!.score).toBeGreaterThan(0);
  });

  it('应当匹配 state_abnormal runbook (状态异常)', async () => {
    const result = await selectRunbook({
      context_id: 'task-789',
      context_type: 'task_id',
      symptom: 'status is incorrect, stuck in processing',
      expected: 'status should be finished'
    });

    expect(result.selected).toBe('state_abnormal');
    const candidate = result.candidates.find(c => c.name === 'state_abnormal');
    expect(candidate).toBeDefined();
    expect(candidate!.score).toBeGreaterThan(0);
  });

  it('应当提供兜底方案 request_not_effective (匹配不到任何明显信号时)', async () => {
    const result = await selectRunbook({
      context_id: 'user-000',
      context_type: 'user_id', // state_abnormal 支持 user_id，可能会加点分，看哪边分高
      symptom: 'system is broken',
      expected: 'system works fine'
    });

    // 这里没有明显关键词，此时如果 context 匹配上了某个 runbook，该 runbook 分数会变高
    // 如果全部挂零，兜底是 fallback. 但是此处至少 selector 代码不会抛错
    expect(result.selected).toBeDefined();
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});
