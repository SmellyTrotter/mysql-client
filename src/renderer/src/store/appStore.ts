import { create } from 'zustand'
import type { Bookmark, ConnectionConfig, TableInfo, TableNode, Tag } from '../../../shared/types'
import { groupTables, nodeName } from '../../../shared/sharding'
import { evictLru, type TabItem, type TabType } from '../../../shared/tabs'
import { api } from '../api'

export type { TabItem, TabType }

interface AppState {
  initialized: boolean
  connections: Array<Omit<ConnectionConfig, 'passwordEnc'>>
  activeConnId: string | null
  schemas: string[]
  /** key: schema，懒加载并缓存 */
  tableNodesBySchema: Record<string, TableNode[]>
  tags: Tag[]
  /** key: `schema.table`（分表组为 `schema.order_*`） */
  tableTags: Record<string, Tag[]>
  bookmarks: Bookmark[]
  search: string
  filterTagIds: number[]
  tabs: TabItem[]
  activeTabKey: string | null
  metadataLoading: boolean
  /** 数据网格每页行数，持久化到 localStorage */
  tablePageSize: number
  setTablePageSize: (n: number) => void
  /** 最大标签页数，超出后自动关闭最久未使用的，持久化 */
  maxTabs: number
  setMaxTabs: (n: number) => void

  init: () => Promise<void>
  selectConnection: (connId: string) => Promise<void>
  refreshMetadata: () => Promise<void>
  loadSchemaTables: (schema: string) => Promise<void>
  setSearch: (s: string) => void
  toggleTagFilter: (tagId: number) => void
  openTable: (schema: string, table: string) => void
  openDdl: (schema: string, table: string) => void
  openQuery: (schema: string, initialSql?: string) => void
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
  activeConnId: null,
  schemas: [],
  tableNodesBySchema: {},
  tags: [],
  tableTags: {},
  bookmarks: [],
  search: '',
  filterTagIds: [],
  tabs: [],
  activeTabKey: null,
  metadataLoading: false,
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
    const [connections, tags] = await Promise.all([api.connections.list(), api.tags.list()])
    set({ connections, tags, initialized: true })
    if (connections.length > 0) await get().selectConnection(connections[0].id)
  },

  selectConnection: async (connId) => {
    set({ activeConnId: connId, schemas: [], tableNodesBySchema: {}, tableTags: {} })
    const [schemas, tableTags, bookmarks] = await Promise.all([
      api.metadata.schemas(connId),
      api.tags.forConn(connId),
      api.bookmarks.list(connId)
    ])
    set({ schemas, tableTags, bookmarks })
    if (schemas.length > 0) await get().loadSchemaTables(schemas[0])
  },

  refreshMetadata: async () => {
    const connId = get().activeConnId
    if (!connId) return
    set({ metadataLoading: true })
    try {
      await api.metadata.refresh(connId)
      const schemas = await api.metadata.schemas(connId)
      set({ schemas, tableNodesBySchema: {} })
      if (schemas.length > 0) await get().loadSchemaTables(schemas[0])
    } finally {
      set({ metadataLoading: false })
    }
  },

  loadSchemaTables: async (schema) => {
    const connId = get().activeConnId
    if (!connId) return
    const tables: TableInfo[] = await api.metadata.tables(connId, schema)
    set((s) => ({
      tableNodesBySchema: { ...s.tableNodesBySchema, [schema]: groupTables(tables) }
    }))
  },

  setSearch: (search) => set({ search }),

  toggleTagFilter: (tagId) =>
    set((s) => ({
      filterTagIds: s.filterTagIds.includes(tagId)
        ? s.filterTagIds.filter((id) => id !== tagId)
        : [...s.filterTagIds, tagId]
    })),

  openTable: (schema, table) => {
    const connId = get().activeConnId
    if (!connId) return
    const key = tabKey('table', connId, schema, table)
    const exists = get().tabs.find((t) => t.key === key)
    if (!exists) {
      const tab: TabItem = { key, type: 'table', connId, schema, table, title: `${schema}.${table}`, lastActiveAt: Date.now() }
      set((s) => ({ tabs: evictLru([...s.tabs, tab], key, s.maxTabs), activeTabKey: key }))
    } else {
      get().activateTab(key)
    }
  },

  openDdl: (schema, table) => {
    const connId = get().activeConnId
    if (!connId) return
    const key = tabKey('ddl', connId, schema, table)
    const exists = get().tabs.find((t) => t.key === key)
    if (!exists) {
      const tab: TabItem = { key, type: 'ddl', connId, schema, table, title: `DDL ${schema}.${table}`, lastActiveAt: Date.now() }
      set((s) => ({ tabs: evictLru([...s.tabs, tab], key, s.maxTabs), activeTabKey: key }))
    } else {
      get().activateTab(key)
    }
  },

  openQuery: (schema, initialSql) => {
    const connId = get().activeConnId
    if (!connId) return
    const key = tabKey('query', connId, schema)
    const tab: TabItem = { key, type: 'query', connId, schema, title: `查询 ${schema}`, initialSql, lastActiveAt: Date.now() }
    set((s) => ({ tabs: evictLru([...s.tabs, tab], key, s.maxTabs), activeTabKey: key }))
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
    const connId = get().activeConnId
    const [tags, tableTags] = await Promise.all([
      api.tags.list(),
      connId ? api.tags.forConn(connId) : Promise.resolve({})
    ])
    set({ tags, tableTags })
  },

  reloadBookmarks: async () => {
    const connId = get().activeConnId
    const bookmarks = await api.bookmarks.list(connId ?? undefined)
    set({ bookmarks })
  },

  saveConnection: async (input, id) => {
    if (id) await api.connections.update(id, input)
    else await api.connections.create(input)
    const connections = await api.connections.list()
    set({ connections })
    if (!get().activeConnId && connections.length > 0) {
      await get().selectConnection(connections[0].id)
    }
  },

  removeConnection: async (id) => {
    await api.connections.remove(id)
    const connections = await api.connections.list()
    const needReselect = get().activeConnId === id
    set({ connections })
    if (needReselect) {
      if (connections.length > 0) await get().selectConnection(connections[0].id)
      else set({ activeConnId: null, schemas: [], tableNodesBySchema: {}, tabs: [], activeTabKey: null })
    }
  }
}))

/** 供侧边栏渲染树：应用搜索与标签过滤 */
export function filterNodes(nodes: TableNode[], search: string, filterTagIds: number[], tableTags: Record<string, Tag[]>, schema: string): TableNode[] {
  let result = nodes
  const q = search.trim().toLowerCase()
  if (q) {
    result = result.filter((n) => {
      const name = nodeName(n).toLowerCase()
      return name.includes(q) || n.tables.some((t) => t.comment.toLowerCase().includes(q))
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
