import { Form, InputNumber, Modal } from 'antd'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

export default function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const maxTabs = useAppStore((s) => s.maxTabs)
  const setMaxTabs = useAppStore((s) => s.setMaxTabs)

  return (
    <Modal title="设置" open={open} onCancel={() => setOpen(false)} footer={null} width={400}>
      <Form layout="vertical">
        <Form.Item
          label="最大标签页数量"
          extra="超出后自动关闭最久未使用的标签页（当前活动的除外），调小立即生效"
        >
          <InputNumber min={1} max={20} value={maxTabs} onChange={(v) => v && setMaxTabs(v)} style={{ width: 120 }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
