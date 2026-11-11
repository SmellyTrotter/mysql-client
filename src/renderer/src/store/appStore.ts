import { create } from 'zustand'
import type { Bookmark, ConnectionConfig, TableInfo, TableNode, Tag } from '../../../shared/types'
import { groupTables, nodeName } from '../../../shared/sharding'
import { evictLru, type TabItem, type TabType } from '../../../shared/tabs'
import { api } from '../api'

export type { TabItem, TabType }

type Conn = Omit<ConnectionConfig, 'passwordEnc'>

interface AppState {
  initialized: boolean
  connections: Conn[]
  /** 最近操作的连接，用于工具栏「新建查询」等缺省动作 */
  lastUsedConnId: string | null
  /** key: connId */
  schemasByConn: Record<string, string[]>
  /** key: connId → schema → 树节点（已做分表归组） */
  tableNodesByConn: Record<string, Record<string, TableNode[]>>
  tags: Tag[]
  /** key: connId → `schema.table` → 标签（分表组为 schema.order_*） */
  tableTagsByConn: Record<string, Record<string, Tag[]>>
  bookmarks: Bookmark[]
  search: string
  filterTagIds: number[]
  tabs: TabItem[]
  activeTabKey: string | null
  metadataLoading: boolean
  /** 最近一次刷新元数据的失败原因，供工具栏提示 */
  metadataError: string | null
  tablePageSize: number
  setTablePageSize: (n: number) => void
  maxTabs: number
  setMaxTabs: (n: number) => void

  init: () => Promise<void>
  /** 加载某连接的库列表与标签（幂等，已加载则跳过） */
  ensureConnectionData: (connId: string) => Promise<void>
  ensureSchemaTables: (connId: string, schema: string) => Promise<void>
  /** 搜索时调用：确保所有连接所有库的表都已入缓存 */
  ensureAllTablesForSearch: () => Promise<void>
  /** 不传 connId 时刷新全部连接 */
  refreshMetadata: (connId?: string) => Promise<void>
  touchConnection: (connId: string) => void
  setSearch: (s: string) => void
  toggleTagFilter: (tagId: number) => void
  openTable: (connId: string, schema: string, table: string) => void
  openDdl: (connId: string, schema: string, table: string) => void
  openQuery: (connId: string, schema: string, initialSql?: string) => void
  activateTab: (key: string) => void
  closeTab: (key: string) => void
  reloadTags: () => Promise<void>
  reloadBookmarks: () => Promise<void>
  saveConnection: (input: Parameters<typeof api.connections.create>[0], id?: string) => Promise<void>
  removeConnection: (id: string) => Promise<void>
}

