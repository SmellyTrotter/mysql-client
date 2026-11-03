import { useRef, useState } from 'react'
import { Alert, App as AntApp, Button, Input, Modal, Space, Table } from 'antd'
import { BookOutlined, CaretRightOutlined } from '@ant-design/icons'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { keymap } from '@codemirror/view'
import type { QueryResult } from '../../../shared/types'
import { api } from '../api'
import { useAppStore, type TabItem } from '../store/appStore'

export default function SqlQueryView({ tab }: { tab: TabItem }) {
  const { message } = AntApp.useApp()
  const reloadBookmarks = useAppStore((s) => s.reloadBookmarks)
  const [sqlText, setSqlText] = useState(tab.initialSql ?? '')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [bookmarkOpen, setBookmarkOpen] = useState(false)
  const [bookmarkName, setBookmarkName] = useState('')
  const runRef = useRef<() => void>(() => undefined)
  const [editorExtensions] = useState(() => [
    sql(),
    keymap.of([{ key: 'Mod-Enter', run: () => (runRef.current(), true) }])
  ])

  async function run() {
    const text = sqlText.trim()
    if (!text) return
    setRunning(true)
    setError(null)
    try {
      const r = await api.query.run(tab.connId, text)
      setResult(r)
    } catch (err) {
      setError((err as Error).message)
      setResult(null)
    } finally {
      setRunning(false)
    }
  }
  runRef.current = () => void run()

  async function saveBookmark() {
    if (!bookmarkName.trim()) return
    await api.bookmarks.create({ connId: tab.connId, type: 'sql', name: bookmarkName.trim(), content: sqlText })
    await reloadBookmarks()
    setBookmarkOpen(false)
    setBookmarkName('')
    void message.success('已加入书签')
  }

  const columns = (result?.fields ?? []).map((f) => ({
    title: f,
    dataIndex: f,
    key: f,
    render: (v: unknown) => (
      <div className={`grid-cell ${v === null || v === undefined ? 'grid-cell-null' : ''}`}>
        {v === null || v === undefined ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
      </div>
    )
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: '8px 12px' }}>
      <div className="editor-container">
        <CodeMirror
          value={sqlText}
          height="140px"
          extensions={editorExtensions}
          onChange={setSqlText}
          placeholder={`-- 输入 SQL，⌘+Enter 运行（当前库：${tab.schema}）`}
          basicSetup={{ lineNumbers: true, autocompletion: true }}
        />
      </div>
      <Space>
        <Button type="primary" icon={<CaretRightOutlined />} loading={running} onClick={() => void run()}>
          运行 (⌘+Enter)
        </Button>
        <Button icon={<BookOutlined />} disabled={!sqlText.trim()} onClick={() => setBookmarkOpen(true)}>
          收藏为书签
        </Button>
        {result && (
          <span style={{ color: '#999', fontSize: 12 }}>
            {result.affectedRows !== undefined
              ? `影响行数 ${result.affectedRows}`
              : `返回 ${result.rows.length} 行`}{' '}
            · {result.elapsedMs} ms
          </span>
        )}
      </Space>
      {error && <Alert type="error" message={error} showIcon />}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {result && result.fields.length > 0 && (
          <Table
            size="small"
            dataSource={result.rows}
            columns={columns}
            rowKey={(_r, i) => String(i ?? 0)}
            pagination={false}
            scroll={{ x: 'max-content', y: 'calc(100vh - 380px)' }}
          />
        )}
      </div>

      <Modal
        title="收藏为书签"
        open={bookmarkOpen}
        onCancel={() => setBookmarkOpen(false)}
        onOk={() => void saveBookmark()}
      >
        <Input
          placeholder="书签名，例如：查最近 100 笔订单"
          value={bookmarkName}
          onChange={(e) => setBookmarkName(e.target.value)}
        />
      </Modal>
    </div>
  )
}
