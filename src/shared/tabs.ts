export type TabType = 'table' | 'query' | 'ddl'

export interface TabItem {
  key: string
  type: TabType
  connId: string
  schema: string
  /** table / ddl 类型存在 */
  table?: string
  title: string
  /** query 类型：初始 SQL（来自书签） */
  initialSql?: string
  /** 最近一次激活时间，用于 LRU 自动关闭 */
  lastActiveAt: number
}

/** 超出上限时，关闭除 keepKey 外最久未使用的标签页 */
export function evictLru<T extends { key: string; lastActiveAt: number }>(tabs: T[], keepKey: string, maxTabs: number): T[] {
  if (tabs.length <= maxTabs) return tabs
  const candidates = tabs.filter((t) => t.key !== keepKey)
  if (candidates.length === 0) return tabs
  const victim = candidates.reduce((a, b) => (a.lastActiveAt <= b.lastActiveAt ? a : b))
  return tabs.filter((t) => t.key !== victim.key)
}

/** 短名：表类 tab 用表名，查询 tab 用「查询 schema」 */
export function shortTitle(tab: Pick<TabItem, 'type' | 'schema' | 'table' | 'title'>): string {
  return tab.type === 'query' ? `查询 ${tab.schema}` : (tab.table ?? tab.title)
}

/** 短名有重复时才显示完整 库.表 前缀 */
export function computeTabLabels(tabs: TabItem[]): Map<string, string> {
  const shortCounts = new Map<string, number>()
  for (const t of tabs) {
    const s = shortTitle(t)
    shortCounts.set(s, (shortCounts.get(s) ?? 0) + 1)
  }
  return new Map(
    tabs.map((t) => [t.key, (shortCounts.get(shortTitle(t)) ?? 0) > 1 ? t.title : shortTitle(t)])
  )
}
