// 主进程内嵌 MCP server：同时提供 SSE 与 Streamable HTTP 两种 transport。
// 设计约束：
// - 绑定 127.0.0.1，拒绝非本机 Host，防 DNS rebinding
// - 每个会话独立 McpServer 实例（SDK 规定一个 transport 一个 server）
// - SSE: /sse 建立流，POST /messages 发消息；Streamable HTTP: 单端点 /mcp
// - 两种端点都校验 token；GET/POST/DELETE 全部校验
// - 首期只暴露只读工具，写操作后续单独接入

import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { ConnectionConfig } from '../../shared/types'
import { guardSelectSql } from '../../shared/sqlGuard'
import { groupTables, nodeName } from '../../shared/sharding'
import * as store from '../db/store'
import * as cm from '../db/connectionManager'

let httpServer: http.Server | null = null
const sessions = new Map<string, SSEServerTransport>()
const streamSessions = new Map<string, StreamableHTTPServerTransport>()

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function requireConn(id: string): ConnectionConfig {
  const config = store.getConnection(id)
  if (!config) throw new Error(`连接不存在: ${id}`)
  return config
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'mysql-client', version: '0.1.0' },
    { instructions: '只读 MySQL 查询工具：先列连接、再列表、必要时看字段与人工描述，最后用 query 执行 SELECT。' }
  )

  // 列连接：绝不返回 host / user / 密码
  server.tool('list_connections', '列出本地已配置的 MySQL 连接（只返回 id、名称、分组与库表范围，不含主机、账号、密码）', {}, async () => {
    const list = store.listConnections().map((c) => ({
      id: c.id,
      name: c.name,
      group: c.groupName ?? '',
      schemaScope: c.schemaScope ?? '',
      tableScope: c.tableScope ?? ''
    }))
    return textResult(JSON.stringify(list, null, 2))
  })

  // 列表：优先读 metadata_cache，不碰 MySQL；带上人工描述与分表组
  server.tool(
    'list_tables',
    '列出某个连接下可见的库表，含 MySQL 注释、分表逻辑组与人工描述。只读本地缓存，不连数据库。',
    {
      connId: z.string().describe('连接 id，来自 list_connections'),
      schema: z.string().optional().describe('只看某个库；不填返回全部库')
    },
    async ({ connId, schema }) => {
      requireConn(connId)
      const tables = store.listCachedTables(connId, schema)
      const groups = groupTables(tables)
      const described = new Set(store.listDescribedGroups(connId))
      const out = groups.map((node) => ({
        schema: node.tables[0].schema,
        group: nodeName(node),
        isShardGroup: node.logical !== null,
        shards: node.logical ? node.tables.map((t) => t.name) : [],
        mysqlComment: node.tables[0].comment,
        description: store.getDescription(connId, node.tables[0].schema, nodeName(node)) ?? null,
        described: described.has(`${node.tables[0].schema}.${nodeName(node)}`)
      }))
      return textResult(JSON.stringify(out, null, 2))
    }
  )

  // 单表详情：字段结构（连 MySQL）+ 该表所属组的描述
  server.tool(
    'describe_table',
    '查看一张表的字段结构（名称、类型、主键、注释）与所属分表组的人工描述。',
    {
      connId: z.string().describe('连接 id'),
      schema: z.string().describe('库名'),
      table: z.string().describe('表名，可以是具体的分表名')
    },
    async ({ connId, schema, table }) => {
      const config = requireConn(connId)
      const columns = await cm.fetchColumns(config, schema, table)
      const cached = store.listCachedTables(connId, schema)
      const groups = groupTables(cached)
      const node = groups.find((n) => n.tables.some((t) => t.name === table))
      const group = node ? nodeName(node) : table
      const description = store.getDescription(connId, schema, group) ?? null
      return textResult(
        JSON.stringify(
          {
            schema,
            table,
            group,
            isShardGroup: !!node?.logical,
            siblingShards: node?.logical ? node.tables.map((t) => t.name) : [],
            mysqlComment: cached.find((t) => t.name === table)?.comment ?? '',
            description,
            columns
          },
          null,
          2
        )
      )
    }
  )

  // 只读查询
  server.tool(
    'query',
    '执行一条只读 SELECT 查询。会自动追加 LIMIT（默认 200），并强制按该连接的库表范围校验。写操作与文件导出被拒绝。',
    {
      connId: z.string().describe('连接 id'),
      sql: z.string().describe('SELECT / WITH 查询语句'),
      limit: z.number().int().min(1).optional().describe('期望返回行数上限，最大 1000')
    },
    async ({ connId, sql, limit }) => {
      const config = requireConn(connId)
      const guard = guardSelectSql(sql, {
        schemaTokens: config.schemaScope ? config.schemaScope.split(',') : [],
        tableTokens: config.tableScope ? config.tableScope.split(',') : [],
        defaultSchema: config.database,
        maxLimit: limit
      })
      const result = await cm.runQuery(config, guard.sql)
      return textResult(
        JSON.stringify(
          {
            fields: result.fields,
            rows: result.rows,
            elapsedMs: result.elapsedMs,
            truncated: result.rows.length >= (limit ?? 200),
            tables: guard.tables
          },
          null,
          2
        )
      )
    }
  )

  return server
}

function isLocalHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false
  const host = hostHeader.split(':')[0].toLowerCase()
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function isMcpRunning(): boolean {
  return !!httpServer
}

/** 启动 SSE 服务。若已启动先停掉再按当前设置重启。 */
export function startMcpServer(): void {
  stopMcpServer()
  const status = store.getMcpStatus()
  if (!status.enabled) return

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${status.port}`)
    if (!isLocalHost(req.headers.host, status.port)) {
      res.writeHead(403).end('Forbidden')
      return
    }

    // ---------- Streamable HTTP：单端点 /mcp，支持 POST / GET / DELETE ----------
    if (url.pathname === '/mcp') {
      if (url.searchParams.get('token') !== status.token) {
        res.writeHead(401).end('Unauthorized')
        return
      }

      const sessionHeader = req.headers['mcp-session-id']
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader

      if (req.method === 'DELETE') {
        if (!sessionId || !streamSessions.has(sessionId)) {
          res.writeHead(404).end('Session not found')
          return
        }
        const transport = streamSessions.get(sessionId)!
        await transport.handleRequest(req, res)
        streamSessions.delete(sessionId)
        return
      }

      if (req.method === 'GET') {
        const transport = sessionId ? streamSessions.get(sessionId) : undefined
        if (!transport) {
          res.writeHead(400).end('Missing or invalid mcp-session-id')
          return
        }
        await transport.handleRequest(req, res)
        return
      }

      if (req.method === 'POST') {
        let transport: StreamableHTTPServerTransport | undefined
        if (sessionId) {
          transport = streamSessions.get(sessionId)
          if (!transport) {
            res.writeHead(404).end('Session not found')
            return
          }
        } else {
          // initialize 请求没有 session id，创建新 transport 与专属 server
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID()
          })
          transport.onclose = () => {
            if (transport?.sessionId) streamSessions.delete(transport.sessionId)
          }
          const mcp = createMcpServer()
          await mcp.connect(transport)
        }

        const body = await readBody(req)
        try {
          await transport.handleRequest(req, res, JSON.parse(body))
        } catch {
          if (!res.headersSent) res.writeHead(400).end('Bad request')
          else res.end()
        }
        if (transport.sessionId && !streamSessions.has(transport.sessionId)) {
          streamSessions.set(transport.sessionId, transport)
        }
        return
      }
    }

    // ---------- SSE：/sse 建流 + /messages 发消息 ----------
    if (req.method === 'GET' && url.pathname === '/sse') {
      if (url.searchParams.get('token') !== status.token) {
        res.writeHead(401).end('Unauthorized')
        return
      }
      const transport = new SSEServerTransport(`/messages?token=${status.token}`, res)
      sessions.set(transport.sessionId, transport)
      res.on('close', () => sessions.delete(transport.sessionId))
      const mcp = createMcpServer()
      await mcp.connect(transport)
      return
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      if (url.searchParams.get('token') !== status.token) {
        res.writeHead(401).end('Unauthorized')
        return
      }
      const transport = sessions.get(url.searchParams.get('sessionId') ?? '')
      if (!transport) {
        res.writeHead(404).end('Session not found')
        return
      }
      const body = await readBody(req)
      try {
        await transport.handlePostMessage(req, res, JSON.parse(body))
      } catch {
        res.writeHead(400).end('Bad request')
      }
      return
    }

    res.writeHead(404).end('Not found')
  })

  server.on('error', () => {
    // 端口占用等：静默失败，设置弹窗通过 isMcpRunning() 显示未运行
    httpServer = null
  })
  server.listen(status.port, '127.0.0.1')
  httpServer = server
}

export function stopMcpServer(): void {
  for (const t of sessions.values()) void t.close()
  sessions.clear()
  for (const t of streamSessions.values()) void t.close()
  streamSessions.clear()
  if (httpServer) {
    httpServer.close()
    httpServer = null
  }
}
