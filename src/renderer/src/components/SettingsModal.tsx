import {
  App as AntApp,
  Badge,
  Button,
  ColorPicker,
  Form,
  InputNumber,
  Modal,
  Segmented,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import { ApiOutlined, CheckOutlined, CopyOutlined, ReloadOutlined, SettingOutlined, SkinOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { api } from '../api'
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

interface McpState {
  enabled: boolean
  port: number
  sseUrl?: string
  streamableUrl?: string
  /** 旧版主进程只返回这一个字段，做兼容避免配置区空白 */
  url?: string
  token: string
  running: boolean
}

type McpTransport = 'streamable' | 'sse'

const MCP_TRANSPORT_OPTIONS: { label: string; value: McpTransport }[] = [
  { label: 'Streamable HTTP', value: 'streamable' },
  { label: 'SSE（兼容）', value: 'sse' }
]

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
  } else {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

export default function SettingsModal() {
  const { message } = AntApp.useApp()
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
  const [mcp, setMcp] = useState<McpState | null>(null)
  const [portDraft, setPortDraft] = useState<number | null>(null)
  const [transport, setTransport] = useState<McpTransport>('streamable')
  /** 主进程还是旧版（只有单个 url 字段）时为 true */
  const legacyMcp = !!mcp && !mcp.sseUrl && !mcp.streamableUrl && !!mcp.url

  const refreshMcp = () => {
    void api.mcp.status().then((s) => {
      const state = s as McpState
      setMcp(state)
      setPortDraft(s.port)
      if (!state.streamableUrl && state.url) setTransport('sse')
    })
  }
  useEffect(() => {
    if (open) refreshMcp()
  }, [open])

  const mcpUrl = mcp
    ? transport === 'streamable'
      ? mcp.streamableUrl ?? ''
      : mcp.sseUrl ?? mcp.url ?? ''
    : ''
  const mcpConfig = mcp
    ? JSON.stringify({ mcpServers: { 'mysql-client': { url: mcpUrl } } }, null, 2)
    : ''

  const appearanceTab = (
    <Form layout="vertical">
      <Form.Item label="外观模式" extra="深色模式下顶栏、侧栏、表格、编辑器、弹窗与浮层会一起切换">
        <Segmented block options={APPEARANCE_OPTIONS} value={appearance} onChange={(v) => setAppearance(v as Appearance)} />
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
        <Segmented block options={STRENGTH_OPTIONS} value={accentStrength} onChange={(v) => setAccentStrength(v as AccentStrength)} />
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
    </Form>
  )

  const mcpTab = (
    <Form layout="vertical">
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
        让本地 agent 直接查询这台机器上的连接。两种协议同时提供，只监听 127.0.0.1，token 与 Host 双重校验。
      </Typography.Paragraph>

      <Space direction="horizontal" size={10} style={{ marginBottom: 12 }}>
        <Switch checked={mcp?.enabled ?? false} onChange={(v) => void api.mcp.setEnabled(v).then(refreshMcp)} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {mcp?.enabled ? '已开启，客户端运行时可提供 MCP 服务' : '已关闭'}
        </Typography.Text>
      </Space>

      <Space size={8} align="center" style={{ marginBottom: 14 }}>
        <Typography.Text style={{ fontSize: 12 }}>端口</Typography.Text>
        <InputNumber
          min={1024}
          max={65535}
          value={portDraft ?? mcp?.port ?? 37812}
          onChange={(v) => setPortDraft(v)}
          style={{ width: 100 }}
        />
        <Button
          size="small"
          disabled={!portDraft || portDraft === mcp?.port}
          onClick={() => {
            if (portDraft) void api.mcp.setPort(portDraft).then(refreshMcp)
          }}
        >
          应用
        </Button>
        <Tooltip title="重新生成 token，旧配置立即失效">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => {
              void api.mcp.regenerateToken().then(() => refreshMcp())
            }}
          >
            重置 token
          </Button>
        </Tooltip>
      </Space>

      {mcp ? (
        <>
          <Segmented
            block
            size="small"
            options={MCP_TRANSPORT_OPTIONS}
            value={transport}
            onChange={(v) => setTransport(v as McpTransport)}
            disabled={legacyMcp}
          />
          {legacyMcp && (
            <Typography.Text type="warning" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              检测到主进程仍是旧版本（只支持 SSE）。请完全退出客户端后重新启动，即可使用 Streamable HTTP。
            </Typography.Text>
          )}
          <div className="mcp-config-head" style={{ marginTop: 12 }}>
            <Typography.Text strong style={{ fontSize: 12 }}>
              MCP client 配置（{transport === 'streamable' ? 'Streamable HTTP' : 'SSE'}）
            </Typography.Text>
            <Space size={6}>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => void copyText(mcpConfig).then(() => message.success('MCP 配置已复制'))}
              >
                复制 JSON
              </Button>
              <Button size="small" onClick={() => void copyText(mcpUrl).then(() => message.success('URL 已复制'))}>
                复制 URL
              </Button>
            </Space>
          </div>
          <pre className="mcp-config-code">{mcpConfig}</pre>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            推荐 Streamable HTTP；SSE 供旧版 client 兼容。两种端点都已内嵌 token，
            token 只存在本机 SQLite，重置后请把新配置重新复制到 agent。
          </Typography.Text>
        </>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          正在读取 MCP 服务状态…
        </Typography.Text>
      )}
    </Form>
  )

  const generalTab = (
    <Form layout="vertical">
      <Form.Item
        label="最大标签页数量"
        extra="超出后自动关闭最久未使用的标签页（当前活动的除外），调小立即生效"
      >
        <InputNumber min={1} max={20} value={maxTabs} onChange={(v) => v && setMaxTabs(v)} style={{ width: 120 }} />
      </Form.Item>
    </Form>
  )

  return (
    <Modal title="设置" open={open} onCancel={() => setOpen(false)} footer={null} width={560}>
      <Tabs
        items={[
          {
            key: 'appearance',
            label: (
              <span>
                <SkinOutlined /> 外观
              </span>
            ),
            children: appearanceTab
          },
          {
            key: 'mcp',
            label: (
              <span>
                <ApiOutlined /> MCP 服务 {mcp?.running && <Badge status="success" />}
              </span>
            ),
            children: mcpTab
          },
          {
            key: 'general',
            label: (
              <span>
                <SettingOutlined /> 通用
              </span>
            ),
            children: generalTab
          }
        ]}
      />
    </Modal>
  )
}
