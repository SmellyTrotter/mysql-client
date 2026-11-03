import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import type { Bookmark, ConnectionConfig, ConnectionInput, TableInfo, Tag } from '../../shared/types'

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    const file = path.join(app.getPath('userData'), 'mysql-client.db')
    db = new Database(file)
    db.pragma('journal_mode = WAL')
    migrate(db)
  }
  return db
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 3306,
      user TEXT NOT NULL,
      password_enc TEXT,
      database_name TEXT,
      group_name TEXT,
      color TEXT
    );
    CREATE TABLE IF NOT EXISTS metadata_cache (
      conn_id TEXT NOT NULL,
      schema_name TEXT NOT NULL,
      table_name TEXT NOT NULL,
      table_comment TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (conn_id, schema_name, table_name)
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT 'purple'
    );
    CREATE TABLE IF NOT EXISTS table_tags (
      conn_id TEXT NOT NULL,
      schema_name TEXT NOT NULL,
      table_name TEXT NOT NULL,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (conn_id, schema_name, table_name, tag_id)
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conn_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('sql','table')),
      name TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `)
}

// ---------- connections ----------

export function listConnections(): ConnectionConfig[] {
  const rows = getDb().prepare('SELECT * FROM connections ORDER BY group_name, name').all() as any[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    host: r.host,
    port: r.port,
    user: r.user,
    database: r.database_name ?? undefined,
    groupName: r.group_name ?? undefined,
    color: r.color ?? undefined,
    passwordEnc: r.password_enc ?? undefined
  }))
}

export function upsertConnection(id: string, input: ConnectionInput, passwordEnc?: string): void {
  getDb()
    .prepare(
      `INSERT INTO connections (id, name, host, port, user, password_enc, database_name, group_name, color)
       VALUES (@id, @name, @host, @port, @user, @passwordEnc, @database, @groupName, @color)
       ON CONFLICT(id) DO UPDATE SET
         name=@name, host=@host, port=@port, user=@user,
         password_enc=COALESCE(@passwordEnc, password_enc),
         database_name=@database, group_name=@groupName, color=@color`
    )
    .run({
      id,
      name: input.name,
      host: input.host,
      port: input.port,
      user: input.user,
      passwordEnc: passwordEnc ?? null,
      database: input.database ?? null,
      groupName: input.groupName ?? null,
      color: input.color ?? null
    })
}

export function deleteConnection(id: string): void {
  const d = getDb()
  d.prepare('DELETE FROM connections WHERE id = ?').run(id)
  d.prepare('DELETE FROM metadata_cache WHERE conn_id = ?').run(id)
  d.prepare('DELETE FROM table_tags WHERE conn_id = ?').run(id)
  d.prepare('DELETE FROM bookmarks WHERE conn_id = ?').run(id)
}

export function getConnection(id: string): ConnectionConfig | undefined {
  return listConnections().find((c) => c.id === id)
}

// ---------- metadata cache ----------

export function replaceMetadataCache(connId: string, tables: TableInfo[]): void {
  const d = getDb()
  const del = d.prepare('DELETE FROM metadata_cache WHERE conn_id = ?')
  const ins = d.prepare(
    `INSERT INTO metadata_cache (conn_id, schema_name, table_name, table_comment, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  )
  const now = Date.now()
  d.transaction(() => {
    del.run(connId)
    for (const t of tables) ins.run(connId, t.schema, t.name, t.comment, now)
  })()
}

export function listCachedTables(connId: string, schema?: string): TableInfo[] {
  const d = getDb()
  const rows = (
    schema
      ? d
          .prepare(
            'SELECT schema_name, table_name, table_comment FROM metadata_cache WHERE conn_id = ? AND schema_name = ? ORDER BY table_name'
          )
          .all(connId, schema)
      : d
          .prepare(
            'SELECT schema_name, table_name, table_comment FROM metadata_cache WHERE conn_id = ? ORDER BY schema_name, table_name'
          )
          .all(connId)
  ) as any[]
  return rows.map((r) => ({ schema: r.schema_name, name: r.table_name, comment: r.table_comment }))
}

export function listCachedSchemas(connId: string): string[] {
  const rows = getDb()
    .prepare('SELECT DISTINCT schema_name FROM metadata_cache WHERE conn_id = ? ORDER BY schema_name')
    .all(connId) as any[]
  return rows.map((r) => r.schema_name)
}

// ---------- tags ----------

export function listTags(): Tag[] {
  return getDb().prepare('SELECT id, name, color FROM tags ORDER BY name').all() as Tag[]
}

export function createTag(name: string, color: string): Tag {
  const info = getDb().prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color)
  return { id: Number(info.lastInsertRowid), name, color }
}

export function deleteTag(id: number): void {
  getDb().prepare('DELETE FROM table_tags WHERE tag_id = ?').run(id)
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
}

export function assignTag(connId: string, schema: string, table: string, tagId: number): void {
  getDb()
    .prepare(
      'INSERT OR IGNORE INTO table_tags (conn_id, schema_name, table_name, tag_id) VALUES (?, ?, ?, ?)'
    )
    .run(connId, schema, table, tagId)
}

export function unassignTag(connId: string, schema: string, table: string, tagId: number): void {
  getDb()
    .prepare(
      'DELETE FROM table_tags WHERE conn_id = ? AND schema_name = ? AND table_name = ? AND tag_id = ?'
    )
    .run(connId, schema, table, tagId)
}

/** 返回 key 为 `schema.table`、value 为该表全部标签的映射 */
export function listTableTags(connId: string): Record<string, Tag[]> {
  const rows = getDb()
    .prepare(
      `SELECT tt.schema_name, tt.table_name, t.id, t.name, t.color
       FROM table_tags tt JOIN tags t ON t.id = tt.tag_id
       WHERE tt.conn_id = ? ORDER BY t.name`
    )
    .all(connId) as any[]
  const map: Record<string, Tag[]> = {}
  for (const r of rows) {
    const key = `${r.schema_name}.${r.table_name}`
    ;(map[key] ??= []).push({ id: r.id, name: r.name, color: r.color })
  }
  return map
}

// ---------- bookmarks ----------

export function listBookmarks(connId?: string): Bookmark[] {
  const rows = (
    connId
      ? getDb().prepare('SELECT * FROM bookmarks WHERE conn_id = ? ORDER BY created_at DESC').all(connId)
      : getDb().prepare('SELECT * FROM bookmarks ORDER BY created_at DESC').all()
  ) as any[]
  return rows.map((r) => ({
    id: r.id,
    connId: r.conn_id,
    type: r.type,
    name: r.name,
    content: r.content,
    createdAt: r.created_at
  }))
}

export function createBookmark(b: Omit<Bookmark, 'id' | 'createdAt'>): Bookmark {
  const info = getDb()
    .prepare('INSERT INTO bookmarks (conn_id, type, name, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(b.connId, b.type, b.name, b.content, Date.now())
  return { ...b, id: Number(info.lastInsertRowid), createdAt: Date.now() }
}

export function deleteBookmark(id: number): void {
  getDb().prepare('DELETE FROM bookmarks WHERE id = ?').run(id)
}
