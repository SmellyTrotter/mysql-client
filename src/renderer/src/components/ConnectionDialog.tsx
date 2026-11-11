import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  App as AntApp,
  Tooltip
} from 'antd'
import type { ConnectionInput } from '../../../shared/types'
import { api } from '../api'
import { CONNECTION_COLORS, autoConnectionColor } from '../connectionColors'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

const DEFAULT_VALUES: ConnectionInput = {
  name: '',
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: '',
  schemaScope: '',
  tableScope: '',
  color: '#1677ff'
}

function ColorSwatches({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <Space size={6} wrap>
      {CONNECTION_COLORS.map((c) => (
        <Tooltip title={c} key={c}>
          <div
            role="button"
            aria-label={`标识色 ${c}`}
            onClick={() => onChange?.(c)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: c,
              cursor: 'pointer',
              border: `2px solid ${value === c ? 'var(--app-text)' : 'transparent'}`,
              boxShadow: value === c ? `0 0 0 2px ${c}66` : 'none'
            }}
          />
        </Tooltip>
      ))}
    </Space>
  )
}

/** 范围输入用逗号分隔的字符串存储，Form 内部用 tag 数组编辑 */
const scopeFormProps = {
  normalize: (v: string[]) => v.join(', '),
  getValueProps: (v?: string) => ({ value: v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [] })
}

export default function ConnectionDialog() {
  const { message } = AntApp.useApp()
  const { open, editId } = useUiStore((s) => s.connectionDialog)
  const close = useUiStore((s) => s.closeConnectionDialog)
  const connections = useAppStore((s) => s.connections)
  const saveConnection = useAppStore((s) => s.saveConnection)
  const [form] = Form.useForm<ConnectionInput>()
  const [saving, setSaving] = useState(false)
  const [schemaOptions, setSchemaOptions] = useState<string[]>([])

  const editing = editId ? connections.find((c) => c.id === editId) : undefined
  // 用 initialValues 初始化 + key 强制重挂载，避免 setFieldsValue 在未挂载表单上丢失
  const initialValues: ConnectionInput = editing
    ? {
        name: editing.name,
        host: editing.host,
        port: editing.port,
        user: editing.user,
        database: editing.database ?? '',
        password: '',
        schemaScope: editing.schemaScope ?? '',
        tableScope: editing.tableScope ?? '',
        color: editing.color ?? autoConnectionColor(editing.id),
        groupName: editing.groupName
      }
    : { ...DEFAULT_VALUES, color: CONNECTION_COLORS[connections.length % CONNECTION_COLORS.length] }

  // 编辑态下拉出该实例真实的库名，新建态还没有连接可查，允许直接手输
  useEffect(() => {
    if (!open || !editId) {
      setSchemaOptions([])
      return
    }
    let cancelled = false
    void api.metadata
      .serverSchemas(editId)
      .then((list) => !cancelled && setSchemaOptions(list))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, editId])

  const watchedHost = Form.useWatch('host', form)
  const watchedPort = Form.useWatch('port', form)
  const watchedUser = Form.useWatch('user', form)
  const watchedSchemaScope = Form.useWatch('schemaScope', form)
  const watchedTableScope = Form.useWatch('tableScope', form)

  const duplicate = connections.find(
    (c) =>
      c.id !== editId &&
      c.host === watchedHost &&
      Number(c.port) === Number(watchedPort) &&
      c.user === watchedUser
  )
  const sameScope =
    duplicate &&
    (duplicate.schemaScope ?? '') === (watchedSchemaScope ?? '') &&
    (duplicate.tableScope ?? '') === (watchedTableScope ?? '')

  const handleTest = async () => {
    const values = await form.validateFields()
    try {
      await api.connections.test(values)
      void message.success('连接成功')
    } catch (err) {
      void message.error(`连接失败: ${(err as Error).message}`)
    }
  }

  const handleSave = async () => {
    if (saving) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      await saveConnection(
        { ...values, groupName: editing?.groupName, name: values.name.trim() },
        editId
      )
      close()
      void message.success('已保存，正在刷新该连接的库表')
    } catch (err) {
      void message.error(`保存失败: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editId ? '编辑连接' : '新建连接'}
      open={open}
      onCancel={close}
      destroyOnHidden
      width={520}
      footer={
        <Space>
          <Button onClick={handleTest} disabled={saving}>测试连接</Button>
          <Button onClick={close}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form
        key={editId ?? 'new'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
      >
        {sameScope && duplicate && (
          <Form.Item>
            <Alert
              type="warning"
              showIcon
              message={`与连接「${duplicate.name}」指向同一个 MySQL 实例`}
              description="两个连接会看到完全相同的库表。请确认主机/端口是否填对；若本来就是同一实例的不同视角，在下方分别设置「库范围」或「表范围」即可区分。"
            />
          </Form.Item>
        )}
        <Form.Item name="name" label="连接名" rules={[{ required: true, message: '请输入连接名' }]}>
          <Input placeholder="例如：本地开发库" />
        </Form.Item>
        <Space.Compact block>
          <Form.Item name="host" label="主机" style={{ width: '70%' }} rules={[{ required: true, message: '请输入主机' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="port" label="端口" style={{ width: '30%' }} rules={[{ required: true, message: '请输入端口' }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
        </Space.Compact>
        <Form.Item name="user" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label="密码"
          extra={editId ? '留空表示不修改密码。密码加密存储在系统钥匙串，不落明文。' : '密码加密存储在系统钥匙串，不落明文。'}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="database" label="默认数据库（可选）">
          <Input placeholder="连接后默认使用的库" />
        </Form.Item>

        <Form.Item
          name="schemaScope"
          label="库范围（可选）"
          {...scopeFormProps}
          extra="留空 = 显示该实例上全部可见库。多个库用逗号分隔，支持 * 通配，例如 gifshow, order_*"
        >
          <Select
            mode="tags"
            tokenSeparators={[',', '，', ' ']}
            placeholder="留空显示全部库"
            options={schemaOptions.map((s) => ({ value: s, label: s }))}
          />
        </Form.Item>
        <Form.Item
          name="tableScope"
          label="表范围（可选）"
          {...scopeFormProps}
          extra="留空 = 全部表。不带 * 时按前缀匹配，例如 crm_*、onion_* 可以让同实例的两个连接各看各的表"
        >
          <Select
            mode="tags"
            tokenSeparators={[',', '，', ' ']}
            placeholder="留空显示全部表"
          />
        </Form.Item>
        <Form.Item name="color" label="标识色" extra="显示在左侧树连接名前，用于快速区分多条连接">
          <ColorSwatches />
        </Form.Item>
      </Form>
    </Modal>
  )
}
