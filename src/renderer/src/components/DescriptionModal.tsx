import { useEffect, useState } from 'react'
import { App as AntApp, Button, Form, Input, Modal, Space, Typography } from 'antd'
import { api } from '../api'
import { useUiStore } from '../store/uiStore'

interface Fields {
  purpose: string
  scenarios: string
  content: string
}

const EMPTY: Fields = { purpose: '', scenarios: '', content: '' }

export default function DescriptionModal() {
  const { message } = AntApp.useApp()
  const target = useUiStore((s) => s.descriptionTarget)
  const close = useUiStore((s) => s.closeDescription)
  const reloadDescriptions = useUiStore((s) => s.reloadDescriptions)
  const [form] = Form.useForm<Fields>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!target) return
    form.setFieldsValue(EMPTY)
    void api.descriptions.get(target.connId, target.schema, target.tableGroup).then((d) => {
      if (d) form.setFieldsValue({ purpose: d.purpose, scenarios: d.scenarios, content: d.content })
    })
  }, [target, form])

  if (!target) return null

  async function save() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await api.descriptions.save(target!.connId, target!.schema, target!.tableGroup, values)
      await reloadDescriptions()
      message.success('表描述已保存，MCP 的 describe_table 会立即返回')
      close()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    await api.descriptions.remove(target!.connId, target!.schema, target!.tableGroup)
    await reloadDescriptions()
    message.success('已删除表描述')
    close()
  }

  return (
    <Modal
      title={`编辑表描述 · ${target.schema}.${target.tableGroup}`}
      open
      onCancel={close}
      width={620}
      footer={
        <Space>
          <Button onClick={remove}>删除描述</Button>
          <Button type="primary" loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        这三段内容会通过 MCP 的 list_tables / describe_table 返回给 AI，帮它理解「这张表是干什么的、什么时候用、里面存了什么」。
        分表组写一次即可作用于整组，不用逐张分表填。描述只存在本机 SQLite，不随代码仓库分发。
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item
          name="purpose"
          label="这张表是干什么的"
          rules={[{ required: true, whitespace: true, message: '至少写一句用途' }]}
        >
          <Input.TextArea rows={2} placeholder="例：记录线索从进入到归档的完整流转状态" />
        </Form.Item>
        <Form.Item name="scenarios" label="什么场景下会用到">
          <Input.TextArea rows={3} placeholder="例：排查线索状态卡住、统计各渠道转化、回溯某条线索的历史动作" />
        </Form.Item>
        <Form.Item name="content" label="表里存了什么">
          <Input.TextArea rows={3} placeholder="例：一行是一条线索的当前快照，含 clue_id、status、来源渠道、最近更新时间" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
