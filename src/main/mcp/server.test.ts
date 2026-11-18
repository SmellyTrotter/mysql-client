import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

// mock 主进程依赖，避免测试需要 Electron / 真实 MySQL
vi.mock('../db/store', () => ({
  listConnections: () => [
    {
      id: 'c1',
      name: '测试连接',
      host: '10.0.0.1',
      port: 3306,
      user: 'secret_user',
      groupName: '测试',
      schemaScope: 'demo',
      tableScope: '',
      passwordEnc: 'secret'
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
  listCachedTables: () => [
    { schema: 'demo', name: 'order_0', comment: '订单分表' },
    { schema: 'demo', name: 'order_1', comment: '订单分表' }
  ],
  listDescribedGroups: () => ['demo.order_*'],
  getDescription: () => ({
    connId: 'c1',
    schema: 'demo',
    tableGroup: 'order_*',
    purpose: '订单主表',
    scenarios: '查订单状态',
    content: '一行一张订单',
    updatedAt: 1
  })
}))

vi.mock('../db/connectionManager', () => ({
  fetchColumns: async () => [
    { name: 'id', type: 'bigint', nullable: false, isPrimary: true, isAutoIncrement: true, defaultValue: null, comment: '主键' }
  ],
  runQuery: async (_config: unknown, sql: string) => {
    if (/private|secret/.test(sql)) throw new Error('不该执行到被 scope 拒绝的 SQL')
    return { fields: ['id'], rows: [{ id: 1 }], elapsedMs: 3 }
  }
}))

import { createMcpServer } from './server'

async function makeClient() {
  const server = createMcpServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

describe('MCP 工具协议', () => {
  it('列出四个工具', async () => {
    const client = await makeClient()
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['describe_table', 'list_connections', 'list_tables', 'query'].sort()
    )
  })

  it('list_connections 不泄露主机 / 账号 / 密码', async () => {
    const client = await makeClient()
    const res = await client.callTool({ name: 'list_connections', arguments: {} })
    const text = (res.content as { text: string }[])[0].text
    expect(text).toContain('测试连接')
    expect(text).not.toContain('10.0.0.1')
    expect(text).not.toContain('secret_user')
    expect(text).not.toContain('secret')
  })

  it('list_tables 返回分表组与人工描述', async () => {
    const client = await makeClient()
    const res = await client.callTool({ name: 'list_tables', arguments: { connId: 'c1' } })
    const text = (res.content as { text: string }[])[0].text
    const data = JSON.parse(text)
    expect(data[0].group).toBe('order_*')
    expect(data[0].isShardGroup).toBe(true)
    expect(data[0].description.purpose).toBe('订单主表')
    expect(data[0].shards).toEqual(['order_0', 'order_1'])
  })

  it('describe_table 返回字段与所属组描述', async () => {
    const client = await makeClient()
    const res = await client.callTool({
      name: 'describe_table',
      arguments: { connId: 'c1', schema: 'demo', table: 'order_0' }
    })
    const data = JSON.parse((res.content as { text: string }[])[0].text)
    expect(data.group).toBe('order_*')
    expect(data.columns[0].name).toBe('id')
    expect(data.description.content).toBe('一行一张订单')
  })

  it('query 执行 SELECT 并自动加 LIMIT', async () => {
    const client = await makeClient()
    const res = await client.callTool({
      name: 'query',
      arguments: { connId: 'c1', sql: 'SELECT id FROM demo.order_0' }
    })
    const data = JSON.parse((res.content as { text: string }[])[0].text)
    expect(data.rows).toEqual([{ id: 1 }])
    expect(data.tables).toContain('demo.order_0')
  })

  it('query 拒绝写操作，且不会连到数据库', async () => {
    const client = await makeClient()
    const res = await client.callTool({
      name: 'query',
      arguments: { connId: 'c1', sql: 'DELETE FROM demo.order_0' }
    })
    expect(res.isError).toBe(true)
  })
})
