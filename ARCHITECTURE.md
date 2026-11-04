# MySQL Client 架构说明

> 面向后续接手的开发者 / AI agent。读完这份文档应该能独立修改任何一层。

## 这是什么

macOS 桌面 MySQL 客户端（Electron），面向**分表多（order_0~order_63 这类）、表数量大（1000+）** 的业务场景。核心能力：多连接同屏、库表树（分表自动折叠）、跨连接搜索、数据网格 CRUD、字段筛选/排序、DDL 查看、SQL 查询、标签/书签、SQL 审计日志。

## 技术栈

- **Electron 36**（无边框窗口 `titleBarStyle: hiddenInset`）
- **主进程**：Node + mysql2（连接池）+ better-sqlite3（本地缓存）
- **渲染层**：React 18 + TypeScript + antd v5 + zustand + CodeMirror 6
- **构建**：electron-vite（ESM，`"type": "module"`）
- **测试**：vitest（纯函数单测）

## 进程模型与数据流

```
Renderer (React)  ←── window.api (contextBridge)  ──  Preload (src/preload/index.ts)
        ↑↓ ipcRenderer.invoke('channel', ...args)  →  ApiResult<T> = { ok, data?, error? }
Main (src/main/)  ←  ipcMain.handle 注册于 src/main/ipc.ts
  ├─ db/connectionManager.ts   mysql2 连接池、查询、元数据拉取（safeStorage 解密密码）
  ├─ db/store.ts               better-sqlite3：connections / metadata_cache / tags / table_tags / bookmarks / sql_log
  ├─ db/crud.ts                参数化 INSERT/UPDATE/DELETE SQL 生成（纯函数）
  └─ index.ts                  窗口创建、⌘W 拦截转发、SQL 日志定时清理
```

约定：**所有 IPC handler 用 `handle()` 包装**，异常统一转 `{ ok: false, error }`；preload 侧 `invoke()` 解包后 throw。新增能力 = shared/types.ts 加类型 → ipc.ts 加 handler → preload 加方法 → 渲染层调用。

## 目录速查

| 路径 | 职责 |
|---|---|
| `src/shared/types.ts` | 主进程/渲染层共享类型（ConnectionConfig、TableInfo、SortSpec/FilterSpec…） |
| `src/shared/sharding.ts` | 分表归组纯函数（`order_0..N` → `order_*` 组，数字排序） |
| `src/shared/format.ts` | 时间戳识别转换、JSON 美化（纯函数） |
| `src/shared/tabs.ts` | Tab LRU 淘汰、短名去重（纯函数） |
| `src/renderer/src/store/appStore.ts` | 全局状态（zustand）：连接/库表缓存/标签/书签/Tab |
| `src/renderer/src/store/uiStore.ts` | UI 状态：弹窗开关、侧栏宽度/可见、主题色（localStorage 持久化） |
| `src/renderer/src/components/` | Sidebar（三级树）、DataGrid、SqlQueryView、DdlView、各抽屉弹窗 |
| `src/renderer/src/api.ts` | `window.api` 引用；**无 Electron 时返回 Mock 数据**（见 dev:web） |

## 关键设计决策（都是踩坑换来的）

1. **多连接数据按 connId 分桶**：`schemasByConn / tableNodesByConn / tableTagsByConn`，Tab 自带 connId。树的 key 格式：`conn:{id}` / `schema:{id}:{schema}` / `table:{id}:{schema}.{table}`。
2. **分表归组在前端做**：`groupTables()` 对 `_数字` 后缀且组内 ≥2 张的表折叠；标签打在逻辑组名（`order_*`）上整组生效。
3. **CRUD 安全底线**：无主键表只读；所有写操作参数化 + 主键定位；写 SQL（含查询窗口的非 SELECT）记入 `sql_log` 表，保留 1 小时。
4. **性能铁律——不给单元格挂组件**：右键菜单、悬停预览都是**全表共享一个实例**（事件委托），之前每格一个 Dropdown 导致 100 行 × 15 列 ≈ 1500 实例卡死。
5. **flex 高度/宽度链**：任何"内容撑破不滚动"都是 flex 子项缺 `min-height/min-width: 0`，或某层高度链断了（`.ant-app` 必须 `height: 100%`）。
6. **无边框窗口拖拽区**：`-webkit-app-region: drag` 的顶栏会在浏览器层截获点击，浮层（抽屉/弹窗/Tooltip）必须显式 `no-drag`。
7. **侧栏保活**：隐藏用 `display:none` 而非卸载，保留滚动位置和展开状态；拖拽宽度过程只改 DOM，松手才写 store。
8. **密码不落明文**：`safeStorage.encryptString` 加密后 base64 存 SQLite。
9. **默认排序**：`create_time desc` → `id desc` → 主键升序；列头两个独立箭头直接控制升降序（不走 antd 循环切换）。
10. **筛选**：列头漏斗，一次一个字段；数字列默认 `=`，其他默认 `LIKE %v%`；参数化下推到主进程。

## 本地开发

```bash
npm install          # postinstall 自动为 Electron 重编 better-sqlite3
npm run dev          # Electron 开发模式
npm run dev:web      # 不起 Electron，浏览器访问 localhost:5199（Mock 数据，调 UI 用）
npm run test         # vitest
npm run typecheck    # tsc 双工程（node + web）
npm run dist         # 打包 dmg（未签名）
```

`dev:web` 的 Mock 在 `src/renderer/src/api.ts`，覆盖：两个连接（同超长主机名）、120 张分表、宽表 21 列、JSON/时间戳字段——基本复刻真实痛点场景。**改 UI 后建议用它 + 浏览器自动化实测**，不要盲改。

## 已知边界 / TODO

- SSH 隧道未实现（ConnectionInput 目前没有 ssh 字段，需要时加 ssh2 做跳板）
- 筛选一次只支持一个字段（多条件 AND 需扩展 FilterSpec 为数组 + 面板 UI）
- 百万行表 `COUNT(*)` 全表计数偏慢，可换 `information_schema.TABLES.TABLE_ROWS` 估算
- 打包未做 Apple 签名/公证（分发需配 `electron-builder.yml` 的 identity + notarize）
- SQL 编辑器无 schema 感知自动补全（CodeMirror `@codemirror/lang-sql` 可接 schema 配置）

## 测试约定

纯逻辑必须进 `src/shared/` 或 `src/main/db/` 并配 vitest 单测（现有 26 个用例覆盖：分表归组、CRUD SQL 生成、时间戳解析、Tab LRU/标签去重）。涉及 Electron API 的不测。
