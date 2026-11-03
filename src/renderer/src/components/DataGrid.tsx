import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  App as AntApp,
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tooltip
} from 'antd'
import type { TableProps } from 'antd'
import {
  CodeOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import type { ColumnInfo, SortSpec, TableDataResult } from '../../../shared/types'
import { api } from '../api'
import { useAppStore, type TabItem } from '../store/appStore'

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
  const [pageSize, setPageSize] = useState(100)
  const [sort, setSort] = useState<SortSpec | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ rowIdx: number; column: string } | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [insertOpen, setInsertOpen] = useState(false)
  const [insertForm] = Form.useForm()

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
    return (data?.columns ?? []).map((col: ColumnInfo) => ({
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
        if (isEditing) {
          return (
            <Input
              size="small"
              autoFocus
              defaultValue={text ?? ''}
              onBlur={(e) => void saveCell(row, col.name, e.target.value)}
              onPressEnter={(e) => void saveCell(row, col.name, (e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
            />
          )
        }
        return (
          <div
            className={`grid-cell ${text === null ? 'grid-cell-null' : ''}`}
            onDoubleClick={() => {
              if (!data?.readonly) setEditing({ rowIdx, column: col.name })
            }}
          >
            {text ?? 'NULL'}
          </div>
        )
      }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, editing, sort, pkColumns])

  const onTableChange: TableProps<Record<string, unknown>>['onChange'] = (pagination, _filters, sorter) => {
    setPage(pagination.current ?? 1)
    setPageSize(pagination.pageSize ?? 100)
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
