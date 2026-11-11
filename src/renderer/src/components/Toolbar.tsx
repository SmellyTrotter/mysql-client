import { Button, Space, Tooltip, Typography } from 'antd'
import {
  ApiOutlined,
  BookOutlined,
  CodeOutlined,
  FileTextOutlined,
  LayoutOutlined,
  ReloadOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

export default function Toolbar() {
  const connections = useAppStore((s) => s.connections)
  const lastUsedConnId = useAppStore((s) => s.lastUsedConnId)
  const schemasByConn = useAppStore((s) => s.schemasByConn)
  const metadataLoading = useAppStore((s) => s.metadataLoading)
  const metadataError = useAppStore((s) => s.metadataError)
  const refreshMetadata = useAppStore((s) => s.refreshMetadata)
  const openQuery = useAppStore((s) => s.openQuery)
  const openConnectionDialog = useUiStore((s) => s.openConnectionDialog)
  const setBookmarksOpen = useUiStore((s) => s.setBookmarksOpen)
  const setSqlLogOpen = useUiStore((s) => s.setSqlLogOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const siderVisible = useUiStore((s) => s.siderVisible)
  const toggleSider = useUiStore((s) => s.toggleSider)

  return (
    <Space className="app-header-tools" size={8}>
      <span className="brand-mark" />
      <Typography.Text strong className="brand-title" style={{ marginRight: 4 }}>
        MySQL Client
      </Typography.Text>
      {metadataError && (
        <Tooltip title={metadataError}>
          <Typography.Text type="danger" className="metadata-error" style={{ fontSize: 12 }}>
            元数据刷新失败
          </Typography.Text>
        </Tooltip>
      )}
      <Tooltip title={siderVisible ? '隐藏左侧栏' : '显示左侧栏'}>
        <Button type={siderVisible ? 'default' : 'primary'} icon={<LayoutOutlined />} onClick={toggleSider} />
      </Tooltip>
      <Button type="primary" icon={<ApiOutlined />} onClick={() => openConnectionDialog()}>
        新建连接
      </Button>
      <Button
        icon={<CodeOutlined />}
        disabled={connections.length === 0}
        onClick={() => {
          const connId = lastUsedConnId ?? connections[0]?.id
          const schema = connId ? (schemasByConn[connId] ?? [])[0] : undefined
          if (connId && schema) openQuery(connId, schema)
        }}
      >
        新建查询
      </Button>
      <Tooltip title="重新拉取所有连接的库表元数据">
        <Button
          icon={<ReloadOutlined />}
          loading={metadataLoading}
          disabled={connections.length === 0}
          onClick={() => void refreshMetadata()}
        >
          刷新元数据
        </Button>
      </Tooltip>
      <Button icon={<BookOutlined />} disabled={connections.length === 0} onClick={() => setBookmarksOpen(true)}>
        书签
      </Button>
      <Tooltip title="最近 1 小时的增删改 SQL 记录">
        <Button icon={<FileTextOutlined />} disabled={connections.length === 0} onClick={() => setSqlLogOpen(true)}>
          SQL 日志
        </Button>
      </Tooltip>
      <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
        设置
      </Button>
    </Space>
  )
}
