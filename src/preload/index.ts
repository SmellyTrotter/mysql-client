import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApiResult,
  Bookmark,
  ColumnInfo,
  ConnectionConfig,
  ConnectionInput,
  QueryResult,
  SortSpec,
  SqlLogEntry,
  TableDataResult,
  TableInfo,
  Tag
} from '../shared/types'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as ApiResult<T>
  if (!result.ok) throw new Error(result.error ?? '未知错误')
  return result.data as T
}

const api = {
  connections: {
    list: () => invoke<Array<Omit<ConnectionConfig, 'passwordEnc'>>>('conn:list'),
    create: (input: ConnectionInput) => invoke<string>('conn:create', input),
    update: (id: string, input: ConnectionInput) => invoke<void>('conn:update', id, input),
    remove: (id: string) => invoke<void>('conn:delete', id),
    test: (input: ConnectionInput) => invoke<void>('conn:test', input)
  },
  metadata: {
    refresh: (connId: string) => invoke<number>('meta:refresh', connId),
    schemas: (connId: string) => invoke<string[]>('meta:schemas', connId),
    tables: (connId: string, schema?: string) => invoke<TableInfo[]>('meta:tables', connId, schema)
  },
  query: {
    run: (connId: string, sql: string) => invoke<QueryResult>('query:run', connId, sql)
  },
  table: {
    data: (connId: string, schema: string, table: string, page: number, pageSize: number, sort?: SortSpec) =>
      invoke<TableDataResult>('table:data', connId, schema, table, page, pageSize, sort),
    columns: (connId: string, schema: string, table: string) =>
      invoke<ColumnInfo[]>('table:columns', connId, schema, table),
    ddl: (connId: string, schema: string, table: string) => invoke<string>('table:ddl', connId, schema, table),
    update: (connId: string, schema: string, table: string, pk: Record<string, unknown>, changes: Record<string, unknown>) =>
      invoke<number>('table:update', connId, schema, table, pk, changes),
    insert: (connId: string, schema: string, table: string, values: Record<string, unknown>) =>
      invoke<number>('table:insert', connId, schema, table, values),
    remove: (connId: string, schema: string, table: string, pk: Record<string, unknown>) =>
      invoke<number>('table:delete', connId, schema, table, pk)
  },
  tags: {
    list: () => invoke<Tag[]>('tag:list'),
    create: (name: string, color: string) => invoke<Tag>('tag:create', name, color),
    remove: (id: number) => invoke<void>('tag:delete', id),
    assign: (connId: string, schema: string, table: string, tagId: number) =>
      invoke<void>('tag:assign', connId, schema, table, tagId),
    unassign: (connId: string, schema: string, table: string, tagId: number) =>
      invoke<void>('tag:unassign', connId, schema, table, tagId),
    forConn: (connId: string) => invoke<Record<string, Tag[]>>('tag:forConn', connId)
  },
  bookmarks: {
    list: (connId?: string) => invoke<Bookmark[]>('bm:list', connId),
    create: (b: { connId: string; type: 'sql' | 'table'; name: string; content: string }) =>
      invoke<Bookmark>('bm:create', b),
    remove: (id: number) => invoke<void>('bm:delete', id)
  },
  logs: {
    list: (connId: string) => invoke<SqlLogEntry[]>('log:list', connId)
  },
  events: {
    /** 主进程转发的 ⌘W：关闭当前标签页 */
    onCloseActiveTab: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('app:close-active-tab', listener)
      return () => {
        ipcRenderer.removeListener('app:close-active-tab', listener)
      }
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
