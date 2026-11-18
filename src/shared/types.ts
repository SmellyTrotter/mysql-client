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
  /** 库范围白名单（逗号分隔，支持 * 通配），空 = 显示该实例上全部可见库 */
  schemaScope?: string
  /** 表范围白名单（逗号分隔，支持 * 通配，不带 * 时按前缀匹配），空 = 全部表 */
  tableScope?: string
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
  schemaScope?: string
  tableScope?: string
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
  /** 实际生效的排序；null 表示没排序（默认排序可能被跳过） */
  appliedSort: SortSpec | null
  /** 默认排序被跳过的原因，供界面提示 */
  defaultSortNote?: string
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

/** 用户为「库 + 分表组/单表」写的三段语义说明，供 AI 理解表用途 */
export interface TableDescription {
  connId: string
  schema: string
  /** 逻辑组名（order_*）或普通表名 */
  tableGroup: string
  /** 这张表是干什么的 */
  purpose: string
  /** 什么场景下会用到 */
  scenarios: string
  /** 表里存了什么 */
  content: string
  updatedAt: number
}

/** MCP 服务状态，设置弹窗展示与一键复制用 */
export interface McpStatus {
  enabled: boolean
  port: number
  /** SSE 端点完整 URL（含 token） */
  sseUrl: string
  /** Streamable HTTP 端点完整 URL（含 token） */
  streamableUrl: string
  token: string
}

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}
