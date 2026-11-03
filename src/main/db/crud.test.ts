import { describe, expect, it } from 'vitest'
import { buildDelete, buildInsert, buildUpdate, quoteIdent } from './crud'

describe('crud SQL 生成', () => {
  it('buildUpdate 生成参数化 UPDATE', () => {
    const { sql, params } = buildUpdate('shop', 'order_1', { id: 7 }, { status: 'paid', note: null })
    expect(sql).toBe('UPDATE `shop`.`order_1` SET `status` = ?, `note` = ? WHERE `id` = ?')
    expect(params).toEqual(['paid', null, 7])
  })

  it('buildUpdate 支持复合主键', () => {
    const { sql, params } = buildUpdate('db', 't', { a: 1, b: 2 }, { c: 3 })
    expect(sql).toBe('UPDATE `db`.`t` SET `c` = ? WHERE `a` = ? AND `b` = ?')
    expect(params).toEqual([3, 1, 2])
  })

  it('buildUpdate 没有主键时报错', () => {
    expect(() => buildUpdate('db', 't', {}, { c: 3 })).toThrow('缺少主键')
  })

  it('buildDelete 生成参数化 DELETE', () => {
    const { sql, params } = buildDelete('shop', 'order_1', { id: 7 })
    expect(sql).toBe('DELETE FROM `shop`.`order_1` WHERE `id` = ?')
    expect(params).toEqual([7])
  })

  it('buildInsert 生成参数化 INSERT', () => {
    const { sql, params } = buildInsert('db', 't', { a: 1, b: 'x' })
    expect(sql).toBe('INSERT INTO `db`.`t` (`a`, `b`) VALUES (?, ?)')
    expect(params).toEqual([1, 'x'])
  })

  it('quoteIdent 转义反引号防注入', () => {
    expect(quoteIdent('we`ird')).toBe('`we``ird`')
  })
})
