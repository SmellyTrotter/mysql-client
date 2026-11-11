import { create } from 'zustand'
import type { AccentStrength, Appearance } from '../theme'

interface UiState {
  connectionDialog: { open: boolean; editId?: string }
  tagTarget: { connId: string; schema: string; table: string } | null
  bookmarksOpen: boolean
  sqlLogOpen: boolean
  settingsOpen: boolean
  /** 侧栏宽度（px），持久化 */
  siderWidth: number
  /** 侧栏是否可见，持久化 */
  siderVisible: boolean
  /** 主题色，持久化 */
  themeColor: string
  /** 外观模式：浅色 / 深色 / 跟随系统，持久化 */
  appearance: Appearance
  /** 主题色着色浓度，持久化 */
  accentStrength: AccentStrength
  openConnectionDialog: (editId?: string) => void
  closeConnectionDialog: () => void
  openTagManager: (connId: string, schema: string, table: string) => void
  closeTagManager: () => void
  setBookmarksOpen: (open: boolean) => void
  setSqlLogOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setSiderWidth: (w: number) => void
  setSiderVisible: (v: boolean) => void
  toggleSider: () => void
  setThemeColor: (c: string) => void
  setAppearance: (a: Appearance) => void
  setAccentStrength: (s: AccentStrength) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  connectionDialog: { open: false },
  tagTarget: null,
  bookmarksOpen: false,
  sqlLogOpen: false,
  settingsOpen: false,
  siderWidth: Number(localStorage.getItem('mysql-client.siderWidth')) || 300,
  siderVisible: localStorage.getItem('mysql-client.siderVisible') !== '0',
  themeColor: localStorage.getItem('mysql-client.themeColor') || '#1677ff',
  appearance: (localStorage.getItem('mysql-client.appearance') as Appearance) || 'light',
  accentStrength: (localStorage.getItem('mysql-client.accentStrength') as AccentStrength) || 'normal',
  openConnectionDialog: (editId) => set({ connectionDialog: { open: true, editId } }),
  closeConnectionDialog: () => set({ connectionDialog: { open: false } }),
  openTagManager: (connId, schema, table) => set({ tagTarget: { connId, schema, table } }),
  closeTagManager: () => set({ tagTarget: null }),
  setBookmarksOpen: (open) => set({ bookmarksOpen: open }),
  setSqlLogOpen: (open) => set({ sqlLogOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSiderWidth: (w) => {
    localStorage.setItem('mysql-client.siderWidth', String(w))
    set({ siderWidth: w })
  },
  setSiderVisible: (v) => {
    localStorage.setItem('mysql-client.siderVisible', v ? '1' : '0')
    set({ siderVisible: v })
  },
  toggleSider: () => {
    const next = !get().siderVisible
    localStorage.setItem('mysql-client.siderVisible', next ? '1' : '0')
    set({ siderVisible: next })
  },
  setThemeColor: (c) => {
    localStorage.setItem('mysql-client.themeColor', c)
    set({ themeColor: c })
  },
  setAppearance: (a) => {
    localStorage.setItem('mysql-client.appearance', a)
    set({ appearance: a })
  },
  setAccentStrength: (s) => {
    localStorage.setItem('mysql-client.accentStrength', s)
    set({ accentStrength: s })
  }
}))
