/** 侧栏连接节点的标识色；未指定时按连接 id 自动分配，保证多条连接一眼可分 */
export const CONNECTION_COLORS = [
  '#1677ff',
  '#722ed1',
  '#0d9aa8',
  '#fa8c16',
  '#e5484d',
  '#52a132',
  '#2f54eb',
  '#d6336c'
]

export function autoConnectionColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return CONNECTION_COLORS[Math.abs(hash) % CONNECTION_COLORS.length]
}
