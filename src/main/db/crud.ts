// 基于主键生成安全的参数化 CRUD SQL

export function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

export function buildUpdate(
  schema: string,
  table: string,
  pkValues: Record<string, unknown>,
  changes: Record<string, unknown>
): { sql: string; params: unknown[] } {
  const setCols = Object.keys(changes)
  const pkCols = Object.keys(pkValues)
  if (setCols.length === 0) throw new Error('没有需要更新的列')
  if (pkCols.length === 0) throw new Error('缺少主键值，无法更新')

  const setClause = setCols.map((c) => `${quoteIdent(c)} = ?`).join(', ')
  const whereClause = pkCols.map((c) => `${quoteIdent(c)} = ?`).join(' AND ')
  return {
    sql: `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setClause} WHERE ${whereClause}`,
    params: [...setCols.map((c) => changes[c]), ...pkCols.map((c) => pkValues[c])]
  }
}

export function buildDelete(
  schema: string,
  table: string,
  pkValues: Record<string, unknown>
): { sql: string; params: unknown[] } {
  const pkCols = Object.keys(pkValues)
  if (pkCols.length === 0) throw new Error('缺少主键值，无法删除')
  const whereClause = pkCols.map((c) => `${quoteIdent(c)} = ?`).join(' AND ')
  return {
    sql: `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${whereClause}`,
    params: pkCols.map((c) => pkValues[c])
  }
}

export function buildInsert(
  schema: string,
  table: string,
  values: Record<string, unknown>
): { sql: string; params: unknown[] } {
  const cols = Object.keys(values)
  if (cols.length === 0) throw new Error('没有需要插入的列')
  const colList = cols.map(quoteIdent).join(', ')
  const placeholders = cols.map(() => '?').join(', ')
  return {
    sql: `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${colList}) VALUES (${placeholders})`,
    params: cols.map((c) => values[c])
  }
}
