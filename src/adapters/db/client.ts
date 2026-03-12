// DB Readonly Adapter Client
// PostgreSQL 只读连接，内置 SQL 安全校验 + 表白名单
import pg from 'pg';
import type { DbConfig } from '../../types/index.js';

const { Pool } = pg;

// 拒绝这些危险操作的正则（大小写不敏感）
const DANGEROUS_PATTERNS = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\balter\b/i,
  /\bcreate\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bexec\b/i,
  /\bexecute\b/i,
];

export interface DbQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  table?: string;
}

export class DbReadonlyClient {
  private readonly pool: pg.Pool;
  private readonly allowedTables: Set<string>;

  constructor(config: DbConfig) {
    this.pool = new Pool({
      connectionString: config.connection_string,
      max: 3, // 调试工具不需要大连接池
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      // 强制只读模式
      options: '-c default_transaction_read_only=on',
    });
    this.allowedTables = new Set(config.allowed_tables.map((t) => t.toLowerCase()));
  }

  /**
   * 执行只读查询
   * @param sql 参数化 SQL，必须只包含 SELECT
   * @param params 参数列表（防 SQL 注入）
   * @param table 本次查询涉及的主表（用于白名单校验）
   */
  async query(sql: string, params: unknown[] = [], table?: string): Promise<DbQueryResult> {
    this.validateSql(sql, table);

    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0,
        table,
      };
    } finally {
      client.release();
    }
  }

  /**
   * 快捷方法：按主键查询实体
   * @param table 表名（必须在 allowed_tables 白名单内）
   * @param column 主键列名
   * @param value 主键值
   */
  async lookupEntity(table: string, column: string, value: string): Promise<DbQueryResult> {
    if (!this.isTableAllowed(table)) {
      throw new Error(`表 "${table}" 不在访问白名单中`);
    }
    // 表名和列名不能参数化，手动校验格式（只允许字母数字下划线）
    assertIdentifier(table);
    assertIdentifier(column);
    const sql = `SELECT * FROM ${table} WHERE ${column} = $1 LIMIT 10`;
    return this.query(sql, [value], table);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ─── 安全校验 ───────────────────────────

  private validateSql(sql: string, table?: string): void {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(sql)) {
        throw new Error(`SQL 包含危险操作，已拒绝执行：${sql.slice(0, 60)}`);
      }
    }
    if (table && !this.isTableAllowed(table)) {
      throw new Error(`表 "${table}" 不在访问白名单中`);
    }
  }

  private isTableAllowed(table: string): boolean {
    if (this.allowedTables.size === 0) return true; // 空白名单 = 无限制
    return this.allowedTables.has(table.toLowerCase());
  }
}

function assertIdentifier(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`不合法的标识符: "${name}"`);
  }
}
