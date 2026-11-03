import type { TableInfo, TableNode } from './types'

/** 默认分表识别规则：xxxtable_0 / order_17 这类 `_数字` 后缀 */
export const DEFAULT_SHARD_PATTERN = /^(.+?)_(\d+)$/

/**
 * 把一组表名归并成树节点：
 * - 命中分表规则且同逻辑名表数 >= 2 的，折叠为一个逻辑组 `order_*`
 * - 其余保持独立节点
 */
export function groupTables(tables: TableInfo[], pattern: RegExp = DEFAULT_SHARD_PATTERN): TableNode[] {
  const buckets = new Map<string, TableInfo[]>()
  const singles: TableInfo[] = []

  for (const t of tables) {
    const m = t.name.match(pattern)
    if (m) {
      const logical = `${m[1]}_*`
      const list = buckets.get(logical) ?? []
      list.push(t)
      buckets.set(logical, list)
    } else {
      singles.push(t)
    }
  }

  const nodes: TableNode[] = []
  for (const [logical, list] of buckets) {
    if (list.length >= 2) {
      nodes.push({ logical, tables: sortShards(list) })
    } else {
      // 只有一张表命中后缀（如 user_1），不作为组展示
      nodes.push({ logical: null, tables: list })
    }
  }
  for (const t of singles) nodes.push({ logical: null, tables: [t] })

  nodes.sort((a, b) => nodeName(a).localeCompare(nodeName(b)))
  return nodes
}

export function nodeName(node: TableNode): string {
  return node.logical ?? node.tables[0].name
}

/** 分表按数字后缀排序：order_2 排在 order_10 前面 */
export function sortShards(tables: TableInfo[], pattern: RegExp = DEFAULT_SHARD_PATTERN): TableInfo[] {
  return [...tables].sort((a, b) => {
    const ma = a.name.match(pattern)
    const mb = b.name.match(pattern)
    if (ma && mb) return Number(ma[2]) - Number(mb[2])
    return a.name.localeCompare(b.name)
  })
}
