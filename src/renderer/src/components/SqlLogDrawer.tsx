import { useCallback, useEffect, useState } from 'react'
import { Drawer, Empty, List, Space, Tag as AntTag, Tooltip, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { SqlLogEntry } from '../../../shared/types'
import { api } from '../api'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  'grid-insert': { label: '新增', color: 'green' },
  'grid-update': { label: '更新', color: 'orange' },
  'grid-delete': { label: '删除', color: 'red' },
  query: { label: '查询窗口', color: 'blue' }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function SqlLogDrawer() {
  const open = useUiStore((s) => s.sqlLogOpen)
  const setOpen = useUiStore((s) => s.setSqlLogOpen)
  const connections = useAppStore((s) => s.connections)
  const [logs, setLogs] = useState<SqlLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setLogs(await api.logs.list())
    } finally {
      setLoading(false)
    }
  }, [])

  function connName(connId: string): string {
    return connections.find((c) => c.id === connId)?.name ?? connId
  }

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  return (
    <Drawer
      title={
        <Space>
          SQL 执行日志
          <Tooltip title="只记录写操作（增删改/DDL），保留最近 1 小时">
            <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
              保留最近 1 小时 · {logs.length} 条
            </Typography.Text>
          </Tooltip>
        </Space>
      }
      extra={<AntTag icon={<ReloadOutlined spin={loading} />} style={{ cursor: 'pointer' }} onClick={() => void load()}>刷新</AntTag>}
      open={open}
      onClose={() => setOpen(false)}
      width={520}
    >
      {logs.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无写操作记录" />
      ) : (
        <List
          dataSource={logs}
          renderItem={(entry) => {
            const source = SOURCE_LABEL[entry.source] ?? { label: entry.source, color: 'default' }
            return (
              <List.Item>
                <div style={{ width: '100%' }}>
                  <Space size={8} style={{ marginBottom: 4 }}>
                    <AntTag color={source.color}>{source.label}</AntTag>
                    <AntTag color="blue">{connName(entry.connId)}</AntTag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatTime(entry.createdAt)}
                    </Typography.Text>
                  </Space>
                  <Typography.Paragraph
                    copyable={{ text: entry.sql }}
                    style={{
                      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      background: 'var(--app-primary-bg-subtle)',
                      padding: 8,
                      borderRadius: 6,
                      marginBottom: 0
                    }}
                  >
                    {entry.sql}
                  </Typography.Paragraph>
                </div>
              </List.Item>
            )
          }}
        />
      )}
    </Drawer>
  )
}
