import {
  Button,
  ColorPicker,
  Form,
  InputNumber,
  Modal,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import type { AccentStrength, Appearance } from '../theme'
import { ALL_THEME_COLORS, THEME_GROUPS, normalizeHex } from '../theme'
import { useAppStore } from '../store/appStore'
import { useUiStore } from '../store/uiStore'

const APPEARANCE_OPTIONS: { label: string; value: Appearance }[] = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'system' }
]

const STRENGTH_OPTIONS: { label: string; value: AccentStrength }[] = [
  { label: '淡雅', value: 'soft' },
  { label: '标准', value: 'normal' },
  { label: '浓郁', value: 'vivid' }
]

export default function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const themeColor = useUiStore((s) => s.themeColor)
  const setThemeColor = useUiStore((s) => s.setThemeColor)
  const appearance = useUiStore((s) => s.appearance)
  const setAppearance = useUiStore((s) => s.setAppearance)
  const accentStrength = useUiStore((s) => s.accentStrength)
  const setAccentStrength = useUiStore((s) => s.setAccentStrength)
  const maxTabs = useAppStore((s) => s.maxTabs)
  const setMaxTabs = useAppStore((s) => s.setMaxTabs)

  return (
    <Modal title="外观设置" open={open} onCancel={() => setOpen(false)} footer={null} width={520}>
      <Form layout="vertical">
        <Form.Item label="外观模式" extra="深色模式下顶栏、侧栏、表格、编辑器、弹窗与浮层会一起切换">
          <Segmented
            block
            options={APPEARANCE_OPTIONS}
            value={appearance}
            onChange={(v) => setAppearance(v as Appearance)}
          />
        </Form.Item>

        <Form.Item label="主题色" extra="18 组预设，也可以用取色器自定义任意颜色，修改即时生效">
          {THEME_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="theme-group-label">{group.label}</div>
              <Space size={8} wrap>
                {group.presets.map((p) => {
                  const active = themeColor.toLowerCase() === p.color
                  return (
                    <Tooltip title={p.name} key={p.color}>
                      <div
                        role="button"
                        aria-label={`主题色 ${p.name}`}
                        className={`theme-swatch ${active ? 'active' : ''}`}
                        style={{ background: p.color }}
                        onClick={() => setThemeColor(p.color)}
                      >
                        {active && <CheckOutlined />}
                      </div>
                    </Tooltip>
                  )
                })}
              </Space>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <ColorPicker
              value={themeColor}
              showText
              presets={[{ label: '预设色', colors: ALL_THEME_COLORS }]}
              onChangeComplete={(c) => setThemeColor(normalizeHex(c.toHexString()))}
            />
          </div>
        </Form.Item>

        <Form.Item
          label="着色强度"
          extra="控制主题色渗入背景 / 边框 / 表头 / 树节点 / 标签页的浓度，浓郁档整片界面都会染色"
        >
          <Segmented
            block
            options={STRENGTH_OPTIONS}
            value={accentStrength}
            onChange={(v) => setAccentStrength(v as AccentStrength)}
          />
        </Form.Item>

        <Form.Item label="实时预览">
          <div className="theme-preview">
            <div className="theme-preview-bar">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--app-primary)' }} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>MySQL Client</span>
              <Button size="small" type="primary" style={{ marginLeft: 'auto', height: 20, fontSize: 10 }}>
                新建连接
              </Button>
            </div>
            <div className="theme-preview-body">
              <div className="theme-preview-side">
                <div className="theme-preview-row active">● crm</div>
                <div className="theme-preview-row">› gifshow</div>
                <div className="theme-preview-row">&nbsp;&nbsp;crm_order_*</div>
              </div>
              <div className="theme-preview-main">
                <div className="theme-preview-chips">
                  <span className="theme-preview-chip active">crm_order_0</span>
                  <span className="theme-preview-chip">DDL</span>
                </div>
                <div className="theme-preview-table-head">id · status · create_time</div>
                <div className="theme-preview-table-row">123999 · PENDING · 17:42</div>
                <Space size={4} style={{ marginTop: 8 }}>
                  <Tag color="blue">标签</Tag>
                  <Typography.Text style={{ fontSize: 11, color: 'var(--app-primary-text)' }}>
                    排序: create_time ↓
                  </Typography.Text>
                </Space>
              </div>
            </div>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            主题色已作用于：按钮 / 输入框 / 下拉 / 表格表头与悬停行 / 树节点与图标 / 标签页 / 菜单 / 分页 /
            弹窗抽屉标题 / 编辑器选区 / 滚动条 / 顶栏与侧栏 / 单元格类型色。
          </Typography.Text>
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
