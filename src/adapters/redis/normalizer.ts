// Redis Adapter Normalizer
// 将 Redis inspect 结果转换为标准 Evidence 对象
import type { EvidenceItem } from '../../types/index.js';
import type { RedisClient } from './client.js';

export interface RedisAdapterResult {
  ok: boolean;
  source: 'redis';
  evidence: EvidenceItem[];
  errors: string[];
  raw: { exists: boolean; ttl_seconds: number | null; value_preview: unknown } | null;
}

/**
 * 检查缓存 key 并将结果规范化为 Evidence
 * @param client Redis 客户端
 * @param key 要检查的 key（必须在前缀白名单内）
 * @param entityId 事故上下文 ID
 */
export async function runRedisAdapter(
  client: RedisClient,
  key: string,
  entityId: string,
): Promise<RedisAdapterResult> {
  const timestamp = new Date().toISOString();

  try {
    const result = await client.inspect(key);
    const evidence: EvidenceItem[] = [];

    // cache_key_exists / cache_key_missing
    evidence.push({
      id: `${entityId}-redis-${result.exists ? 'exists' : 'missing'}-${key}`,
      source: 'redis',
      entity_id: entityId,
      timestamp,
      finding_type: result.exists ? 'cache_key_exists' : 'cache_key_missing',
      summary: result.exists
        ? `Redis key "${key}" 存在，类型=${result.type}`
        : `Redis key "${key}" 不存在`,
      confidence: 'high',
      raw_ref: `redis:${key}`,
      key,
      normalization_status: 'complete',
      severity: 'informational',
    });

    // cache_ttl_positive（仅在 key 存在且有 TTL 时追加）
    if (result.exists && result.ttl_seconds != null && result.ttl_seconds > 0) {
      evidence.push({
        id: `${entityId}-redis-ttl-${key}`,
        source: 'redis',
        entity_id: entityId,
        timestamp,
        finding_type: 'cache_ttl_positive',
        summary: `Redis key "${key}" TTL 剩余 ${result.ttl_seconds} 秒（缓存仍有效）`,
        confidence: 'high',
        raw_ref: `redis:${key}`,
        key,
        normalization_status: 'complete',
        severity: 'informational',
      });
    }

    return {
      ok: true,
      source: 'redis',
      evidence,
      errors: [],
      raw: result,
    };
  } catch (err) {
    return {
      ok: false,
      source: 'redis',
      evidence: [],
      errors: [String(err)],
      raw: null,
    };
  }
}
