import { create } from 'zustand'

interface UiState {
  connectionDialog: { open: boolean; editId?: string }
  tagTarget: { schema: string; table: string } | null
  bookmarksOpen: boolean
  sqlLogOpen: boolean
  openConnectionDialog: (editId?: string) => void
  closeConnectionDialog: () => void
  openTagManager: (schema: string, table: string) => void
  closeTagManager: () => void
  setBookmarksOpen: (open: boolean) => void
  setSqlLogOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  connectionDialog: { open: false },
  tagTarget: null,
  bookmarksOpen: false,
  sqlLogOpen: false,
  openConnectionDialog: (editId) => set({ connectionDialog: { open: true, editId } }),
  closeConnectionDialog: () => set({ connectionDialog: { open: false } }),
  openTagManager: (schema, table) => set({ tagTarget: { schema, table } }),
  closeTagManager: () => set({ tagTarget: null }),
  setBookmarksOpen: (open) => set({ bookmarksOpen: open }),
  setSqlLogOpen: (open) => set({ sqlLogOpen: open })
}))
