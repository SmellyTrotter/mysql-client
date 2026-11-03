/** 识别 10/13/16/19 位数字时间戳，转成本地时间文本；识别不了返回 null */
export function parseTimestamp(text: string): string | null {
  if (!/^\d+$/.test(text)) return null
  let ms: number
  if (text.length === 10) ms = Number(text) * 1000
  else if (text.length === 13) ms = Number(text)
  else if (text.length === 16) ms = Number(text) / 1000
  else if (text.length === 19) ms = Number(text) / 1e6
  else return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** 尝试把 JSON 文本美化；不是 JSON 返回原文 */
export function prettyJson(text: string): string {
  const trimmed = text.trim()
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return text
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return text
  }
}
