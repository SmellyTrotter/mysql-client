import { describe, expect, it } from 'vitest'
import { computeTabLabels, evictLru, shortTitle, type TabItem } from './tabs'

function tab(key: string, opts: Partial<TabItem> = {}, lastActiveAt = 0): TabItem {
  return {
    key,
    type: 'table',
    connId: 'c1',
    schema: 'db',
    table: key,
    title: `db.${key}`,
    lastActiveAt,
    ...opts
  }
}

describe('evictLru', () => {
  it('未超上限时原样返回', () => {
    const tabs = [tab('a', {}, 1), tab('b', {}, 2)]
    expect(evictLru(tabs, 'b', 8)).toHaveLength(2)
  })

  it('超上限时关闭最久未使用的标签', () => {
    const tabs = [tab('a', {}, 1), tab('b', {}, 2), tab('c', {}, 3)]
    const result = evictLru(tabs, 'c', 2)
    expect(result.map((t) => t.key)).toEqual(['b', 'c'])
  })

  it('当前活动标签（keepKey）即使最旧也不会被关闭', () => {
    const tabs = [tab('a', {}, 1), tab('b', {}, 2), tab('c', {}, 3)]
    const result = evictLru(tabs, 'a', 2)
    expect(result.map((t) => t.key)).toEqual(['a', 'c'])
  })
})

describe('computeTabLabels', () => {
  it('短名唯一时不带库前缀', () => {
    const tabs = [tab('order_0'), tab('order_1')]
    const labels = computeTabLabels(tabs)
    expect(labels.get('order_0')).toBe('order_0')
    expect(labels.get('order_1')).toBe('order_1')
  })

  it('不同库的同名表显示完整 库.表 前缀', () => {
    const a = tab('x', { schema: 'db1', table: 'user', title: 'db1.user' })
    const b = { ...tab('y', { schema: 'db2', table: 'user', title: 'db2.user' }), key: 'y' }
    const labels = computeTabLabels([a, b])
    expect(labels.get('x')).toBe('db1.user')
    expect(labels.get('y')).toBe('db2.user')
  })

  it('查询 tab 用「查询 schema」作短名', () => {
    const q = tab('q1', { type: 'query', table: undefined, title: '查询 db' })
    expect(shortTitle(q)).toBe('查询 db')
  })
})
