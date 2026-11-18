import { describe, expect, it } from 'vitest'
import type { ColumnInfo } from './types'
import { DEFAULT_SORT_MAX_ROWS, pickDefaultSort, shouldApplyDefaultSort } from './defaultSort'

function col(name: string): ColumnInfo {
  return {
    name,
    type: 'bigint',
    nullable: true,
    isPrimary: false,
    isAutoIncrement: false,
    defaultValue: null,
    comment: ''
  }
}

describe('pickDefaultSort', () => {
  it('优先 create_time 倒序', () => {
    expect(pickDefaultSort([col('id'), col('create_time')])).toEqual({
      column: 'create_time',
      direction: 'desc'
    })
  })

  it('没有 create_time 时退回 id 倒序', () => {
    expect(pickDefaultSort([col('id'), col('name')])).toEqual({ column: 'id', direction: 'desc' })
  })

  it('两列都没有时不排序', () => {
    expect(pickDefaultSort([col('name')])).toBeUndefined()
  })
})

describe('shouldApplyDefaultSort', () => {
  it('索引前导列无论多少行都排序', () => {
    expect(shouldApplyDefaultSort({ indexed: true, total: 5_000_000 })).toBe(true)
  })

  it('无索引且行数小于阈值时排序', () => {
    expect(shouldApplyDefaultSort({ indexed: false, total: 100_000 })).toBe(true)
    expect(shouldApplyDefaultSort({ indexed: false, total: 99_999 })).toBe(true)
  })

  it('无索引且行数超过阈值时不排序', () => {
    expect(shouldApplyDefaultSort({ indexed: false, total: 100_001 })).toBe(false)
    expect(shouldApplyDefaultSort({ indexed: false, total: 3_232_460 })).toBe(false)
  })

  it('阈值可覆盖', () => {
    expect(shouldApplyDefaultSort({ indexed: false, total: 1_000, maxRows: 500 })).toBe(false)
    expect(DEFAULT_SORT_MAX_ROWS).toBe(100_000)
  })
})
