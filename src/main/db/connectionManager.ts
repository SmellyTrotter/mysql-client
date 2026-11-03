import mysql, { type Pool } from 'mysql2/promise'
import { safeStorage } from 'electron'
import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionInput,
  QueryResult,
  SortSpec,
  TableDataResult
} from '../../shared/types'
import { quoteIdent } from './crud'

const pools = new Map<string, Pool>()

export function encryptPassword(plain: string): string {
  return safeStorage.encryptString(plain).toString('base64')
}

function decryptPassword(enc?: string): string | undefined {
  if (!enc) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return undefined
  }
}

function getPool(config: ConnectionConfig): Pool {
  let pool = pools.get(config.id)
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: decryptPassword(config.passwordEnc),
      database: config.database,
      connectionLimit: 4,
      connectTimeout: 8000,
      supportBigNumbers: true,
      bigNumberStrings: true
    })
    pools.set(config.id, pool)
  }
  return pool
}

export async function closePool(connId: string): Promise<void> {
  const pool = pools.get(connId)
  if (pool) {
    pools.delete(connId)
    await pool.end().catch(() => undefined)
  }
}

export async function closeAllPools(): Promise<void> {
  await Promise.all([...pools.keys()].map(closePool))
}

export async function testConnection(input: ConnectionInput): Promise<void> {
  const conn = await mysql.createConnection({
    host: input.host,
    port: input.port,
    user: input.user,
    password: input.password,
    database: input.database,
    connectTimeout: 8000
  })
  await conn.ping()
  await conn.end()
}

// ---------- 查询 ----------

export async function runQuery(config: ConnectionConfig, sql: string): Promise<QueryResult> {
  const start = Date.now()
  const [result, fields] = await getPool(config).query(sql)
  const elapsedMs = Date.now() - start

  if (Array.isArray(result)) {
    return {
      fields: (fields ?? []).map((f) => f.name),
      rows: result as Record<string, unknown>[],
      elapsedMs
    }
  }
  const header = result as mysql.ResultSetHeader
  return { fields: [], rows: [], affectedRows: header.affectedRows, elapsedMs }
}

// ---------- 元数据 ----------

export async function fetchAllTables(
  config: ConnectionConfig
): Promise<{ schema: string; name: string; comment: string }[]> {
  const [rows] = await getPool(config).query(
    `SELECT TABLE_SCHEMA AS \`schema\`, TABLE_NAME AS name, TABLE_COMMENT AS comment
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA NOT IN ('mysql', 'sys', 'information_schema', 'performance_schema')
     ORDER BY TABLE_SCHEMA, TABLE_NAME`
  )
  return rows as { schema: string; name: string; comment: string }[]
}

export async function fetchColumns(config: ConnectionConfig, schema: string, table: string): Promise<ColumnInfo[]> {
  const [rows] = await getPool(config).query(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_KEY AS columnKey, EXTRA AS extra, COLUMN_DEFAULT AS defaultValue, COLUMN_COMMENT AS comment
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [schema, table]
  )
  return (rows as any[]).map((r) => ({
    name: r.name,
    type: r.type,
    nullable: r.nullable === 'YES',
    isPrimary: r.columnKey === 'PRI',
    isAutoIncrement: String(r.extra).includes('auto_increment'),
    defaultValue: r.defaultValue,
    comment: r.comment ?? ''
  }))
}

export async function fetchDdl(config: ConnectionConfig, schema: string, table: string): Promise<string> {
  const [rows] = await getPool(config).query(
    `SHOW CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`
  )
  const row = (rows as any[])[0]
  return row['Create Table'] ?? row['Create View'] ?? ''
}

// ---------- 表数据 ----------

export async function fetchTableData(
  config: ConnectionConfig,
  schema: string,
  table: string,
  page: number,
  pageSize: number,
  sort?: SortSpec
): Promise<TableDataResult> {
  const pool = getPool(config)
  const columns = await fetchColumns(config, schema, table)
  const pkColumns = columns.filter((c) => c.isPrimary)

  const orderBy = sort
    ? `ORDER BY ${quoteIdent(sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`
    : pkColumns.length > 0
      ? `ORDER BY ${pkColumns.map((c) => quoteIdent(c.name)).join(', ')}`
      : ''

  const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`
  // 数据与总数并行查询，缩短打开表的等待
  const [[rows], [countRows]] = await Promise.all([
    pool.query(`SELECT * FROM ${qualified} ${orderBy} LIMIT ? OFFSET ?`, [
      pageSize,
      (page - 1) * pageSize
    ]),
    pool.query(`SELECT COUNT(*) AS cnt FROM ${qualified}`)
  ])

  return {
    columns,
    rows: rows as Record<string, unknown>[],
    total: Number((countRows as any[])[0].cnt),
    page,
    pageSize,
    readonly: pkColumns.length === 0
  }
}

export async function execute(
  config: ConnectionConfig,
  sql: string,
  params: unknown[]
): Promise<number> {
  const [result] = await getPool(config).execute(sql, params as any[])
  return (result as mysql.ResultSetHeader).affectedRows
}
