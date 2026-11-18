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
  ├─ db/store.ts               better-sqlite3：connections / metadata_cache / tags / table_tags / bookmarks / sql_log / table_descriptions / app_settings
  ├─ db/crud.ts                参数化 INSERT/UPDATE/DELETE SQL 生成（纯函数）
  ├─ mcp/server.ts             内嵌 MCP server：HTTP server 上并存 Streamable HTTP(/mcp) 与 SSE(/sse+/messages) + 四个只读工具
  └─ index.ts                  窗口创建、⌘W 拦截转发、SQL 日志定时清理、MCP 服务启停
```

约定：**所有 IPC handler 用 `handle()` 包装**，异常统一转 `{ ok: false, error }`；preload 侧 `invoke()` 解包后 throw。新增能力 = shared/types.ts 加类型 → ipc.ts 加 handler → preload 加方法 → 渲染层调用。

## 目录速查

| 路径 | 职责 |
|---|---|
| `src/shared/types.ts` | 主进程/渲染层共享类型（ConnectionConfig、TableInfo、SortSpec/FilterSpec…） |
| `src/shared/sharding.ts` | 分表归组纯函数（`order_0..N` → `order_*` 组，数字排序） |
| `src/shared/scope.ts` | 连接「库/表范围」解析与 `*` 通配匹配（纯函数） |
| `src/shared/sqlGuard.ts` | MCP 查询安全边界：只读校验、scope 校验、强制 LIMIT（纯函数） |
| `src/shared/format.ts` | 时间戳识别转换、JSON 美化（纯函数） |
| `src/shared/tabs.ts` | Tab LRU 淘汰、短名去重（纯函数） |
| `src/renderer/src/store/appStore.ts` | 全局状态（zustand）：连接/库表缓存/标签/书签/Tab |
| `src/renderer/src/store/uiStore.ts` | UI 状态：弹窗开关、侧栏宽度/可见、主题色/外观/着色强度（localStorage 持久化） |
| `src/renderer/src/theme.ts` | 主题预设、颜色混合、全套 CSS 变量与 antd 组件 token 生成 |
| `src/renderer/src/connectionColors.ts` | 连接标识色板与未指定时的自动分配 |
| `src/renderer/src/components/` | Sidebar（三级树）、DataGrid、SqlQueryView、DdlView、各抽屉弹窗 |
| `src/renderer/src/api.ts` | `window.api` 引用；**无 Electron 时返回 Mock 数据**（见 dev:web） |

## 关键设计决策（都是踩坑换来的）

1. **多连接数据按 connId 分桶**：`schemasByConn / tableNodesByConn / tableTagsByConn`，Tab 自带 connId。树的 key 格式：`conn:{id}` / `schema:{id}:{schema}` / `table:{id}:{schema}.{table}`。
2. **分表归组在前端做**：`groupTables()` 对 `_数字` 后缀且组内 ≥2 张的表折叠；标签打在逻辑组名（`order_*`）上整组生效。
3. **CRUD 安全底线**：无主键表只读；所有写操作参数化 + 主键定位；写 SQL（含查询窗口的非 SELECT）记入 `sql_log` 表，保留 1 小时。
4. **性能铁律——不给单元格挂组件**：右键菜单、悬停预览都是**全表共享一个实例**（事件委托），之前每格一个 Dropdown 导致 100 行 × 15 列 ≈ 1500 实例卡死。
5. **flex 高度/宽度链**：任何"内容撑破不滚动"都是 flex 子项缺 `min-height/min-width: 0`，或某层高度链断了（`.ant-app` 必须 `height: 100%`）。
6. **无边框窗口拖拽区**：整条顶栏是 `-webkit-app-region: drag`，只有具体的交互控件（按钮、输入、标签、错误提示）与浮层（抽屉/弹窗/Tooltip）显式 `no-drag`。不要把工具栏容器整体设成 `no-drag`：它铺满大半条标题栏，窗口一窄就几乎找不到能拖窗口的空白；`no-drag` 是继承属性，挂在按钮上即可覆盖其所有子元素。
7. **侧栏保活**：隐藏用 `display:none` 而非卸载，保留滚动位置和展开状态；拖拽宽度过程只改 DOM，松手才写 store。
8. **密码不落明文**：`safeStorage.encryptString` 加密后 base64 存 SQLite。
9. **默认排序**：`create_time desc` → `id desc` → 主键升序；列头两个独立箭头直接控制升降序（不走 antd 循环切换）。
10. **筛选**：列头漏斗，一次一个字段；数字列默认 `=`，其他默认 `LIKE %v%`；参数化下推到主进程。
11. **连接隔离**：`information_schema.TABLES` 返回的是整个实例上该账号可见的库，多条连接指向同一 host:port:user 时树会完全重复。连接配置带 `schemaScope`（库白名单）与 `tableScope`（表名 `*` 通配，不带 `*` 按前缀匹配），`fetchAllTables` 在库名可精确下推时用 `IN (?)`，表名与带通配符的库名在 JS 侧过滤；空配置保持「显示全部」的旧行为。连接另带 `color`，未指定时按 id 自动分配，侧栏用色点 + 范围标签区分。
12. **连接编辑即时生效**：`conn:update` 清 `metadata_cache` 并关连接池；`saveConnection` 丢弃该 connId 的前端 `schemasByConn/tableNodesByConn` 后异步重建元数据（新建连接同样自动刷新），刷新失败原因显示在工具栏。连接弹窗会检测「同 host:port:user 且范围相同」并给出提示。
13. **主题系统**：`theme.ts` 由 `themeColor + appearance(light/dark/system) + accentStrength(soft/normal/vivid)` 派生一套 CSS 变量（`--app-*`），同时喂给自定义 CSS 和 antd `components` token。顶栏渐变、侧栏、树节点/图标、标签页、表格表头与悬停行、分页、菜单、编辑器选区、滚动条、弹窗抽屉标题、单元格类型色都取自这套变量；深色模式走 `darkAlgorithm` + `html[data-app-theme='dark']`。主题预设 18 组，另支持取色器自定义。
14. **MCP 内嵌在 Electron 主进程**：不能做成独立 Node 进程——密码用 Electron `safeStorage` 加密，只有主进程能解密。同一个 HTTP server 上挂两种 transport：Streamable HTTP（单端点 `/mcp`，stateful，按 `mcp-session-id` 路由，DELETE 关会话）与 SSE（`/sse` + `/messages`）。只绑 127.0.0.1，两种端点都校验 token，Host 头白名单防 DNS rebinding。**每个会话要 new 一个 `McpServer`**：SDK 规定一个 transport 只能被一个 server 独占。首期只注册四个只读工具，写操作后续单独设计。
15. **表描述按分表组存**：`table_descriptions` 主键是 `(conn_id, schema_name, table_group)`，`table_group` 用 `nodeName()` 得到的逻辑组名（`order_*`），一次标注覆盖整组，不给 1000 张分表重复写。`list_tables` / `describe_table` 把描述一并返回给 AI；描述只在本机 SQLite，不导出、不进 git。
16. **MCP 查询必须走 AST 校验**：`sqlGuard.ts` 用 `node-sql-parser` 而不是正则，拒绝多语句与非 SELECT、提取引用表按 `scope.ts` 校验、自动追加 LIMIT。已有 LIMIT 的 SQL 原样放行——调用方主动限量不会拖库。

## 本地开发

```bash
npm install          # postinstall 自动为 Electron 重编 better-sqlite3
npm run dev          # Electron 开发模式
npm run dev:web      # 不起 Electron，浏览器访问 localhost:5199（Mock 数据，调 UI 用）
npm run test         # vitest
npm run typecheck    # tsc 双工程（node + web）
npm run dist         # 打包 dmg（未签名）
```

`dev:web` 的 Mock 在 `src/renderer/src/api.ts`，覆盖：两个连接（同主机名、不同标识色与库范围）、120 张分表、宽表 21 列、JSON/时间戳字段——基本复刻真实痛点场景。**改 UI 后建议用它 + 浏览器自动化实测**，不要盲改。

## 已知边界 / TODO

- SSH 隧道未实现（ConnectionInput 目前没有 ssh 字段，需要时加 ssh2 做跳板）
- 筛选一次只支持一个字段（多条件 AND 需扩展 FilterSpec 为数组 + 面板 UI）
- 大表总行数 `COUNT(*)` 慢：已拆成独立 `table:count` 请求，数据页先渲染、总数后台补齐；`TABLE_ROWS` 估算值失真（曾把 3M 行表估成 10 万以下），不能用于默认排序判断，改用 `LIMIT 1 OFFSET N` 探测
- 打包未做 Apple 签名/公证（分发需配 `electron-builder.yml` 的 identity + notarize）
- SQL 编辑器无 schema 感知自动补全（CodeMirror `@codemirror/lang-sql` 可接 schema 配置）

## 测试约定

纯逻辑必须进 `src/shared/` 或 `src/main/db/` 并配 vitest 单测（覆盖：分表归组、CRUD SQL 生成、时间戳解析、Tab LRU/标签去重、库表范围解析与匹配、MCP 查询安全校验）。MCP 工具协议层用 SDK 的 `InMemoryTransport` + mock 主进程依赖测试（`server.test.ts`），Streamable HTTP 的 HTTP 层（token / Host / initialize 握手 / 工具调用）用真实 HTTP server + SDK client 测（`http.test.ts`）。涉及 Electron API 的不测。
