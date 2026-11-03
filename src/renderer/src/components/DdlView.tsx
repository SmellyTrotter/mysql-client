import { useEffect, useState } from 'react'
import { Alert, App as AntApp, Button, Spin } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { api } from '../api'
import type { TabItem } from '../store/appStore'

export default function DdlView({ tab }: { tab: TabItem }) {
  const { message } = AntApp.useApp()
  const [ddl, setDdl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!tab.table) return
    setLoading(true)
    setError(null)
    try {
      setDdl(await api.table.ddl(tab.connId, tab.schema, tab.table))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.connId, tab.schema, tab.table])

  if (error) return <Alert type="error" message="加载 DDL 失败" description={error} showIcon style={{ margin: 24 }} />
  if (!ddl && loading) return <Spin style={{ margin: '60px auto' }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: '8px 12px' }}>
      <div>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} style={{ marginRight: 8 }}>
          刷新
        </Button>
        <Button
          size="small"
          icon={<CopyOutlined />}
          onClick={() => {
            void navigator.clipboard.writeText(ddl ?? '')
            void message.success('DDL 已复制')
          }}
        >
          复制
        </Button>
      </div>
      <div className="editor-container" style={{ flex: 1, overflow: 'auto' }}>
        <CodeMirror value={ddl ?? ''} extensions={[sql()]} editable={false} basicSetup={{ lineNumbers: true }} />
      </div>
    </div>
  )
}
