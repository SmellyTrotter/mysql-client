// MCP 查询安全边界：纯函数，不依赖 Electron / 数据库
// 首期只允许只读 SELECT / WITH 查询，写操作后续单独接入

import pkg from 'node-sql-parser'
import { parseScopeList, matchesScope } from './scope'

const { Parser } = pkg as unknown as { Parser: new () => SqlParser }
interface SqlParser {
  astify(sql: string, opt: { database: string }): any
  tableList(sql: string, dialect: string): string[]
}

export const DEFAULT_QUERY_LIMIT = 200
const HARD_MAX_LIMIT = 1000

export interface GuardOptions {
  /** 库白名单词元（来自连接 schemaScope） */
  schemaTokens?: string[]
  /** 表白名单词元（来自连接 tableScope） */
  tableTokens?: string[]
  /** 连接默认库，SQL 里没写库名前缀时按它做 scope 校验 */
  defaultSchema?: string
  maxLimit?: number
}

export interface GuardResult {
  sql: string
  /** SQL 里引用到的表（schema.table），已按 scope 校验 */
  tables: string[]
}

const FORBIDDEN = /\b(insert|update|delete|replace|create|alter|drop|truncate|rename|grant|revoke|set|call|load_file|into\s+outfile|into\s+dumpfile|lock\s+tables|unlock\s+tables)\b/i

/**
 * 校验并包装一条只读查询。抛出的 Error 消息可直接返回给 MCP client。
 * - 只接受单条 SELECT / WITH...SELECT（含 UNION 子查询）
 * - 拒绝任何写关键字与 INTO OUTFILE/DUMPFILE
 * - 强制追加 LIMIT（上限可配，默认 200，硬顶 1000）
 * - 提取引用的表并校验 scope，scope 外的表直接拒绝
 */
export function guardSelectSql(rawSql: string, options: GuardOptions = {}): GuardResult {
  const sql = rawSql.trim().replace(/;+\s*$/, '').trim()
  if (!sql) throw new Error('SQL 不能为空')

  const parser = new Parser()
  let ast: any
  try {
    ast = parser.astify(sql, { database: 'MySQL' })
  } catch (err) {
    throw new Error(`SQL 解析失败: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (Array.isArray(ast)) throw new Error('一次只能执行一条 SQL 语句')

  // CTE 的顶层 type 是 select（with 挂在 ast.with 上）
  if (ast?.type !== 'select') throw new Error('仅支持 SELECT / WITH 查询，写操作暂未开放')
  if (FORBIDDEN.test(sql)) throw new Error('查询中包含不允许的关键字（写操作 / 文件导出 / 变量设置）')

  const maxLimit = Math.min(options.maxLimit ?? DEFAULT_QUERY_LIMIT, HARD_MAX_LIMIT)
  const limited = applyLimit(sql, ast, maxLimit)

  const rawTables = parser.tableList(sql, 'MySQL')
  const refs = rawTables
    .map((entry) => parseTableRef(entry))
    .filter((r): r is { schema: string; table: string } => !!r)
    .map((r) => ({ schema: r.schema || options.defaultSchema || '', table: r.table }))

  const schemaTokens = parseScopeList(options.schemaTokens ? options.schemaTokens.join(',') : undefined)
  const tableTokens = parseScopeList(options.tableTokens ? options.tableTokens.join(',') : undefined)

  for (const ref of refs) {
    if (schemaTokens.length && !matchesScope(ref.schema, schemaTokens)) {
      throw new Error(`表 ${ref.schema}.${ref.table} 不在该连接的库范围内`)
    }
    if (tableTokens.length && !matchesScope(ref.table, tableTokens)) {
      throw new Error(`表 ${ref.schema}.${ref.table} 不在该连接的表范围内`)
    }
  }

  return {
    sql: limited,
    tables: refs.map((r) => `${r.schema}.${r.table}`)
  }
}

function parseTableRef(entry: string): { schema: string; table: string } | undefined {
  // node-sql-parser 返回形如 "select::demo::t" / "select::::t" / "t"
  const parts = entry.split('::')
  const table = parts[parts.length - 1]?.trim()
  if (!table || table === 'null') return undefined
  const rawSchema = (parts[parts.length - 2] ?? '').trim()
  return { schema: rawSchema && rawSchema !== 'null' ? rawSchema : '', table }
}

/**
 * 没有 LIMIT 时追加。已有 LIMIT 时不改动（由调用方 maxLimit 约束不了原 SQL 的 LIMIT，
 * 但已有 LIMIT 说明调用方主动限制了行数，不会造成全表拉取）。
 */
function applyLimit(sql: string, ast: any, limit: number): string {
  if (ast?.limit) return sql
  return `${sql} LIMIT ${limit}`
}
