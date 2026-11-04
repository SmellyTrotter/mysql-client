// 主进程与渲染进程共享的类型定义

export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  user: string
  database?: string
  groupName?: string
  color?: string
  /** 密码加密后的 base64（safeStorage），仅在主进程内部使用 */
  passwordEnc?: string
}

export interface ConnectionInput {
  name: string
  host: string
  port: number
  user: string
  password?: string
  database?: string
  groupName?: string
  color?: string
}

export interface TableInfo {
  schema: string
  name: string
  comment: string
}

export interface TableNode {
  /** 分表逻辑组，如 order_*；普通表为 null */
  logical: string | null
  tables: TableInfo[]
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  isPrimary: boolean
  isAutoIncrement: boolean
  defaultValue: string | null
  comment: string
}

export interface TableDataResult {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
  /** 无主键时为 true，渲染层据此进入只读模式 */
  readonly: boolean
}

export interface QueryResult {
  fields: string[]
  rows: Record<string, unknown>[]
  affectedRows?: number
  elapsedMs: number
}

export interface SortSpec {
  column: string
  direction: 'asc' | 'desc'
}

export interface FilterSpec {
  column: string
  /** eq = 精确匹配，like = 包含（%value%） */
  op: 'eq' | 'like'
  value: string
}

export interface Tag {
  id: number
  name: string
  color: string
}

export interface Bookmark {
  id: number
  connId: string
  type: 'sql' | 'table'
  name: string
  content: string
  createdAt: number
}

export interface TableRef {
  connId: string
  schema: string
  table: string
}

export interface SqlLogEntry {
  id: number
  connId: string
  sql: string
  /** grid-insert / grid-update / grid-delete / query */
  source: string
  createdAt: number
}

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}