function tabKey(type: TabType, connId: string, schema: string, table?: string): string {
  return type === 'query'
    ? `query:${connId}:${schema}:${Date.now()}`
    : `${type}:${connId}:${schema}.${table}`
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  connections: [],
  lastUsedConnId: null,
  schemasByConn: {},
  tableNodesByConn: {},
  tags: [],
  tableTagsByConn: {},
  bookmarks: [],
  search: '',
  filterTagIds: [],
  tabs: [],
  activeTabKey: null,
  metadataLoading: false,
  metadataError: null,
  tablePageSize: Number(localStorage.getItem('mysql-client.pageSize')) || 100,
  setTablePageSize: (n) => {
    localStorage.setItem('mysql-client.pageSize', String(n))
    set({ tablePageSize: n })
  },
  maxTabs: Number(localStorage.getItem('mysql-client.maxTabs')) || 8,
  setMaxTabs: (n) => {
    localStorage.setItem('mysql-client.maxTabs', String(n))
    set((s) => ({ maxTabs: n, tabs: s.activeTabKey ? evictLru(s.tabs, s.activeTabKey, n) : s.tabs }))
  },

  init: async () => {
    const [connections, tags, bookmarks] = await Promise.all([
      api.connections.list(),
      api.tags.list(),
      api.bookmarks.list()
    ])
    set({ connections, tags, bookmarks, initialized: true })
    await Promise.all(connections.map((c) => get().ensureConnectionData(c.id)))
  },

  ensureConnectionData: async (connId) => {
    if (get().schemasByConn[connId]) return
    const [schemas, tableTags] = await Promise.all([
      api.metadata.schemas(connId),
      api.tags.forConn(connId)
    ])
    set((s) => ({
      schemasByConn: { ...s.schemasByConn, [connId]: schemas },
      tableTagsByConn: { ...s.tableTagsByConn, [connId]: tableTags }
    }))
    if (schemas.length > 0) await get().ensureSchemaTables(connId, schemas[0])
  },

  ensureSchemaTables: async (connId, schema) => {
    if (get().tableNodesByConn[connId]?.[schema]) return
    const tables: TableInfo[] = await api.metadata.tables(connId, schema)
    set((s) => ({
      tableNodesByConn: {
        ...s.tableNodesByConn,
        [connId]: { ...s.tableNodesByConn[connId], [schema]: groupTables(tables) }
      }
    }))
  },

  ensureAllTablesForSearch: async () => {
    const { connections, schemasByConn } = get()
    await Promise.all(
      connections.map(async (c) => {
        await get().ensureConnectionData(c.id)
        const schemas = get().schemasByConn[c.id] ?? schemasByConn[c.id] ?? []
        await Promise.all(schemas.map((schema) => get().ensureSchemaTables(c.id, schema)))
      })
    )
  },

  refreshMetadata: async (connId) => {
    const targets = connId ? [connId] : get().connections.map((c) => c.id)
    set({ metadataLoading: true, metadataError: null })
    const errors: string[] = []
    try {
      for (const id of targets) {
        try {
          await api.metadata.refresh(id)
          const schemas = await api.metadata.schemas(id)
          set((s) => ({
            schemasByConn: { ...s.schemasByConn, [id]: schemas },
            tableNodesByConn: { ...s.tableNodesByConn, [id]: {} }
          }))
          if (schemas.length > 0) await get().ensureSchemaTables(id, schemas[0])
        } catch (err) {
          const name = get().connections.find((c) => c.id === id)?.name ?? id
          errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      set({ metadataError: errors.length > 0 ? errors.join('；') : null })
    } finally {
      set({ metadataLoading: false })
    }
  },

  touchConnection: (connId) => {
    set({ lastUsedConnId: connId })
    void get().ensureConnectionData(connId)
  },

  setSearch: (search) => {
    set({ search })
    if (search.trim()) void get().ensureAllTablesForSearch()
  },

  toggleTagFilter: (tagId) =>
    set((s) => ({
      filterTagIds: s.filterTagIds.includes(tagId)
        ? s.filterTagIds.filter((id) => id !== tagId)
        : [...s.filterTagIds, tagId]
    })),

  openTable: (connId, schema, table) => {
    const key = tabKey('table', connId, schema, table)
    const exists = get().tabs.find((t) => t.key === key)
    if (!exists) {
      const tab: TabItem = { key, type: 'table', connId, schema, table, title: `${schema}.${table}`, lastActiveAt: Date.now() }
      set((s) => ({ tabs: evictLru([...s.tabs, tab], key, s.maxTabs), activeTabKey: key, lastUsedConnId: connId }))
    } else {
      get().activateTab(key)
    }
  },

  openDdl: (connId, schema, table) => {
    const key = tabKey('ddl', connId, schema, table)
    const exists = get().tabs.find((t) => t.key === key)
    if (!exists) {
      const tab: TabItem = { key, type: 'ddl', connId, schema, table, title: `DDL ${schema}.${table}`, lastActiveAt: Date.now() }
      set((s) => ({ tabs: evictLru([...s.tabs, tab], key, s.maxTabs), activeTabKey: key, lastUsedConnId: connId }))
    } else {
      get().activateTab(key)
    }
  },

  openQuery: (connId, schema, initialSql) => {
    const key = tabKey('query', connId, schema)
    const tab: TabItem = { key, type: 'query', connId, schema, title: `查询 ${schema}`, initialSql, lastActiveAt: Date.now() }
    set((s) => ({ tabs: evictLru([...s.tabs, tab], key, s.maxTabs), activeTabKey: key, lastUsedConnId: connId }))
  },

  activateTab: (key) =>
    set((s) => ({
      activeTabKey: key,
      tabs: s.tabs.map((t) => (t.key === key ? { ...t, lastActiveAt: Date.now() } : t))
    })),

  closeTab: (key) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.key === key)
      const tabs = s.tabs.filter((t) => t.key !== key)
      let activeTabKey = s.activeTabKey
      if (activeTabKey === key) {
        activeTabKey = tabs[Math.min(idx, tabs.length - 1)]?.key ?? null
      }
      return { tabs, activeTabKey }
    })
  },

  reloadTags: async () => {
    const connIds = get().connections.map((c) => c.id)
    const [tags, ...tableTagsList] = await Promise.all([
      api.tags.list(),
      ...connIds.map((id) => api.tags.forConn(id))
    ])
    const tableTagsByConn = Object.fromEntries(connIds.map((id, i) => [id, tableTagsList[i]]))
    set({ tags, tableTagsByConn })
  },

  reloadBookmarks: async () => {
    const bookmarks = await api.bookmarks.list()
    set({ bookmarks })
  },

  saveConnection: async (input, id) => {
    const connId = id ?? (await api.connections.create(input))
    if (id) await api.connections.update(id, input)
    const connections = await api.connections.list()
    // 主机/账号/库表范围都可能变了，先丢掉该连接的前端缓存，否则树上仍是旧库表
    set((s) => {
      const schemasByConn = { ...s.schemasByConn }
      const tableNodesByConn = { ...s.tableNodesByConn }
      delete schemasByConn[connId]
      delete tableNodesByConn[connId]
      return { connections, schemasByConn, tableNodesByConn }
    })
    // 保存后立即按新参数重建元数据（不阻塞弹窗关闭），新建连接也无需再手动点刷新
    void get().refreshMetadata(connId)
  },

  removeConnection: async (id) => {
    await api.connections.remove(id)
    const connections = await api.connections.list()
    set((s) => {
      const schemasByConn = { ...s.schemasByConn }
      const tableNodesByConn = { ...s.tableNodesByConn }
      const tableTagsByConn = { ...s.tableTagsByConn }
      delete schemasByConn[id]
      delete tableNodesByConn[id]
      delete tableTagsByConn[id]
      return {
        connections,
        schemasByConn,
        tableNodesByConn,
        tableTagsByConn,
        lastUsedConnId: s.lastUsedConnId === id ? (connections[0]?.id ?? null) : s.lastUsedConnId,
        tabs: s.tabs.filter((t) => t.connId !== id),
        activeTabKey: s.tabs.find((t) => t.key === s.activeTabKey && t.connId !== id)
          ? s.activeTabKey
          : null
      }
    })
  }
}))

/** 供侧边栏渲染树：应用搜索与标签过滤 */
export function filterNodes(
  nodes: TableNode[],
  search: string,
  filterTagIds: number[],
  tableTags: Record<string, Tag[]>,
  schema: string
): TableNode[] {
  let result = nodes
  const q = search.trim().toLowerCase()
  if (q) {
    result = result.filter((n) => {
      // 逻辑组名、组内任一具体分表名、注释均可命中
      return (
        nodeName(n).toLowerCase().includes(q) ||
        n.tables.some((t) => t.name.toLowerCase().includes(q) || t.comment.toLowerCase().includes(q))
      )
    })
  }
  if (filterTagIds.length > 0) {
    result = result.filter((n) => {
      const key = `${schema}.${nodeName(n)}`
      const nodeTags = tableTags[key] ?? []
      return filterTagIds.some((id) => nodeTags.some((t) => t.id === id))
    })
  }
  return result
}
