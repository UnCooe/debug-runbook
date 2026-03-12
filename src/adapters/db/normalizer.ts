// DB Adapter Normalizer
// 将 PostgreSQL 查询结果转换为标准 Evidence 对象
import type { EvidenceItem } from '../../types/index.js';
import type { DbReadonlyClient } from './client.js';

export interface DbAdapterResult {
  ok: boolean;
  source: 'db';
  evidence: EvidenceItem[];
  errors: string[];
}

/**
 * 通用 DB adapter：查询实体并规范化
 * @param client DB 客户端
 * @param table 目标表
 * @param column 查询列（通常是外键，如 order_id）
 * @param value 查询值
 * @param entityId 事故上下文 ID
 */
export async function runDbAdapter(
  client: DbReadonlyClient,
  table: string,
  column: string,
  value: string,
  entityId: string,
): Promise<DbAdapterResult> {
  const timestamp = new Date().toISOString();
  const errors: string[] = [];

  try {
    const result = await client.lookupEntity(table, column, value);
    const found = result.rowCount > 0;

    const evidence: EvidenceItem = {
      id: `${entityId}-db-${table}-${found ? 'found' : 'missing'}`,
      source: 'db',
      entity_id: entityId,
      timestamp,
      finding_type: found ? 'db_row_found' : 'db_row_missing',
      summary: found
        ? `在表 ${table} 中找到 ${result.rowCount} 条 ${column}=${value} 的记录`
        : `在表 ${table} 中未找到 ${column}=${value} 的记录`,
      confidence: 'high',
      raw_ref: `db:${table}?${column}=${value}`,
      table,
      normalization_status: 'complete',
      severity: found ? 'informational' : 'warning',
    };

    return { ok: true, source: 'db', evidence: [evidence], errors };
  } catch (err) {
    const msg = String(err);
    errors.push(msg);
    return { ok: false, source: 'db', evidence: [], errors };
  }
}
