import { describe, it, expect, vi } from 'vitest';
import { runRedisAdapter } from './normalizer.js';
import { RedisClient } from './client.js';

vi.mock('./client.js', () => {
  return {
    RedisClient: vi.fn().mockImplementation(() => {
      return {
        inspect: vi.fn(),
        close: vi.fn()
      };
    })
  };
});

describe('Redis Normalizer', () => {
  it('应当返回 cache_key_missing evidence (不存在)', async () => {
    const clientMock = {
      inspect: vi.fn().mockResolvedValue({
        exists: false, type: null, ttl_seconds: null, value_preview: null
      })
    } as unknown as RedisClient;

    const result = await runRedisAdapter(clientMock, 'cache:key404', 'ctx-1');

    expect(result.ok).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.finding_type).toBe('cache_key_missing');
  });

  it('应当返回 cache_key_exists + cache_ttl_positive evidence (存在且带有 TTL)', async () => {
    const clientMock = {
      inspect: vi.fn().mockResolvedValue({
        exists: true, type: 'string', ttl_seconds: 3600, value_preview: '{"status":"PAID"}'
      })
    } as unknown as RedisClient;

    const result = await runRedisAdapter(clientMock, 'cache:key200', 'ctx-2');

    expect(result.ok).toBe(true);
    expect(result.evidence).toHaveLength(2); // 一个是存在，一个是 TTL positive

    const existsEv = result.evidence.find(e => e.finding_type === 'cache_key_exists');
    expect(existsEv).toBeDefined();

    const ttlEv = result.evidence.find(e => e.finding_type === 'cache_ttl_positive');
    expect(ttlEv).toBeDefined();
    expect(ttlEv!.summary).toContain('3600');
  });

  it('应当只返回 cache_key_exists (存在但无过期时间)', async () => {
    const clientMock = {
      inspect: vi.fn().mockResolvedValue({
        exists: true, type: 'hash', ttl_seconds: null, value_preview: { a: 1 }
      })
    } as unknown as RedisClient;

    const result = await runRedisAdapter(clientMock, 'cache:key_perm', 'ctx-3');

    expect(result.ok).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.finding_type).toBe('cache_key_exists');
  });
});
