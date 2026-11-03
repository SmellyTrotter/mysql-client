import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ConnectionInput, SortSpec } from '../shared/types'
import * as store from './db/store'
import * as cm from './db/connectionManager'
import { buildDelete, buildInsert, buildUpdate } from './db/crud'

function requireConn(id: string) {
  const config = store.getConnection(id)
  if (!config) throw new Error(`连接不存在: ${id}`)
  return config
}

/** 包装 handler，把异常转成 { ok: false, error } 返回给渲染层 */
function handle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await fn(...(args as TArgs))
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

export function registerIpcHandlers(): void {
  // ---------- 连接 ----------
  handle('conn:list', () => store.listConnections().map(({ passwordEnc, ...c }) => c))

  handle('conn:create', async (input: ConnectionInput) => {
    const id = randomUUID()
    const enc = input.password ? cm.encryptPassword(input.password) : undefined
    store.upsertConnection(id, input, enc)
    return id
  })

  handle('conn:update', async (id: string, input: ConnectionInput) => {
    // 密码留空表示不修改
    const enc = input.password ? cm.encryptPassword(input.password) : undefined
    store.upsertConnection(id, input, enc)
    await cm.closePool(id)
  })

  handle('conn:delete', async (id: string) => {
    await cm.closePool(id)
    store.deleteConnection(id)
  })

  handle('conn:test', (input: ConnectionInput) => cm.testConnection(input))

  // ---------- 元数据 ----------
  handle('meta:refresh', async (connId: string) => {
    const tables = await cm.fetchAllTables(requireConn(connId))
    store.replaceMetadataCache(connId, tables)
    return tables.length
  })

  handle('meta:schemas', (connId: string) => store.listCachedSchemas(connId))

  handle('meta:tables', (connId: string, schema?: string) => store.listCachedTables(connId, schema))

  // ---------- 查询 ----------
  handle('query:run', (connId: string, sql: string) => cm.runQuery(requireConn(connId), sql))

  handle(
    'table:data',
    (connId: string, schema: string, table: string, page: number, pageSize: number, sort?: SortSpec) =>
      cm.fetchTableData(requireConn(connId), schema, table, page, pageSize, sort)
  )

  handle('table:columns', (connId: string, schema: string, table: string) =>
    cm.fetchColumns(requireConn(connId), schema, table)
  )

  handle('table:ddl', (connId: string, schema: string, table: string) =>
    cm.fetchDdl(requireConn(connId), schema, table)
  )

  handle('table:update', async (connId: string, schema: string, table: string, pk: Record<string, unknown>, changes: Record<string, unknown>) => {
    const { sql, params } = buildUpdate(schema, table, pk, changes)
    return cm.execute(requireConn(connId), sql, params)
  })

  handle('table:insert', async (connId: string, schema: string, table: string, values: Record<string, unknown>) => {
    const { sql, params } = buildInsert(schema, table, values)
    return cm.execute(requireConn(connId), sql, params)
  })

  handle('table:delete', async (connId: string, schema: string, table: string, pk: Record<string, unknown>) => {
    const { sql, params } = buildDelete(schema, table, pk)
    return cm.execute(requireConn(connId), sql, params)
  })

  // ---------- 标签 ----------
  handle('tag:list', () => store.listTags())
  handle('tag:create', (name: string, color: string) => store.createTag(name, color))
  handle('tag:delete', (id: number) => store.deleteTag(id))
  handle('tag:assign', (connId: string, schema: string, table: string, tagId: number) =>
    store.assignTag(connId, schema, table, tagId)
  )
  handle('tag:unassign', (connId: string, schema: string, table: string, tagId: number) =>
    store.unassignTag(connId, schema, table, tagId)
  )
  handle('tag:forConn', (connId: string) => store.listTableTags(connId))

  // ---------- 书签 ----------
  handle('bm:list', (connId?: string) => store.listBookmarks(connId))
  handle('bm:create', (b: { connId: string; type: 'sql' | 'table'; name: string; content: string }) =>
    store.createBookmark(b)
  )
  handle('bm:delete', (id: number) => store.deleteBookmark(id))
}
