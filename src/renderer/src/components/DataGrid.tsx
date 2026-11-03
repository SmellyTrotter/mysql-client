import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Menu,
  Modal,
  Space,
  Table,
  Tooltip,
  Typography
} from 'antd'
import type { TableProps } from 'antd'
import {
  CodeOutlined,
  DeleteOutlined,
  ExpandOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import type { ColumnInfo, SortSpec, TableDataResult } from '../../../shared/types'
import { api } from '../api'
import { useAppStore, type TabItem } from '../store/appStore'

import { parseTimestamp, prettyJson } from '../../../shared/format'

/** 按列类型返回着色 class */
function cellTypeClass(colType: string): string {
  const t = colType.toLowerCase()
  if (/^tinyint\(1\)/.test(t)) return 'cell-bool'
  if (/int|decimal|double|float|numeric|real|year/.test(t)) return 'cell-num'
  if (/date|time/.test(t)) return 'cell-dt'
  if (/json/.test(t)) return 'cell-json'
  if (/enum|set/.test(t)) return 'cell-enum'
  return ''
}

function formatCell(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function DataGrid({ tab }: { tab: TabItem }) {
  const { message, modal } = AntApp.useApp()
  const openDdl = useAppStore((s) => s.openDdl)
  const [data, setData] = useState<TableDataResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => useAppStore.getState().tablePageSize)
  const [sort, setSort] = useState<SortSpec | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ rowIdx: number; column: string } | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [insertOpen, setInsertOpen] = useState(false)
  const [insertForm] = Form.useForm()
  const [inspectRow, setInspectRow] = useState<Record<string, unknown> | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string | null>>({})
  const [saving, setSaving] = useState(false)
  /** 单元格右键菜单（全表共用一个，避免每格挂 Dropdown 的性能问题） */
  const [cellMenu, setCellMenu] = useState<{
    x: number
    y: number
    row: Record<string, unknown>
    text: string | null
  } | null>(null)

  const { connId, schema, table } = tab
  const pkColumns = useMemo(
    () => (data?.columns ?? []).filter((c) => c.isPrimary).map((c) => c.name),
    [data]
  )

  const load = useCallback(async () => {
    if (!table) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.table.data(connId, schema, table, page, pageSize, sort)
      setData(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [connId, schema, table, page, pageSize, sort])

  useEffect(() => {
    void load()
  }, [load])

  function pkValues(row: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(pkColumns.map((c) => [c, row[c]]))
  }

  /** 打开行详情抽屉，初始化编辑草稿 */
  function openDetail(row: Record<string, unknown>) {
    const d: Record<string, string | null> = {}
    for (const c of data?.columns ?? []) d[c.name] = formatCell(row[c.name])
    setDrafts(d)
    setInspectRow(row)
  }

  const changedFields = useMemo(() => {
    if (!inspectRow) return []
    return (data?.columns ?? [])
      .map((c) => c.name)
      .filter((name) => drafts[name] !== formatCell(inspectRow[name]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, inspectRow, data])

  async function saveDetail() {
    if (!table || !inspectRow || changedFields.length === 0) return
    setSaving(true)
    try {
      const changes = Object.fromEntries(changedFields.map((f) => [f, drafts[f]]))
      await api.table.update(connId, schema, table, pkValues(inspectRow), changes)
      void message.success(`已保存 ${changedFields.length} 个字段`)
      setInspectRow(null)
      void load()
    } catch (err) {
      void message.error(`保存失败: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveCell(row: Record<string, unknown>, column: string, raw: string) {
    if (!table) return
    const oldValue = formatCell(row[column])
    const newValue = raw === '' ? null : raw
    if (oldValue === raw || (oldValue === null && raw === '')) {
      setEditing(null)
      return
    }
    try {
      await api.table.update(connId, schema, table, pkValues(row), { [column]: newValue })
      void message.success('已更新')
      setEditing(null)
      void load()
    } catch (err) {
      void message.error(`更新失败: ${(err as Error).message}`)
    }
  }

  async function deleteSelected() {
    if (!table || !data) return
    const rows = selectedRowKeys.map((k) => data.rows[Number(k)]).filter(Boolean)
    if (rows.length === 0) return
    modal.confirm({
      title: `删除 ${rows.length} 行？`,
      content: '该操作直接执行 DELETE，不可撤销。',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          for (const row of rows) {
            await api.table.remove(connId, schema, table, pkValues(row))
          }
          void message.success('已删除')
          setSelectedRowKeys([])
          void load()
        } catch (err) {
          void message.error(`删除失败: ${(err as Error).message}`)
        }
      }
    })
  }

  async function submitInsert() {
    if (!table) return
    const values = await insertForm.validateFields()
    const cleaned = Object.fromEntries(
      Object.entries(values as Record<string, string>).filter(([, v]) => v !== undefined && v !== '')
    )
    try {
      await api.table.insert(connId, schema, table, cleaned)
      void message.success('已插入')
      setInsertOpen(false)
      insertForm.resetFields()
      void load()
    } catch (err) {
      void message.error(`插入失败: ${(err as Error).message}`)
    }
  }

  const columns = useMemo(() => {
    const detailColumn = {
      title: '',
      key: '__detail__',
      width: 40,
      fixed: 'left' as const,
      render: (_: unknown, row: Record<string, unknown>) => (
        <Tooltip title="查看/编辑整行">
          <Button type="text" size="small" icon={<ExpandOutlined />} onClick={() => openDetail(row)} />
        </Tooltip>
      )
    }
    const dataColumns = (data?.columns ?? []).map((col: ColumnInfo) => ({
      title: (
        <Tooltip title={`${col.type}${col.comment ? ` · ${col.comment}` : ''}`}>
          <span>
            {col.name}
            {col.isPrimary && <span style={{ color: '#faad14' }}> 🔑</span>}
          </span>
        </Tooltip>
      ),
      dataIndex: col.name,
      key: col.name,
      sorter: true,
      sortOrder: sort?.column === col.name ? (sort.direction === 'asc' ? ('ascend' as const) : ('descend' as const)) : null,
      render: (value: unknown, row: Record<string, unknown>, rowIdx: number) => {
        const text = formatCell(value)
        const isEditing = editing?.rowIdx === rowIdx && editing.column === col.name
        return (
          <div
            className={`grid-cell ${text === null ? 'grid-cell-null' : cellTypeClass(col.type)}`}
            style={{ position: 'relative' }}
            onDoubleClick={() => {
              if (!data?.readonly) setEditing({ rowIdx, column: col.name })
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setCellMenu({ x: e.clientX, y: e.clientY, row, text })
            }}
          >
            {/* 底层文字始终渲染以维持列宽，编辑框绝对定位覆盖其上 */}
            {text ?? 'NULL'}
            {isEditing && (
              <Input
                size="small"
                autoFocus
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                  fontSize: 12,
                  padding: '0 4px',
                  boxSizing: 'border-box',
                  zIndex: 2
                }}
                defaultValue={text ?? ''}
                onBlur={(e) => void saveCell(row, col.name, e.target.value)}
                onPressEnter={(e) => void saveCell(row, col.name, (e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
              />
            )}
          </div>
        )
      }
    }))
    return [detailColumn, ...dataColumns]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, editing, sort, pkColumns])

  const onTableChange: TableProps<Record<string, unknown>>['onChange'] = (pagination, _filters, sorter) => {
    setPage(pagination.current ?? 1)
    const nextSize = pagination.pageSize ?? 100
    setPageSize(nextSize)
    useAppStore.getState().setTablePageSize(nextSize)
    const s = Array.isArray(sorter) ? sorter[0] : sorter
    if (s?.order && s.columnKey) {
      setSort({ column: String(s.columnKey), direction: s.order === 'ascend' ? 'asc' : 'desc' })
    } else {
      setSort(undefined)
    }
  }

  if (error) return <Alert type="error" message="加载失败" description={error} showIcon style={{ margin: 24 }} />

  return (
    <>
      <div className="grid-toolbar">
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <Button size="small" type="primary" icon={<PlusOutlined />} disabled={data?.readonly} onClick={() => setInsertOpen(true)}>
          新增行
        </Button>
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          disabled={data?.readonly || selectedRowKeys.length === 0}
          onClick={() => void deleteSelected()}
        >
          删除选中
        </Button>
        <Button size="small" icon={<CodeOutlined />} onClick={() => table && openDdl(schema, table)}>
          查看 DDL
        </Button>
        {data?.readonly && (
          <Alert type="warning" showIcon message="此表无主键，已切换为只读模式" style={{ padding: '0 8px' }} />
        )}
        <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>
          共 {data?.total ?? '-'} 行 · 双击单元格编辑
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
        <Table<Record<string, unknown>>
          size="small"
          loading={loading}
          dataSource={data?.rows ?? []}
          columns={columns}
          rowKey={(_row, index) => String(index ?? 0)}
          rowSelection={
            data?.readonly
              ? undefined
              : { selectedRowKeys, onChange: setSelectedRowKeys, columnWidth: 36 }
          }
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [50, 100, 200, 500],
            showTotal: (t) => `共 ${t} 行`
          }}
          onChange={onTableChange}
          scroll={{ x: 'max-content', y: 'calc(100vh - 240px)' }}
        />
      </div>

      {/* 全表共用的单元格右键菜单 */}
      {cellMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
            onClick={() => setCellMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setCellMenu(null)
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: Math.min(cellMenu.x, window.innerWidth - 240),
              top: Math.min(cellMenu.y, window.innerHeight - 140),
              zIndex: 101,
              background: '#fff',
              borderRadius: 8,
              boxShadow: '0 6px 16px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              minWidth: 180
            }}
          >
            <Menu
              selectable={false}
              onClick={({ key }) => {
                const { row, text } = cellMenu
                const ts = text ? parseTimestamp(text) : null
                if (key === 'copy' && text !== null) {
                  void navigator.clipboard.writeText(text)
                  void message.success('已复制')
                }
                if (key === 'ts' && ts) {
                  void navigator.clipboard.writeText(ts)
                  void message.success('已复制时间格式')
                }
                if (key === 'detail') openDetail(row)
                setCellMenu(null)
              }}
              items={[
                { key: 'copy', label: '复制值', disabled: cellMenu.text === null },
                ...(cellMenu.text && parseTimestamp(cellMenu.text)
                  ? [{ key: 'ts', label: `复制为时间：${parseTimestamp(cellMenu.text)}` }]
                  : []),
                { key: 'detail', label: '查看整行详情' }
              ]}
            />
          </div>
        </>
      )}

      <Drawer
        title={`行详情 · ${schema}.${table}`}
        open={!!inspectRow}
        onClose={() => setInspectRow(null)}
        width={480}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            {data?.readonly && <Alert type="warning" showIcon message="无主键，只读" style={{ padding: '0 8px', marginRight: 'auto' }} />}
            <Button onClick={() => setInspectRow(null)}>取消</Button>
            <Button
              type="primary"
              loading={saving}
              disabled={data?.readonly || changedFields.length === 0}
              onClick={() => void saveDetail()}
            >
              保存修改{changedFields.length > 0 ? `（${changedFields.length}）` : ''}
            </Button>
          </Space>
        }
      >
        {inspectRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(data?.columns ?? []).map((col) => {
              const value = drafts[col.name]
              const isNull = value === null
              const ts = !isNull && value ? parseTimestamp(value) : null
              const looksJson = !isNull && value ? prettyJson(value) !== value : false
              const changed = changedFields.includes(col.name)
              return (
                <div key={col.name}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {col.name} <span style={{ color: '#ccc' }}>{col.type}</span>
                    </Typography.Text>
                    {changed && <Typography.Text style={{ fontSize: 11, color: '#fa8c16' }}>已修改</Typography.Text>}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                      {looksJson && (
                        <a
                          style={{ fontSize: 11 }}
                          onClick={() => setDrafts((d) => ({ ...d, [col.name]: prettyJson(d[col.name] ?? '') }))}
                        >
                          格式化 JSON
                        </a>
                      )}
                      {col.nullable && (
                        <a
                          style={{ fontSize: 11 }}
                          onClick={() => setDrafts((d) => ({ ...d, [col.name]: isNull ? '' : null }))}
                        >
                          {isNull ? '取消 NULL' : '设为 NULL'}
                        </a>
                      )}
                    </span>
                  </div>
                  <Input.TextArea
                    value={value ?? ''}
                    disabled={isNull}
                    placeholder={isNull ? 'NULL' : ''}
                    autoSize={{ minRows: 1, maxRows: 12 }}
                    style={{
                      fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                      fontSize: 12,
                      background: isNull ? '#f5f5f5' : undefined
                    }}
                    onChange={(e) => setDrafts((d) => ({ ...d, [col.name]: e.target.value }))}
                  />
                  {ts && (
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      时间戳 → {ts}
                    </Typography.Text>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Drawer>

      <Modal
        title={`向 ${schema}.${table} 插入一行`}
        open={insertOpen}
        onCancel={() => setInsertOpen(false)}
        onOk={() => void submitInsert()}
        width={640}
      >
        <Form form={insertForm} layout="vertical">
          {(data?.columns ?? []).map((col) => (
            <Form.Item
              key={col.name}
              name={col.name}
              label={`${col.name} (${col.type})${col.isAutoIncrement ? ' · 自增可留空' : ''}`}
            >
              <Input placeholder={col.nullable || col.isAutoIncrement ? '留空 = 默认值/NULL' : ''} />
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </>
  )
}
