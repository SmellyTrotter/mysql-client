import { useEffect } from 'react'
import { Form, Input, InputNumber, Modal, Button, Space, App as AntApp } from 'antd'
import type { ConnectionInput } from '../../../shared/types'
import { api } from '../api'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

export default function ConnectionDialog() {
  const { message } = AntApp.useApp()
  const { open, editId } = useUiStore((s) => s.connectionDialog)
  const close = useUiStore((s) => s.closeConnectionDialog)
  const connections = useAppStore((s) => s.connections)
  const saveConnection = useAppStore((s) => s.saveConnection)
  const [form] = Form.useForm<ConnectionInput>()

  useEffect(() => {
    if (!open) return
    const editing = editId ? connections.find((c) => c.id === editId) : undefined
    form.setFieldsValue(
      editing
        ? { name: editing.name, host: editing.host, port: editing.port, user: editing.user, database: editing.database, password: '' }
        : { name: '', host: '127.0.0.1', port: 3306, user: 'root', password: '', database: '' }
    )
  }, [open, editId, connections, form])

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
    const values = await form.validateFields()
    try {
      await saveConnection(values, editId)
      close()
      void message.success('已保存')
    } catch (err) {
      void message.error(`保存失败: ${(err as Error).message}`)
    }
  }

  return (
    <Modal
      title={editId ? '编辑连接' : '新建连接'}
      open={open}
      onCancel={close}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={handleTest}>测试连接</Button>
          <Button onClick={close}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" preserve={false}>
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
      </Form>
    </Modal>
  )
}
