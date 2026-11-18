import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const PORT = 37999
const TOKEN = 'test-token'

// 完整 mock 主进程依赖，让真实 HTTP server 可以在测试里启动
vi.mock('../db/store', () => ({
  getMcpStatus: () => ({
    enabled: true,
    port: PORT,
    token: TOKEN,
    sseUrl: `http://127.0.0.1:${PORT}/sse?token=${TOKEN}`,
    streamableUrl: `http://127.0.0.1:${PORT}/mcp?token=${TOKEN}`
  }),
  getSetting: () => undefined,
  setSetting: () => undefined,
  listConnections: () => [
    {
      id: 'c1',
      name: '测试连接',
      host: '10.0.0.1',
      port: 3306,
      user: 'secret_user',
      groupName: '测试',
      schemaScope: 'demo',
      tableScope: ''
    }
  ],
  getConnection: () => ({
    id: 'c1',
    name: '测试连接',
    host: '10.0.0.1',
    port: 3306,
    user: 'secret_user',
    database: 'demo',
    schemaScope: 'demo',
    tableScope: ''
  }),
  listCachedTables: () => [{ schema: 'demo', name: 'order_0', comment: '订单' }],
  listDescribedGroups: () => [],
  getDescription: () => null
}))

vi.mock('../db/connectionManager', () => ({
  fetchColumns: async () => [],
  runQuery: async () => ({ fields: ['id'], rows: [{ id: 1 }], elapsedMs: 1 })
}))

import { startMcpServer, stopMcpServer } from './server'

import http from 'node:http'

function rawPost(host: string, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path, method: 'POST', headers: { host, 'content-type': 'application/json' } },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode ?? 0))
      }
    )
    req.on('error', reject)
    req.end('{}')
  })
}

describe('Streamable HTTP transport（真实 HTTP 层）', () => {
  beforeAll(() => {
    startMcpServer()
  })
  afterAll(() => {
    stopMcpServer()
  })

  it('token 错误直接拒绝', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    })
    expect(res.status).toBe(401)
  })

  it('非本机 Host 被拒绝', async () => {
    expect(await rawPost('evil.example.com', `/mcp?token=${TOKEN}`)).toBe(403)
  })

  it('完成 initialize 握手并调用工具', async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${PORT}/mcp?token=${TOKEN}`)
    )
    const client = new Client({ name: 'http-test', version: '1.0.0' })
    await client.connect(transport)

    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain('query')

    const res = await client.callTool({ name: 'list_connections', arguments: {} })
    const text = (res.content as { text: string }[])[0].text
    expect(text).toContain('测试连接')
    expect(text).not.toContain('secret_user')

    await client.close()
  })
})
