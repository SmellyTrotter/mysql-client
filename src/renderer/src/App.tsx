import { useEffect } from 'react'
import { App as AntApp, Layout, Spin } from 'antd'
import { useAppStore } from './store/appStore'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import TabsView from './components/TabsView'
import ConnectionDialog from './components/ConnectionDialog'
import TagManager from './components/TagManager'
import BookmarksDrawer from './components/BookmarksDrawer'
import SqlLogDrawer from './components/SqlLogDrawer'

export default function App() {
  const init = useAppStore((s) => s.init)
  const initialized = useAppStore((s) => s.initialized)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <AntApp>
    <Layout style={{ height: '100%' }}>
      <Layout.Header className="app-header" style={{ background: '#fff' }}>
        <Toolbar />
      </Layout.Header>
      <Layout>
        <Layout.Sider width={300} className="app-sider" theme="light">
          {initialized ? <Sidebar /> : <Spin style={{ margin: '40px auto' }} />}
        </Layout.Sider>
        <Layout.Content>
          <TabsView />
        </Layout.Content>
      </Layout>
      <ConnectionDialog />
      <TagManager />
      <BookmarksDrawer />
      <SqlLogDrawer />
    </Layout>
    </AntApp>
  )
}
