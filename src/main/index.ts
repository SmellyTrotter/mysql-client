import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc'
import { closeAllPools } from './db/connectionManager'
import { cleanupSqlLogs } from './db/store'

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'MySQL Client',
    // macOS 用 hiddenInset（红绿灯内嵌）；Windows 用 hidden + titleBarOverlay
    // （原生窗口按钮悬浮在 header 右上），两者都靠 header 的 app-region: drag 拖动
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const }
      : isWin
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: { color: '#ffffff', symbolColor: '#171717', height: 48 }
          }
        : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // ⌘W 关闭当前标签页而不是窗口
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.meta && !input.shift && !input.alt && !input.control && input.key.toLowerCase() === 'w') {
      event.preventDefault()
      win.webContents.send('app:close-active-tab')
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  // SQL 日志每小时清理一次
  setInterval(cleanupSqlLogs, 60 * 60 * 1000).unref()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void closeAllPools()
})
