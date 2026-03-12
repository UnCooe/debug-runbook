// Redis Adapter Client
// 基于 ioredis，只暴露安全的只读 inspect 操作
// 内置 key 前缀白名单，防止扫描生产环境
import { Redis } from 'ioredis';
import type { RedisConfig } from '../../types/index.js';

export interface RedisInspectResult {
  exists: boolean;
  type: string | null;
  ttl_seconds: number | null;
  /** 小值预览（字符串/hash），大值截断 */
  value_preview: unknown;
}

const MAX_VALUE_PREVIEW_BYTES = 2048; // 超过 2KB 的值只显示类型，不展示内容

export class RedisClient {
  private readonly redis: Redis;
  private readonly prefixAllowlist: string[];

  constructor(config: RedisConfig) {
    this.redis = new Redis(config.url, {
      lazyConnect: true,
      connectTimeout: 8_000,
      commandTimeout: 5_000,
      maxRetriesPerRequest: 1,
    });
    this.prefixAllowlist = config.key_prefix_allowlist;
  }

  /**
   * 检查 key 的存在性、类型、TTL 和值预览
   */
  async inspect(key: string): Promise<RedisInspectResult> {
    this.assertKeyAllowed(key);

    const [exists, type, ttl] = await Promise.all([
      this.redis.exists(key),
      this.redis.type(key),
      this.redis.ttl(key),
    ]);

    if (!exists) {
      return { exists: false, type: null, ttl_seconds: null, value_preview: null };
    }

    const value_preview = await this.getValuePreview(key, type);

    return {
      exists: true,
      type,
      // ttl=-1 表示无过期，ttl=-2 表示不存在
      ttl_seconds: ttl >= 0 ? ttl : ttl === -1 ? null : null,
      value_preview,
    };
  }

  /**
   * 只获取 TTL（轻量检查）
   */
  async ttl(key: string): Promise<number | null> {
    this.assertKeyAllowed(key);
    const ttl = await this.redis.ttl(key);
    return ttl >= 0 ? ttl : null;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  // ─── 安全校验 ───────────────────────────

  private assertKeyAllowed(key: string): void {
    if (this.prefixAllowlist.length === 0) return; // 空白名单 = 无限制
    const allowed = this.prefixAllowlist.some((prefix) => key.startsWith(prefix));
    if (!allowed) {
      throw new Error(
        `Key "${key}" 不在前缀白名单中。允许的前缀: ${this.prefixAllowlist.join(', ')}`
      );
    }
  }

  private async getValuePreview(key: string, type: string): Promise<unknown> {
    if (type === 'string') {
      const val = await this.redis.get(key);
      if (val && val.length > MAX_VALUE_PREVIEW_BYTES) {
        return `[String, ${val.length} bytes, 超长截断]`;
      }
      // 尝试 JSON 解析以获得更可读的结构
      try {
        return val ? JSON.parse(val) : val;
      } catch {
        return val;
      }
    }

    if (type === 'hash') {
      const hash = await this.redis.hgetall(key);
      const totalSize = JSON.stringify(hash).length;
      if (totalSize > MAX_VALUE_PREVIEW_BYTES) {
        return `[Hash, ${Object.keys(hash).length} fields, 超长截断]`;
      }
      return hash;
    }

    // list/set/zset 不做值预览（避免大扫描）
    return `[${type}, 不支持预览]`;
  }
}
