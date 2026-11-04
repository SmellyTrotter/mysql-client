import type { Api } from '../../preload/index'
import type { ConnectionConfig, TableDataResult, TableInfo } from '../../shared/types'

/**
 * 浏览器调试 Mock：当 window.api 不存在（纯 vite 起渲染层、无 Electron）时，
 * 提供一份内存假数据，便于在浏览器里直接调 UI。
 */
function createMockApi(): Api {
  const schemas = ['order_db', 'gifshow']
  const tables: TableInfo[] = [
    ...Array.from({ length: 8 }, (_, i) => ({ schema: 'order_db', name: `order_${i}`, comment: '订单分表' })),
    { schema: 'order_db', name: 'order_config', comment: '' },
    ...Array.from({ length: 120 }, (_, i) => ({
      schema: 'gifshow',
      name: `very_long_table_name_for_scroll_testing_purpose_number_${i}`,
      comment: ''
    }))
  ]
  const conn: Omit<ConnectionConfig, 'passwordEnc'> = {
    id: 'mock-1',
    name: '本地 Mock',
    host: 'public-wlf2-d53-cds-staging-node7.idchb2az2.hb2.kwaicd.com',
    port: 47785,
    user: 'test_rw'
  }
  const conn2: Omit<ConnectionConfig, 'passwordEnc'> = {
    id: 'mock-2',
    name: '测试环境',
    host: 'public-wlf2-d53-cds-staging-node7.idchb2az2.hb2.kwaicd.com',
    port: 47785,
    user: 'test_rw'
  }
  const schemas2 = ['analytics']
  const tables2: TableInfo[] = Array.from({ length: 6 }, (_, i) => ({
    schema: 'analytics',
    name: `report_daily_${i}`,
    comment: '日报表'
  }))

  const extraCols = Array.from({ length: 18 }, (_, i) => ({
    name: `field_${i}`,
    type: i % 3 === 0 ? 'datetime' : 'varchar(64)',
    nullable: true,
    isPrimary: false,
    isAutoIncrement: false,
    defaultValue: null,
    comment: ''
  }))
  const grid: TableDataResult = {
    columns: [
      { name: 'id', type: 'bigint', nullable: false, isPrimary: true, isAutoIncrement: true, defaultValue: null, comment: '' },
      { name: 'create_time', type: 'bigint', nullable: true, isPrimary: false, isAutoIncrement: false, defaultValue: null, comment: '' },
      { name: 'payload', type: 'json', nullable: true, isPrimary: false, isAutoIncrement: false, defaultValue: null, comment: '' },
      ...extraCols
    ],
    rows: Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      create_time: 1700000000000 + i * 1000,
      payload: JSON.stringify({ a: i, b: 'x'.repeat(60) }),
      ...Object.fromEntries(extraCols.map((c, j) => [c.name, j % 3 === 0 ? new Date(1700000000000) : `value_${i}_${j}_${'y'.repeat(30)}`]))
    })),
    total: 100000,
    page: 1,
    pageSize: 100,
    readonly: false
  }

  const noop = () => Promise.resolve(undefined)

  return {
    connections: {
      list: () => Promise.resolve([conn, conn2]),
      create: () => Promise.resolve('mock-1'),
      update: () => noop(),
      remove: () => noop(),
      test: () => noop()
    },
    metadata: {
      refresh: () => Promise.resolve(tables.length),
      schemas: (connId: string) => Promise.resolve(connId === 'mock-2' ? schemas2 : schemas),
      tables: (connId: string, s?: string) =>
        Promise.resolve((connId === 'mock-2' ? tables2 : tables).filter((t) => !s || t.schema === s))
    },
    query: {
      run: () => Promise.resolve({ fields: ['id'], rows: [{ id: 1 }], elapsedMs: 1 })
    },
    table: {
      data: () => Promise.resolve(grid),
      columns: () => Promise.resolve(grid.columns),
      ddl: () => Promise.resolve('CREATE TABLE `order_0` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB;'),
      update: () => Promise.resolve(1),
      insert: () => Promise.resolve(1),
      remove: () => Promise.resolve(1)
    },
    tags: {
      list: () => Promise.resolve([{ id: 1, name: '核心表', color: 'purple' }]),
      create: () => Promise.resolve({ id: 2, name: 'x', color: 'blue' }),
      remove: () => noop(),
      assign: () => noop(),
      unassign: () => noop(),
      forConn: () => Promise.resolve({})
    },
    bookmarks: {
      list: () => Promise.resolve([]),
      create: (b: { connId: string; type: 'sql' | 'table'; name: string; content: string }) =>
        Promise.resolve({ ...b, id: 1, createdAt: Date.now() }),
      remove: () => noop()
    },
    logs: {
      list: () => Promise.resolve([])
    },
    events: {
      onCloseActiveTab: () => () => undefined
    }
  } as unknown as Api
}

export const api: Api = (window as unknown as { api?: Api }).api ?? createMockApi()
