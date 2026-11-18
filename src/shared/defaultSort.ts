import type { ColumnInfo, SortSpec } from './types'

/**
 * 默认排序允许的最大行数。
 * 超过这个行数且排序列没有索引时跳过默认排序，避免 MySQL 做全表 filesort。
 */
export const DEFAULT_SORT_MAX_ROWS = 100_000

/** 从表里挑默认排序候选列：create_time desc > id desc */
export function pickDefaultSort(columns: ColumnInfo[]): SortSpec | undefined {
  if (columns.some((c) => c.name === 'create_time')) return { column: 'create_time', direction: 'desc' }
  if (columns.some((c) => c.name === 'id')) return { column: 'id', direction: 'desc' }
  return undefined
}

/**
 * 默认排序是否应用：
 * - 排序列是索引前导列 → 直接排，行数多少都便宜
 * - 没有索引 → 只有行数不超过阈值才排
 */
export function shouldApplyDefaultSort(input: {
  indexed: boolean
  total: number
  maxRows?: number
}): boolean {
  const max = input.maxRows ?? DEFAULT_SORT_MAX_ROWS
  if (input.indexed) return true
  return input.total <= max
}
