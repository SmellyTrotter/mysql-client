// 连接「库表范围」规则：纯函数，主进程过滤元数据与渲染层展示共用

/** 把逗号 / 中文逗号 / 空白 / 分号分隔的配置解析成去重的词元列表 */
export function parseScopeList(raw?: string | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of raw.split(/[,，;；\s]+/)) {
    const t = token.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** 词元转大小写不敏感的正则：只把 * 当通配符，其余字符（含 _ % .）按字面量处理 */
function scopeRegExp(token: string): RegExp {
  const escaped = token
    .toLowerCase()
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`, 'i')
}

/**
 * 范围匹配：空配置表示不过滤（全部通过）。
 * 词元不含 `*` 时按前缀匹配（crm 等价于 crm*）；含 `*` 时按通配匹配。
 */
export function matchesScope(value: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  return tokens.some((token) => scopeRegExp(token.includes('*') ? token : `${token}*`).test(value))
}

/** 侧栏用的紧凑范围描述 */
export function scopeSummary(schemaScope?: string, tableScope?: string): string {
  const schemas = parseScopeList(schemaScope)
  const tables = parseScopeList(tableScope)
  if (schemas.length === 0 && tables.length === 0) return '全部库表'
  return [schemas.join('/'), tables.join('/')].filter(Boolean).join(' · ')
}
