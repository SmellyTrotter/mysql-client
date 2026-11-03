import { useEffect, useState } from 'react'
import { App as AntApp, Button, Checkbox, Input, Modal, Space, Tag as AntTag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

const TAG_COLORS = ['purple', 'blue', 'green', 'orange', 'red', 'cyan', 'magenta']

export default function TagManager() {
  const { message } = AntApp.useApp()
  const target = useUiStore((s) => s.tagTarget)
  const close = useUiStore((s) => s.closeTagManager)
  const activeConnId = useAppStore((s) => s.activeConnId)
  const tags = useAppStore((s) => s.tags)
  const tableTags = useAppStore((s) => s.tableTags)
  const reloadTags = useAppStore((s) => s.reloadTags)
  const [newTagName, setNewTagName] = useState('')

  const targetKey = target ? `${target.schema}.${target.table}` : null
  const assignedIds = new Set((targetKey ? tableTags[targetKey] : []).map((t) => t.id))

  useEffect(() => {
    if (target) setNewTagName('')
  }, [target])

  async function toggle(tagId: number, checked: boolean) {
    if (!activeConnId || !target) return
    try {
      if (checked) await api.tags.assign(activeConnId, target.schema, target.table, tagId)
      else await api.tags.unassign(activeConnId, target.schema, target.table, tagId)
      await reloadTags()
    } catch (err) {
      void message.error((err as Error).message)
    }
  }

  async function createTag() {
    const name = newTagName.trim()
    if (!name) return
    try {
      const color = TAG_COLORS[tags.length % TAG_COLORS.length]
      const tag = await api.tags.create(name, color)
      await reloadTags()
      setNewTagName('')
      if (activeConnId && target) {
        await api.tags.assign(activeConnId, target.schema, target.table, tag.id)
        await reloadTags()
      }
    } catch (err) {
      void message.error((err as Error).message)
    }
  }

  return (
    <Modal
      title={target ? `管理标签：${target.schema}.${target.table}` : '管理标签'}
      open={!!target}
      onCancel={close}
      footer={<Button onClick={close}>完成</Button>}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {tags.length === 0 && <span style={{ color: '#999' }}>还没有标签，先创建一个。</span>}
        {tags.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Checkbox checked={assignedIds.has(t.id)} onChange={(e) => void toggle(t.id, e.target.checked)}>
              <AntTag color={t.color}>{t.name}</AntTag>
            </Checkbox>
            <a
              style={{ marginLeft: 'auto', fontSize: 12, color: '#ff4d4f' }}
              onClick={async () => {
                await api.tags.remove(t.id)
                await reloadTags()
              }}
            >
              删除标签
            </a>
          </div>
        ))}
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="新标签名，如：核心表 / 需关注"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onPressEnter={() => void createTag()}
          />
          <Button icon={<PlusOutlined />} onClick={() => void createTag()}>
            创建并贴上
          </Button>
        </Space.Compact>
        <span style={{ color: '#999', fontSize: 12 }}>
          提示：给分表逻辑组（如 order_*）打标签，整组生效。
        </span>
      </Space>
    </Modal>
  )
}
