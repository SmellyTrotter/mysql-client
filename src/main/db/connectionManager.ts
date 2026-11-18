import mysql, { type Pool } from 'mysql2/promise'
import { safeStorage } from 'electron'
import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionInput,
  FilterSpec,
  QueryResult,
  SortSpec,
  TableDataResult
} from '../../shared/types'
import { quoteIdent } from './crud'
import { matchesScope, parseScopeList } from '../../shared/scope'
import { pickDefaultSort, shouldApplyDefaultSort, DEFAULT_SORT_MAX_ROWS } from '../../shared/defaultSort'

const SYSTEM_SCHEMAS = ['mysql', 'sys', 'information_schema', 'performance_schema']
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
  const schemaTokens = parseScopeList(config.schemaScope)
  const tableTokens = parseScopeList(config.tableScope)

  // 库名都是精确值时下推到 SQL，减少跨库扫描；带通配符的留在 JS 里过滤
  const exactSchemas = schemaTokens.filter((t) => !t.includes('*'))
  const pushDown = schemaTokens.length > 0 && exactSchemas.length === schemaTokens.length
  const conditions = ["TABLE_SCHEMA NOT IN ('mysql', 'sys', 'information_schema', 'performance_schema')"]
  const params: string[] = []
  if (pushDown) {
    conditions.push(`TABLE_SCHEMA IN (${exactSchemas.map(() => '?').join(', ')})`)
    params.push(...exactSchemas)
  }

  const [rows] = await getPool(config).query(
    `SELECT TABLE_SCHEMA AS \`schema\`, TABLE_NAME AS name, TABLE_COMMENT AS comment
     FROM information_schema.TABLES
     WHERE ${conditions.join(' AND ')}
     ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    params
  )
  return (rows as { schema: string; name: string; comment: string }[]).filter(
    (r) => matchesScope(r.schema, schemaTokens) && matchesScope(r.name, tableTokens)
  )
}

/** 连接弹窗里「库范围」的候选值：取该账号能看到的全部业务库 */
export async function listServerSchemas(config: ConnectionConfig): Promise<string[]> {
  const [rows] = await getPool(config).query('SHOW DATABASES')
  return (rows as Record<string, string>[])
    .map((r) => r.Database)
    .filter((name) => !!name && !SYSTEM_SCHEMAS.includes(name))
    .sort((a, b) => a.localeCompare(b))
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

/** 候选列是否为某个索引的前导列（ORDER BY 能走索引的前提） */
async function isLeadingIndexColumn(
  config: ConnectionConfig,
  schema: string,
  table: string,
  column: string
): Promise<boolean> {
  const [rows] = await getPool(config).query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND SEQ_IN_INDEX = 1
     LIMIT 1`,
    [schema, table, column]
  )
  return (rows as unknown[]).length > 0
}

/**
 * 用 LIMIT 1 OFFSET N 探测表的行数是否超过阈值：扫到第 N+1 行即可停，
 * 比全表 COUNT(*) 快得多，也不依赖 information_schema.TABLE_ROWS 那种失真的估算值。
 */
async function tableExceedsRows(
  config: ConnectionConfig,
  qualified: string,
  where: string,
  params: unknown[],
  threshold: number
): Promise<boolean> {
  const [rows] = await getPool(config).query(
    `SELECT 1 FROM ${qualified} ${where} LIMIT 1 OFFSET ?`,
    [...params, threshold]
  )
  return (rows as unknown[]).length > 0
}

// ---------- 表数据 ----------

/**
 * 只统计总行数，独立于数据查询，便于渲染层先出数据、后台再补总数。
 * 与 fetchTableData 用同一套 where/filter 逻辑，保证筛选后行数一致。
 */
export async function fetchTableCount(
  config: ConnectionConfig,
  schema: string,
  table: string,
  filter?: FilterSpec
): Promise<number> {
  const params: unknown[] = []
  let where = ''
  if (filter && filter.value.trim() !== '') {
    where = filter.op === 'like'
      ? `WHERE ${quoteIdent(filter.column)} LIKE ?`
      : `WHERE ${quoteIdent(filter.column)} = ?`
    params.push(filter.op === 'like' ? `%${filter.value}%` : filter.value)
  }
  const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`
  const [rows] = await getPool(config).query(`SELECT COUNT(*) AS cnt FROM ${qualified} ${where}`, params)
  return Number((rows as any[])[0].cnt)
}

export async function fetchTableData(
  config: ConnectionConfig,
  schema: string,
  table: string,
  page: number,
  pageSize: number,
  sort?: SortSpec,
  filter?: FilterSpec
): Promise<TableDataResult> {
  const pool = getPool(config)
  const columns = await fetchColumns(config, schema, table)
  const pkColumns = columns.filter((c) => c.isPrimary)

  const params: unknown[] = []
  let where = ''
  if (filter && filter.value.trim() !== '') {
    where = filter.op === 'like'
      ? `WHERE ${quoteIdent(filter.column)} LIKE ?`
      : `WHERE ${quoteIdent(filter.column)} = ?`
    params.push(filter.op === 'like' ? `%${filter.value}%` : filter.value)
  }

  const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`

  // 用户主动排序：无条件照做；否则判断是否应用默认排序
  let appliedSort: SortSpec | null = sort ?? null
  let defaultSortNote: string | undefined
  if (!sort) {
    const candidate = pickDefaultSort(columns)
    if (candidate) {
      const indexed = await isLeadingIndexColumn(config, schema, table, candidate.column)
      // 无索引时用 LIMIT/OFFSET 精确探测是否超过阈值，不用失真的 TABLE_ROWS 估算
      const exceeds = indexed
        ? false
        : await tableExceedsRows(config, qualified, where, params, DEFAULT_SORT_MAX_ROWS)
      if (shouldApplyDefaultSort({ indexed, total: exceeds ? DEFAULT_SORT_MAX_ROWS + 1 : 0 })) {
        appliedSort = candidate
      } else {
        defaultSortNote = `${candidate.column} 无索引且超过 ${DEFAULT_SORT_MAX_ROWS.toLocaleString()} 行，为避免全表排序已跳过默认排序`
      }
    }
  }

  const orderBy = appliedSort
    ? `ORDER BY ${quoteIdent(appliedSort.column)} ${appliedSort.direction === 'desc' ? 'DESC' : 'ASC'}`
    : pkColumns.length > 0
      ? `ORDER BY ${pkColumns.map((c) => quoteIdent(c.name)).join(', ')}`
      : ''

  // 只取数据页；总数由渲染层单独请求 table:count，避免被全表 COUNT 阻塞
  const [rows] = await pool.query(
    `SELECT * FROM ${qualified} ${where} ${orderBy} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  )

  return {
    columns,
    rows: rows as Record<string, unknown>[],
    total: page * pageSize,
    page,
    pageSize,
    readonly: pkColumns.length === 0,
    appliedSort,
    defaultSortNote
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
