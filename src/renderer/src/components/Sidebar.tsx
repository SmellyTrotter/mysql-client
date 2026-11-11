import { useEffect, useMemo, useState } from 'react'
import { Dropdown, Empty, Input, Space, Tag as AntTag, Tooltip, Tree, App as AntApp } from 'antd'
import type { TreeDataNode } from 'antd'
import {
  ApiOutlined,
  DatabaseOutlined,
  FolderOutlined,
  TableOutlined
} from '@ant-design/icons'
import type { TableNode } from '../../../shared/types'
import { nodeName } from '../../../shared/sharding'
import { scopeSummary } from '../../../shared/scope'
import { api } from '../api'
import { autoConnectionColor } from '../connectionColors'
import { filterNodes, useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

export default function Sidebar() {
  const { message, modal } = AntApp.useApp()
  const connections = useAppStore((s) => s.connections)
  const schemasByConn = useAppStore((s) => s.schemasByConn)
  const tableNodesByConn = useAppStore((s) => s.tableNodesByConn)
  const search = useAppStore((s) => s.search)
  const tags = useAppStore((s) => s.tags)
  const tableTagsByConn = useAppStore((s) => s.tableTagsByConn)
  const filterTagIds = useAppStore((s) => s.filterTagIds)
  const ensureConnectionData = useAppStore((s) => s.ensureConnectionData)
  const ensureSchemaTables = useAppStore((s) => s.ensureSchemaTables)
  const setSearch = useAppStore((s) => s.setSearch)
  const toggleTagFilter = useAppStore((s) => s.toggleTagFilter)
  const openTable = useAppStore((s) => s.openTable)
  const openDdl = useAppStore((s) => s.openDdl)
  const openQuery = useAppStore((s) => s.openQuery)
  const refreshMetadata = useAppStore((s) => s.refreshMetadata)
  const removeConnection = useAppStore((s) => s.removeConnection)
  const touchConnection = useAppStore((s) => s.touchConnection)
  const reloadBookmarks = useAppStore((s) => s.reloadBookmarks)
  const openConnectionDialog = useUiStore((s) => s.openConnectionDialog)
  const openTagManager = useUiStore((s) => s.openTagManager)

  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])

  /** 单张表（或分表子表）的右键菜单 */
  function tableMenu(connId: string, schema: string, table: string, tagsTarget?: string) {
    return {
      items: [
        { key: 'open', label: '打开表' },
        { key: 'query', label: '对此表新建查询' },
        { key: 'ddl', label: '查看 DDL' },
        { key: 'tags', label: '管理标签' },
        { key: 'bookmark', label: '收藏此表' }
      ],
      onClick: ({ key, domEvent }: { key: string; domEvent: React.SyntheticEvent }) => {
        domEvent.stopPropagation()
        if (key === 'open') openTable(connId, schema, table)
        if (key === 'query') openQuery(connId, schema, `SELECT * FROM \`${schema}\`.\`${table}\` LIMIT 100;`)
        if (key === 'ddl') openDdl(connId, schema, table)
        if (key === 'tags') openTagManager(connId, schema, tagsTarget ?? table)
        if (key === 'bookmark') {
          void api.bookmarks
            .create({ connId, type: 'table', name: `${schema}.${table}`, content: `${schema}.${table}` })
            .then(() => reloadBookmarks())
            .then(() => message.success('已加入书签'))
        }
      }
    }
  }

  function buildTableNode(connId: string, schema: string, node: TableNode): TreeDataNode {
    const logical = node.logical
    const tagList = tableTagsByConn[connId]?.[`${schema}.${nodeName(node)}`] ?? []
    const title = (
      <Dropdown
        trigger={['contextMenu']}
        menu={
          logical
            ? {
                items: [
                  { key: 'open-first', label: '打开第一张分表' },
                  { key: 'ddl', label: '查看 DDL' },
                  { key: 'tags', label: '管理标签（整组生效）' }
                ],
                onClick: ({ key, domEvent }: { key: string; domEvent: React.SyntheticEvent }) => {
                  domEvent.stopPropagation()
                  const firstTable = node.tables[0].name
                  if (key === 'open-first') openTable(connId, schema, firstTable)
                  if (key === 'ddl') openDdl(connId, schema, firstTable)
                  if (key === 'tags') openTagManager(connId, schema, nodeName(node))
                }
              }
            : tableMenu(connId, schema, node.tables[0].name)
        }
      >
        <span className="tree-node-title">
          <Tooltip title={nodeName(node)} mouseEnterDelay={0.6}>
            <span className="tree-node-name">{nodeName(node)}</span>
          </Tooltip>
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
      key: `table:${connId}:${schema}.${nodeName(node)}`,
      icon: logical ? (
        <FolderOutlined style={{ color: 'var(--app-primary-hover)' }} />
      ) : (
        <TableOutlined style={{ color: 'var(--app-primary-hover)' }} />
      ),
      title,
      children: logical
        ? node.tables.map((t) => ({
            key: `table:${connId}:${schema}.${t.name}`,
            icon: <TableOutlined style={{ color: 'var(--app-primary-hover)' }} />,
            title: (
              <Dropdown trigger={['contextMenu']} menu={tableMenu(connId, schema, t.name)}>
                <span className="tree-node-title" onDoubleClick={() => openTable(connId, schema, t.name)}>
                  <Tooltip title={t.name} mouseEnterDelay={0.6}>
                    <span className="tree-node-name">{t.name}</span>
                  </Tooltip>
                </span>
              </Dropdown>
            )
          }))
        : undefined
    }
  }

  const treeData = useMemo<TreeDataNode[]>(() => {
    return connections.map((conn) => {
      const schemas = schemasByConn[conn.id]
      const connColor = conn.color || autoConnectionColor(conn.id)
      const scope = scopeSummary(conn.schemaScope, conn.tableScope)
      const scoped = !!(conn.schemaScope?.trim() || conn.tableScope?.trim())
      return {
        key: `conn:${conn.id}`,
        icon: <ApiOutlined style={{ color: connColor }} />,
        isLeaf: false,
        title: (
          <Dropdown
            trigger={['contextMenu']}
            menu={{
              items: [
                { key: 'query', label: '新建查询' },
                { key: 'refresh', label: '刷新此连接元数据' },
                { key: 'edit', label: '编辑连接' },
                { key: 'scope', label: '设置库表范围…' },
                { key: 'delete', label: '删除连接', danger: true }
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation()
                const firstSchema = (schemasByConn[conn.id] ?? [])[0]
                if (key === 'query' && firstSchema) openQuery(conn.id, firstSchema)
                if (key === 'refresh') void refreshMetadata(conn.id)
                if (key === 'edit' || key === 'scope') openConnectionDialog(conn.id)
                if (key === 'delete') {
                  modal.confirm({
                    title: `删除连接「${conn.name}」？`,
                    content: '本地缓存的元数据、标签、书签会一并删除。',
                    okButtonProps: { danger: true },
                    onOk: async () => {
                      await removeConnection(conn.id)
                      void message.success('已删除')
                    }
                  })
                }
              }
            }}
          >
            <span className="tree-node-title tree-node-conn">
              <Tooltip
                mouseEnterDelay={0.4}
                title={
                  <div className="conn-tooltip">
                    <div className="conn-tooltip-title">{conn.name || conn.host}</div>
                    <div>{conn.user}@{conn.host}:{conn.port}</div>
                    {conn.database && <div>默认库：{conn.database}</div>}
                    <div>显示范围：{scope}</div>
                    <div>已缓存 {schemas?.length ?? 0} 个库</div>
                  </div>
                }
              >
                <span className="conn-identity">
                  <span
                    className="conn-dot"
                    style={{ background: connColor, boxShadow: `0 0 0 3px ${connColor}2b` }}
                  />
                  <span className="tree-node-name">{conn.name || conn.host}</span>
                </span>
              </Tooltip>
              {scoped && (
                <Tooltip title={`只显示：${scope}`}>
                  <span className="conn-scope">{scope}</span>
                </Tooltip>
              )}
            </span>
          </Dropdown>
        ),
        children: (schemas ?? []).map((schema) => {
          const loaded = !!tableNodesByConn[conn.id]?.[schema]
          const nodes = tableNodesByConn[conn.id]?.[schema] ?? []
          const visible = filterNodes(nodes, search, filterTagIds, tableTagsByConn[conn.id] ?? {}, schema)
          return {
            key: `schema:${conn.id}:${schema}`,
            icon: <DatabaseOutlined style={{ color: 'var(--app-primary-hover)' }} />,
            title: schema,
            isLeaf: false,
            children: loaded ? visible.map((node) => buildTableNode(conn.id, schema, node)) : undefined
          }
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, schemasByConn, tableNodesByConn, search, filterTagIds, tableTagsByConn])

  // 搜索时自动展开所有连接与库，让匹配结果直接可见
  useEffect(() => {
    if (search.trim()) {
      const keys: React.Key[] = []
      for (const conn of connections) {
        keys.push(`conn:${conn.id}`)
        for (const schema of schemasByConn[conn.id] ?? []) keys.push(`schema:${conn.id}:${schema}`)
      }
      setExpandedKeys(keys)
    }
  }, [search, connections, schemasByConn])

  return (
    <>
      <div className="sidebar-search">
        <Input.Search
          allowClear
          placeholder="搜索所有连接的表名 / 注释"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="sidebar-tree">
        {treeData.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="先点击顶部「新建连接」，再「刷新元数据」"
            style={{ marginTop: 40 }}
          />
        ) : (
          <Tree
            showIcon
            blockNode
            expandAction="click"
            expandedKeys={expandedKeys}
            treeData={treeData}
            onExpand={(keys, info) => {
              setExpandedKeys(keys)
              const key = String(info.node.key)
              if (key.startsWith('conn:')) {
                touchConnection(key.slice('conn:'.length))
              }
              if (key.startsWith('schema:')) {
                const rest = key.slice('schema:'.length)
                const sep = rest.indexOf(':')
                void ensureSchemaTables(rest.slice(0, sep), rest.slice(sep + 1))
              }
            }}
            onDoubleClick={(_e, node) => {
              const key = String(node.key)
              if (key.startsWith('table:')) {
                const rest = key.slice('table:'.length)
                const sep = rest.indexOf(':')
                const connId = rest.slice(0, sep)
                const schemaTable = rest.slice(sep + 1)
                const dot = schemaTable.indexOf('.')
                const schema = schemaTable.slice(0, dot)
                const name = schemaTable.slice(dot + 1)
                const nodes = tableNodesByConn[connId]?.[schema] ?? []
                const found = nodes.find((n) => nodeName(n) === name)
                if (found && !found.logical) openTable(connId, schema, name)
                if (found?.logical) openTable(connId, schema, found.tables[0].name)
              }
            }}
          />
        )}
      </div>
      {tags.length > 0 && (
        <div className="sidebar-tags">
          <Tooltip title="点击标签过滤表（跨所有连接）">
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
