import { App as AntApp, Drawer, Empty, List, Space, Tag as AntTag, Typography } from 'antd'
import { DeleteOutlined, TableOutlined, CodeOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

export default function BookmarksDrawer() {
  const { message } = AntApp.useApp()
  const open = useUiStore((s) => s.bookmarksOpen)
  const setOpen = useUiStore((s) => s.setBookmarksOpen)
  const bookmarks = useAppStore((s) => s.bookmarks)
  const connections = useAppStore((s) => s.connections)
  const schemasByConn = useAppStore((s) => s.schemasByConn)
  const reloadBookmarks = useAppStore((s) => s.reloadBookmarks)
  const openQuery = useAppStore((s) => s.openQuery)
  const openTable = useAppStore((s) => s.openTable)

  function connName(connId: string): string {
    return connections.find((c) => c.id === connId)?.name ?? connId
  }

  function useBookmark(connId: string, type: 'sql' | 'table', content: string) {
    if (type === 'sql') {
      const schema = (schemasByConn[connId] ?? [])[0] ?? ''
      openQuery(connId, schema, content)
    } else {
      // content 形如 schema.table
      const dot = content.indexOf('.')
      if (dot > 0) openTable(connId, content.slice(0, dot), content.slice(dot + 1))
    }
    setOpen(false)
  }

  return (
    <Drawer title="书签" open={open} onClose={() => setOpen(false)} width={360}>
      {bookmarks.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无书签。在查询页点「收藏为书签」，或右键表收藏。"
        />
      ) : (
        <List
          dataSource={bookmarks}
          renderItem={(b) => (
            <List.Item
              style={{ cursor: 'pointer' }}
              onClick={() => useBookmark(b.connId, b.type, b.content)}
              actions={[
                <a
                  key="del"
                  onClick={async (e) => {
                    e.stopPropagation()
                    await api.bookmarks.remove(b.id)
                    await reloadBookmarks()
                    void message.success('已删除')
                  }}
                >
                  <DeleteOutlined />
                </a>
              ]}
            >
              <List.Item.Meta
                avatar={b.type === 'sql' ? <CodeOutlined /> : <TableOutlined />}
                title={
                  <Space size={4}>
                    <Typography.Text style={{ fontSize: 13 }}>{b.name}</Typography.Text>
                    <AntTag style={{ fontSize: 11 }}>{b.type === 'sql' ? 'SQL' : '表'}</AntTag>
                    <AntTag color="blue" style={{ fontSize: 11 }}>{connName(b.connId)}</AntTag>
                  </Space>
                }
                description={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                    {b.content}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  )
}
