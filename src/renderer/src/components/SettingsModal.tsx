import { Form, InputNumber, Modal } from 'antd'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

const THEME_PRESETS = [
  { name: '默认蓝', color: '#1677ff' },
  { name: '葡萄紫', color: '#722ed1' },
  { name: '翡翠绿', color: '#52a132' },
  { name: '活力橙', color: '#fa8c16' },
  { name: '胭脂红', color: '#e5484d' },
  { name: '青碧', color: '#0d9aa8' }
]

export default function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const themeColor = useUiStore((s) => s.themeColor)
  const setThemeColor = useUiStore((s) => s.setThemeColor)
  const maxTabs = useAppStore((s) => s.maxTabs)
  const setMaxTabs = useAppStore((s) => s.setMaxTabs)

  return (
    <Modal title="设置" open={open} onCancel={() => setOpen(false)} footer={null} width={400}>
      <Form layout="vertical">
        <Form.Item label="主题色">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {THEME_PRESETS.map((p) => {
              const active = themeColor === p.color
              return (
                <div
                  key={p.color}
                  onClick={() => setThemeColor(p.color)}
                  title={p.name}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: p.color,
                    cursor: 'pointer',
                    border: active ? '2px solid #171717' : '2px solid transparent',
                    boxShadow: active ? `0 0 0 2px ${p.color}55` : 'none',
                    transition: 'transform 0.1s'
                  }}
                />
              )
            })}
          </div>
        </Form.Item>
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
