import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntApp, ConfigProvider, Layout, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useAppStore } from './store/appStore'
import { useUiStore } from './store/uiStore'
import { buildAntdTheme, buildThemeVars } from './theme'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import TabsView from './components/TabsView'
import ConnectionDialog from './components/ConnectionDialog'
import TagManager from './components/TagManager'
import BookmarksDrawer from './components/BookmarksDrawer'
import SqlLogDrawer from './components/SqlLogDrawer'
import SettingsModal from './components/SettingsModal'

const SIDER_MIN = 200
const SIDER_MAX = 560
/** 拖到这个宽度以下时自动隐藏侧栏 */
const SIDER_HIDE_THRESHOLD = 80

export default function App() {
  const init = useAppStore((s) => s.init)
  const initialized = useAppStore((s) => s.initialized)
  const siderWidth = useUiStore((s) => s.siderWidth)
  const siderVisible = useUiStore((s) => s.siderVisible)
  const themeColor = useUiStore((s) => s.themeColor)
  const appearance = useUiStore((s) => s.appearance)
  const accentStrength = useUiStore((s) => s.accentStrength)
  const dragging = useRef(false)
  const siderRef = useRef<HTMLElement>(null)

  const [systemDark, setSystemDark] = useState(
    () => (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false)
  )

  useEffect(() => {
    void init()
  }, [init])

  // Windows 下 header 布局不同：左侧无需给红绿灯留位，右侧需给悬浮窗口按钮留位
  useEffect(() => {
    if (navigator.userAgent.includes('Windows')) document.body.classList.add('platform-win')
  }, [])

  // 「跟随系统」需要监听系统配色切换
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const dark = appearance === 'dark' || (appearance === 'system' && systemDark)
  const themeVars = useMemo(
    () => buildThemeVars(themeColor, dark, accentStrength),
    [themeColor, dark, accentStrength]
  )
  const antdTheme = useMemo(
    () => buildAntdTheme(themeColor, dark, themeVars),
    [themeColor, dark, themeVars]
  )

  // 自定义 CSS 与 antd 组件 token 共用一套派生色，主题色一次性影响全界面
  useEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(themeVars)) root.style.setProperty(key, value)
    root.dataset.appTheme = dark ? 'dark' : 'light'
    root.style.colorScheme = dark ? 'dark' : 'light'
  }, [themeVars, dark])

  function startDrag(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startWidth = useUiStore.getState().siderWidth
    let pendingWidth = startWidth

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const w = startWidth + (ev.clientX - startX)
      if (w < SIDER_HIDE_THRESHOLD) {
        useUiStore.getState().setSiderVisible(false)
        stopDrag()
        return
      }
      pendingWidth = Math.min(SIDER_MAX, Math.max(SIDER_MIN, w))
      // 拖动中只改 DOM，不写 store：避免每像素触发整棵 React 树重渲染导致卡顿
      if (siderRef.current) siderRef.current.style.width = `${pendingWidth}px`
    }
    const stopDrag = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', stopDrag)
      // 松手时一次性提交
      useUiStore.getState().setSiderWidth(pendingWidth)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', stopDrag)
  }

  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <AntApp>
        <Layout style={{ height: '100%' }}>
          <Layout.Header className="app-header">
            <Toolbar />
          </Layout.Header>
          <Layout className="app-layout-inner" style={{ flexDirection: 'row' }}>
            {/* 侧栏始终挂载，隐藏仅 display:none，保留滚动位置与树展开状态 */}
            <aside
              ref={siderRef}
              className="app-sider"
              style={{ width: siderWidth, flexShrink: 0, display: siderVisible ? 'flex' : 'none' }}
            >
              {initialized ? <Sidebar /> : <Spin style={{ margin: '40px auto' }} />}
            </aside>
            <div
              className="sider-resizer"
              style={{ display: siderVisible ? 'block' : 'none' }}
              onMouseDown={startDrag}
              title="拖动调整宽度，拖到最左隐藏"
            />
            <Layout.Content className="app-content">
              <TabsView />
            </Layout.Content>
          </Layout>
          <ConnectionDialog />
          <TagManager />
          <BookmarksDrawer />
          <SqlLogDrawer />
          <SettingsModal />
        </Layout>
      </AntApp>
    </ConfigProvider>
  )
}
