import { describe, expect, it } from 'vitest'
import { DEFAULT_QUERY_LIMIT, guardSelectSql } from './sqlGuard'

describe('guardSelectSql', () => {
  it('接受普通 SELECT 并自动加 LIMIT', () => {
    const r = guardSelectSql('SELECT id, name FROM demo.users WHERE id > 10')
    expect(r.sql).toBe(`SELECT id, name FROM demo.users WHERE id > 10 LIMIT ${DEFAULT_QUERY_LIMIT}`)
    expect(r.tables).toContain('demo.users')
  })

  it('保留 SQL 里已有的 LIMIT', () => {
    const r = guardSelectSql('SELECT * FROM demo.users LIMIT 5')
    expect(r.sql).toBe('SELECT * FROM demo.users LIMIT 5')
  })

  it('接受 WITH 查询', () => {
    const r = guardSelectSql('WITH t AS (SELECT id FROM demo.users) SELECT * FROM t')
    expect(r.sql).toContain('LIMIT')
  })

  it('接受 UNION 查询', () => {
    const r = guardSelectSql('SELECT id FROM demo.a UNION SELECT id FROM demo.b')
    expect(r.tables).toEqual(expect.arrayContaining(['demo.a', 'demo.b']))
  })

  it('拒绝写操作', () => {
    expect(() => guardSelectSql('UPDATE demo.users SET name = ?')).toThrow(/仅支持 SELECT/)
    expect(() => guardSelectSql('DELETE FROM demo.users')).toThrow(/仅支持 SELECT/)
    expect(() => guardSelectSql('INSERT INTO demo.users VALUES (1)')).toThrow(/仅支持 SELECT/)
  })

  it('拒绝危险关键字与文件导出', () => {
    expect(() => guardSelectSql('SELECT * FROM demo.t INTO OUTFILE "/tmp/x"')).toThrow(/不允许的关键字/)
    // load_file 会被 FORBIDDEN 命中（大小写不敏感）
    expect(() => guardSelectSql('SELECT load_file("/etc/passwd")')).toThrow(/不允许的关键字/)
  })

  it('拒绝多语句', () => {
    expect(() => guardSelectSql('SELECT 1; SELECT 2')).toThrow(/一条/)
  })

  it('空 SQL 直接拒绝', () => {
    expect(() => guardSelectSql('   ')).toThrow(/不能为空/)
  })

  it('scope 外的库被拒绝', () => {
    expect(() =>
      guardSelectSql('SELECT * FROM private.secret', { schemaTokens: ['demo'] })
    ).toThrow(/库范围/)
  })

  it('scope 内的库放行', () => {
    expect(
      guardSelectSql('SELECT * FROM demo.t', { schemaTokens: ['demo'] }).tables
    ).toContain('demo.t')
  })

  it('scope 外的表被拒绝', () => {
    expect(() =>
      guardSelectSql('SELECT * FROM demo.secret', { tableTokens: ['public_*'] })
    ).toThrow(/表范围/)
  })

  it('未写库名前缀时用默认库做 scope 校验', () => {
    expect(() =>
      guardSelectSql('SELECT * FROM secret', { defaultSchema: 'private', schemaTokens: ['demo'] })
    ).toThrow(/库范围/)
    expect(
      guardSelectSql('SELECT * FROM t', { defaultSchema: 'demo', schemaTokens: ['demo'] }).tables
    ).toContain('demo.t')
  })

  it('maxLimit 有硬顶', () => {
    const r = guardSelectSql('SELECT * FROM demo.t', { maxLimit: 5000 })
    expect(r.sql).toMatch(/LIMIT 1000$/)
  })
})
