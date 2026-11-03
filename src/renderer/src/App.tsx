import { useEffect, useRef } from 'react'
import { App as AntApp, Layout, Spin } from 'antd'
import { useAppStore } from './store/appStore'
import { useUiStore } from './store/uiStore'
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
  const dragging = useRef(false)

  useEffect(() => {
    void init()
  }, [init])

  const siderRef = useRef<HTMLElement>(null)

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
    <AntApp>
    <Layout style={{ height: '100%' }}>
      <Layout.Header className="app-header" style={{ background: '#fff' }}>
        <Toolbar />
      </Layout.Header>
      <Layout className="app-layout-inner" style={{ flexDirection: 'row' }}>
        {siderVisible && (
          <>
            <aside ref={siderRef} className="app-sider" style={{ width: siderWidth, flexShrink: 0 }}>
              {initialized ? <Sidebar /> : <Spin style={{ margin: '40px auto' }} />}
            </aside>
            <div className="sider-resizer" onMouseDown={startDrag} title="拖动调整宽度，拖到最左隐藏" />
          </>
        )}
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
  )
}
