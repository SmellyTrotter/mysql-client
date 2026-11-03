import { useMemo } from 'react'
import { Dropdown, Empty, Input, Select, Space, Tag as AntTag, Tooltip, Tree, App as AntApp } from 'antd'
import type { TreeDataNode } from 'antd'
import {
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOutlined,
  TableOutlined
} from '@ant-design/icons'
import type { TableNode } from '../../../shared/types'
import { nodeName } from '../../../shared/sharding'
import { api } from '../api'
import { filterNodes, useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

export default function Sidebar() {
  const { message, modal } = AntApp.useApp()
  const connections = useAppStore((s) => s.connections)
  const activeConnId = useAppStore((s) => s.activeConnId)
  const schemas = useAppStore((s) => s.schemas)
  const tableNodesBySchema = useAppStore((s) => s.tableNodesBySchema)
  const search = useAppStore((s) => s.search)
  const tags = useAppStore((s) => s.tags)
  const tableTags = useAppStore((s) => s.tableTags)
  const filterTagIds = useAppStore((s) => s.filterTagIds)
  const selectConnection = useAppStore((s) => s.selectConnection)
  const loadSchemaTables = useAppStore((s) => s.loadSchemaTables)
  const setSearch = useAppStore((s) => s.setSearch)
  const toggleTagFilter = useAppStore((s) => s.toggleTagFilter)
  const openTable = useAppStore((s) => s.openTable)
  const openDdl = useAppStore((s) => s.openDdl)
  const openQuery = useAppStore((s) => s.openQuery)
  const removeConnection = useAppStore((s) => s.removeConnection)
  const reloadBookmarks = useAppStore((s) => s.reloadBookmarks)
  const openConnectionDialog = useUiStore((s) => s.openConnectionDialog)
  const openTagManager = useUiStore((s) => s.openTagManager)

  const treeData = useMemo<TreeDataNode[]>(() => {
    return schemas.map((schema) => {
      const nodes = tableNodesBySchema[schema] ?? []
      const visible = filterNodes(nodes, search, filterTagIds, tableTags, schema)
      return {
        key: `schema:${schema}`,
        icon: <DatabaseOutlined />,
        title: schema,
        children: visible.map((node) => buildTableNode(schema, node))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemas, tableNodesBySchema, search, filterTagIds, tableTags])

  function buildTableNode(schema: string, node: TableNode): TreeDataNode {
    const logical = node.logical
    const tagList = tableTags[`${schema}.${nodeName(node)}`] ?? []
    const title = (
      <Dropdown
        trigger={['contextMenu']}
        menu={{
          items: logical
            ? [
                { key: 'open-first', label: '打开第一张分表' },
                { key: 'ddl', label: '查看 DDL' },
                { key: 'tags', label: '管理标签' }
              ]
            : [
                { key: 'open', label: '打开表' },
                { key: 'query', label: '对此表新建查询' },
                { key: 'ddl', label: '查看 DDL' },
                { key: 'tags', label: '管理标签' },
                { key: 'bookmark', label: '收藏此表' }
              ],
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation()
            const firstTable = node.tables[0].name
            if (key === 'open' || key === 'open-first') openTable(schema, firstTable)
            if (key === 'query') openQuery(schema, `SELECT * FROM \`${schema}\`.\`${firstTable}\` LIMIT 100;`)
            if (key === 'ddl') openDdl(schema, firstTable)
            if (key === 'tags') openTagManager(schema, nodeName(node))
            if (key === 'bookmark' && activeConnId) {
              void api.bookmarks
                .create({ connId: activeConnId, type: 'table', name: `${schema}.${firstTable}`, content: `${schema}.${firstTable}` })
                .then(() => reloadBookmarks())
                .then(() => message.success('已加入书签'))
            }
          }
        }}
      >
        <span className="tree-node-title">
          <span>{nodeName(node)}</span>
          {logical && <span className="shard-count">×{node.tables.length}</span>}
          {tagList.map((t) => (
            <AntTag key={t.id} color={t.color} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '16px' }}>
              {t.name}
            </AntTag>
          ))}
        </span>
      </Dropdown>
    )

    return {
      key: `table:${schema}.${nodeName(node)}`,
      icon: logical ? <FolderOutlined /> : <TableOutlined />,
      title,
      children: logical
        ? node.tables.map((t) => ({
            key: `table:${schema}.${t.name}`,
            icon: <TableOutlined />,
            title: (
              <span
                className="tree-node-title"
                onDoubleClick={() => openTable(schema, t.name)}
              >
                {t.name}
              </span>
            )
          }))
        : undefined
    }
  }

  return (
    <>
      <div className="sidebar-search">
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择连接"
            value={activeConnId}
            onChange={(id) => void selectConnection(id)}
            options={connections.map((c) => ({ value: c.id, label: `${c.name} (${c.host}:${c.port})` }))}
            dropdownRender={(menu) => (
              <>
                {menu}
                <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
                  <Space>
                    <a onClick={() => activeConnId && openConnectionDialog(activeConnId)}>
                      <EditOutlined /> 编辑
                    </a>
                    <a
                      style={{ color: '#ff4d4f' }}
                      onClick={() => {
                        if (!activeConnId) return
                        modal.confirm({
                          title: '删除连接？',
                          content: '本地缓存的元数据、标签、书签会一并删除。',
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            await removeConnection(activeConnId)
                            void message.success('已删除')
                          }
                        })
                      }}
                    >
                      <DeleteOutlined /> 删除
                    </a>
                  </Space>
                </div>
              </>
            )}
          />
          <Input.Search
            allowClear
            placeholder="搜索表名 / 注释"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Space>
      </div>
      <div className="sidebar-tree">
        {treeData.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无元数据，点击顶部「刷新元数据」"
            style={{ marginTop: 40 }}
          />
        ) : (
          <Tree
            showIcon
            blockNode
            defaultExpandAll={false}
            treeData={treeData}
            onExpand={(keys, info) => {
              const key = String(info.node.key)
              if (key.startsWith('schema:')) {
                const schema = key.slice('schema:'.length)
                if (!tableNodesBySchema[schema]) void loadSchemaTables(schema)
              }
            }}
            onDoubleClick={(_e, node) => {
              const key = String(node.key)
              if (key.startsWith('table:')) {
                const rest = key.slice('table:'.length)
                const dot = rest.indexOf('.')
                const schema = rest.slice(0, dot)
                const table = rest.slice(dot + 1)
                const nodes = tableNodesBySchema[schema] ?? []
                const found = nodes.find((n) => nodeName(n) === table)
                if (found && !found.logical) openTable(schema, table)
                if (found?.logical) openTable(schema, found.tables[0].name)
              }
            }}
          />
        )}
      </div>
      {tags.length > 0 && (
        <div className="sidebar-tags">
          <Tooltip title="点击标签过滤表">
            <Space size={4} wrap>
              {tags.map((t) => {
                const active = filterTagIds.includes(t.id)
                return (
                  <AntTag
                    key={t.id}
                    color={active ? t.color : undefined}
                    style={{ cursor: 'pointer', opacity: active ? 1 : 0.55 }}
                    onClick={() => toggleTagFilter(t.id)}
                  >
                    {t.name}
                  </AntTag>
                )
              })}
            </Space>
          </Tooltip>
        </div>
      )}
    </>
  )
}
