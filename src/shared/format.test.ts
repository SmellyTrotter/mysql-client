import { describe, expect, it } from 'vitest'
import { parseTimestamp, prettyJson } from './format'

describe('parseTimestamp', () => {
  it('识别 13 位毫秒时间戳', () => {
    const result = parseTimestamp('1700000000000')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
  })

  it('识别 10 位秒时间戳', () => {
    const result = parseTimestamp('1700000000')
    expect(result).not.toBeNull()
    expect(result).toMatch(/^\d{4}-/)
  })

  it('与 13 位解析结果一致（同一时刻）', () => {
    const bySec = parseTimestamp('1700000000')
    const byMs = parseTimestamp('1700000000000')
    expect(bySec).toBe(byMs)
  })

  it('普通 id（如 2025）不解析', () => {
    expect(parseTimestamp('2025')).toBeNull()
  })

  it('非数字不解析', () => {
    expect(parseTimestamp('abc')).toBeNull()
  })

  it('超出合理年份不解析', () => {
    expect(parseTimestamp('9999999999999')).toBeNull()
  })
})

describe('prettyJson', () => {
  it('格式化 JSON 对象', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}')
  })

  it('非 JSON 原样返回', () => {
    expect(prettyJson('hello')).toBe('hello')
    expect(prettyJson('{broken')).toBe('{broken')
  })
})
