import { describe, expect, it } from 'vitest'
import { matchesScope, parseScopeList, scopeSummary } from './scope'

describe('parseScopeList', () => {
  it('处理中英文逗号、分号、空白与去重', () => {
    expect(parseScopeList(' gifshow, order_db；crm_*  gifshow ')).toEqual(['gifshow', 'order_db', 'crm_*'])
  })

  it('空值返回空数组', () => {
    expect(parseScopeList(undefined)).toEqual([])
    expect(parseScopeList('')).toEqual([])
    expect(parseScopeList('  ,  ;; ')).toEqual([])
  })
})

describe('matchesScope', () => {
  it('空配置放行全部', () => {
    expect(matchesScope('anything', [])).toBe(true)
  })

  it('库名按完整词元匹配，不带通配符时允许前缀', () => {
    expect(matchesScope('gifshow', ['gifshow'])).toBe(true)
    expect(matchesScope('gifshow', ['gif'])).toBe(true)
    expect(matchesScope('order_db', ['gifshow'])).toBe(false)
  })

  it('表名通配符，且下划线按字面量处理', () => {
    const tokens = ['crm_*', 'onion_*']
    expect(matchesScope('crm_ai_agent_judge_record_0', tokens)).toBe(true)
    expect(matchesScope('onion_order_1', tokens)).toBe(true)
    expect(matchesScope('crmXanything', tokens)).toBe(false)
    expect(matchesScope('crm_user', ['*user'])).toBe(true)
    expect(matchesScope('crmXuser', ['*user'])).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(matchesScope('CRM_ORDER_0', ['crm'])).toBe(true)
  })
})

describe('scopeSummary', () => {
  it('未配置时显示全部库表', () => {
    expect(scopeSummary()).toBe('全部库表')
    expect(scopeSummary('', '  ')).toBe('全部库表')
  })

  it('拼出紧凑描述', () => {
    expect(scopeSummary('gifshow, _kdb', 'crm_*, order_*')).toBe('gifshow/_kdb · crm_*/order_*')
  })
})
