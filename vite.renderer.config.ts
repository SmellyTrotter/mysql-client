// 浏览器调试专用：不启动 Electron，直接用浏览器调试渲染层。
// 用法：npm run dev:web，然后打开 http://localhost:5199
// window.api 不存在时自动使用 src/renderer/src/api.ts 里的 Mock 数据。
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: { port: 5199, strictPort: true }
})
