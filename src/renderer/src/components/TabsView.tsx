import { useEffect, useMemo } from 'react'
import { Empty } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { computeTabLabels } from '../../../shared/tabs'
import { api } from '../api'
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

  // ⌘W 关闭当前标签页（由主进程转发）
  useEffect(() => {
    return api.events.onCloseActiveTab(() => {
      const { activeTabKey, closeTab } = useAppStore.getState()
      if (activeTabKey) closeTab(activeTabKey)
    })
  }, [])

  // 短名有重复时才显示完整 库.表 前缀，省横向空间
  const labels = useMemo(() => computeTabLabels(tabs), [tabs])

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
    <div className="tab-content">
      <div className="tabbar">
        {tabs.map((tab) => (
          <div
            key={tab.key}
            className={`tab-chip ${tab.key === activeTabKey ? 'active' : ''}`}
            title={tab.title}
            onClick={() => activateTab(tab.key)}
            onAuxClick={(e) => {
              if (e.button === 1) closeTab(tab.key)
            }}
          >
            <span>{labels.get(tab.key)}</span>
            <CloseOutlined
              className="tab-chip-close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.key)
              }}
            />
          </div>
        ))}
      </div>
      <div className="tab-body">
        {tabs.map((tab) => (
          <div key={tab.key} className={`tab-pane ${tab.key === activeTabKey ? '' : 'hidden'}`}>
            {renderTab(tab)}
          </div>
        ))}
      </div>
    </div>
  )
}
