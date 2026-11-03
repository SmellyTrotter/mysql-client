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
  const activeConnId = useAppStore((s) => s.activeConnId)
  const schemas = useAppStore((s) => s.schemas)
  const metadataLoading = useAppStore((s) => s.metadataLoading)
  const refreshMetadata = useAppStore((s) => s.refreshMetadata)
  const openQuery = useAppStore((s) => s.openQuery)
  const openConnectionDialog = useUiStore((s) => s.openConnectionDialog)
  const setBookmarksOpen = useUiStore((s) => s.setBookmarksOpen)
  const setSqlLogOpen = useUiStore((s) => s.setSqlLogOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const siderVisible = useUiStore((s) => s.siderVisible)
  const toggleSider = useUiStore((s) => s.toggleSider)

  return (
    <Space className="no-drag" size={8}>
      <Typography.Text strong style={{ marginRight: 4 }}>
        MySQL Client
      </Typography.Text>
      <Tooltip title={siderVisible ? '隐藏左侧栏' : '显示左侧栏'}>
        <Button type={siderVisible ? 'default' : 'primary'} icon={<LayoutOutlined />} onClick={toggleSider} />
      </Tooltip>
      <Button type="primary" icon={<ApiOutlined />} onClick={() => openConnectionDialog()}>
        新建连接
      </Button>
      <Button
        icon={<CodeOutlined />}
        disabled={!activeConnId || schemas.length === 0}
        onClick={() => schemas[0] && openQuery(schemas[0])}
      >
        新建查询
      </Button>
      <Tooltip title="重新拉取库表元数据">
        <Button
          icon={<ReloadOutlined />}
          loading={metadataLoading}
          disabled={!activeConnId}
          onClick={() => void refreshMetadata()}
        >
          刷新元数据
        </Button>
      </Tooltip>
      <Button icon={<BookOutlined />} disabled={!activeConnId} onClick={() => setBookmarksOpen(true)}>
        书签
      </Button>
      <Tooltip title="最近 1 小时的增删改 SQL 记录">
        <Button icon={<FileTextOutlined />} disabled={!activeConnId} onClick={() => setSqlLogOpen(true)}>
          SQL 日志
        </Button>
      </Tooltip>
      <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
        设置
      </Button>
    </Space>
  )
}
