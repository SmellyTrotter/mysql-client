import { describe, expect, it } from 'vitest'
import { groupTables, nodeName, sortShards } from './sharding'
import type { TableInfo } from './types'

function t(schema: string, name: string, comment = ''): TableInfo {
  return { schema, name, comment }
}

describe('groupTables', () => {
  it('把 _数字 后缀的分表折叠为逻辑组', () => {
    const nodes = groupTables([t('db', 'order_0'), t('db', 'order_1'), t('db', 'order_2')])
    expect(nodes).toHaveLength(1)
    expect(nodes[0].logical).toBe('order_*')
    expect(nodes[0].tables.map((x) => x.name)).toEqual(['order_0', 'order_1', 'order_2'])
  })

  it('普通表保持独立节点', () => {
    const nodes = groupTables([t('db', 'user'), t('db', 'config')])
    expect(nodes).toHaveLength(2)
    expect(nodes.every((n) => n.logical === null)).toBe(true)
  })

  it('只有一张表命中后缀时不折叠', () => {
    const nodes = groupTables([t('db', 'user_1'), t('db', 'user')])
    expect(nodes).toHaveLength(2)
    expect(nodes.every((n) => n.logical === null)).toBe(true)
  })

  it('混合场景：组与普通表共存并按名称排序', () => {
    const nodes = groupTables([
      t('db', 'zzz'),
      t('db', 'order_10'),
      t('db', 'order_2'),
      t('db', 'aaa')
    ])
    expect(nodes.map(nodeName)).toEqual(['aaa', 'order_*', 'zzz'])
  })

  it('分表组内按数字排序而不是字符串排序', () => {
    const sorted = sortShards([t('db', 'order_10'), t('db', 'order_2'), t('db', 'order_1')])
    expect(sorted.map((x) => x.name)).toEqual(['order_1', 'order_2', 'order_10'])
  })

  it('支持自定义归组规则', () => {
    const pattern = /^(.+?)_shard(\d+)$/
    const nodes = groupTables([t('db', 'order_shard1'), t('db', 'order_shard2')], pattern)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].logical).toBe('order_*')
  })
})
