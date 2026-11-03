import { Empty, Tabs } from 'antd'
import { useAppStore, type TabItem } from '../store/appStore'
import DataGrid from './DataGrid'
import SqlQueryView from './SqlQueryView'
import DdlView from './DdlView'

function renderTab(tab: TabItem) {
  switch (tab.type) {
    case 'table':
      return <DataGrid tab={tab} />
    case 'query':
      return <SqlQueryView tab={tab} />
    case 'ddl':
      return <DdlView tab={tab} />
  }
}

export default function TabsView() {
  const tabs = useAppStore((s) => s.tabs)
  const activeTabKey = useAppStore((s) => s.activeTabKey)
  const activateTab = useAppStore((s) => s.activateTab)
  const closeTab = useAppStore((s) => s.closeTab)

  if (tabs.length === 0) {
    return (
      <Empty
        style={{ marginTop: 160 }}
        description={
          <>
            双击左侧表名打开数据，右键查看更多操作
            <br />
            分表（如 order_0…order_63）会自动折叠为一个逻辑组
          </>
        }
      />
    )
  }

  return (
    <Tabs
      className="tab-content"
      style={{ height: '100%', padding: '0 8px' }}
      type="editable-card"
      hideAdd
      activeKey={activeTabKey ?? undefined}
      onChange={activateTab}
      onEdit={(key, action) => {
        if (action === 'remove' && typeof key === 'string') closeTab(key)
      }}
      items={tabs.map((tab) => ({
        key: tab.key,
        label: tab.title,
        children: <div className="tab-content">{renderTab(tab)}</div>
      }))}
    />
  )
}
