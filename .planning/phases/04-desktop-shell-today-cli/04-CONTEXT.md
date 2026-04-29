# Phase 4: Desktop Shell, Today View & CLI - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Electron 桌面应用启动后默认展示 Today 视图，所有 CLI 子命令无头运行，渲染器通过 typed IPC 访问数据。包含 Today view（per-project 时间分解 + 条形可视化 + 自动刷新）、完整 CLI surface（today/project/export/version/install）、minimal Settings（Connect Agents + Project Aliases + About）、以及首次 Electron 应用骨架搭建。Live/History/Menubar 属于 Phase 5。

</domain>

<decisions>
## Implementation Decisions

### IPC 方法签名 (D-IPC)
- **D-01:** 细粒度方法模式——每个查询一个 invoke 方法（如 `getTodaySummary`, `getOpenTurns`），不使用通用查询接口
- **D-02:** 共享类型文件——在 `packages/desktop/src/shared/ipc-types.ts` 定义 IPC 方法名 + 参数 + 返回值类型，main 和 renderer 都从同一文件导入，编译期保证类型安全
- **D-03:** 最小方法集——Phase 4 仅实现 Today view + Settings 所需：`getTodaySummary`, `getOpenTurns`, `getAgentStatus`, `getConfig`, `updateConfig`, `installAgent`。Phase 5 再加 Live/History
- **D-04:** Result 包装——所有 IPC 方法返回 `{ ok: true, data: T } | { ok: false, error: string }`，渲染器统一处理，无异常传播

### CLI 代码复用
- **D-05:** 增强 hook CLI——在 `packages/hook/src/cli.ts` 中增强 today/project/export 的格式化输出，desktop 主进程的 CLI 模式直接调用 hook 的 `runCli()`
- **D-06:** chalk 彩色输出——引入 chalk 库用于终端颜色高亮（非 CLI 框架，不违反 Phase 3 约束）
- **D-07:** hook 包路由——vibetime 二进制的 CLI 子命令在 hook 包中执行（Phase 3 已建立的 argv[1] 路由机制）

### 渲染器数据获取架构
- **D-08:** 自定义 hook + Jotai——使用自定义 `useIpcQuery` hook 配合 Jotai atom 管理状态，不引入 React Query
- **D-09:** SQLite updateHook 事件驱动推送——主进程通过 better-sqlite3 的 `db.updateHook()` 监听表变更（INSERT/UPDATE/DELETE 触发），收到回调后通过 `webContents.send` 推送渲染器。真正事件驱动，零轮询
- **D-10:** Jotai atom 直接更新——渲染器收到推送后直接更新 Jotai atom，组件自动重渲染，无需客户端缓存策略

### Electron 应用骨架
- **D-11:** 标准三层结构——`main/`（主进程）、`preload/`（桥接）、`renderer/`（React 应用），清晰分离
- **D-12:** 严格安全策略——`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`。渲染器通过 preload 暴露的 API 访问主进程
- **D-13:** electron-vite 构建——使用 electron-vite.org 框架处理 main/preload/renderer 三层的构建和开发 HMR
- **D-14:** React Router 路由——使用 react-router-dom 实现 Today/Live/History/Settings 视图切换，支持侧边栏导航

### Claude's Discretion
- Today view 条形可视化的具体实现方式（ECharts bar 或 CSS）
- Settings 面板中 agent 状态检测的具体逻辑
- electron-vite 的具体配置细节
- preload 脚本的精确 API 表面

</decisions>

<specifics>
## Specific Ideas

- 用户明确要求事件驱动而非轮询："尽量不要使用轮询这种低效的方式，我们本来就是 hook 事件驱动"
- 用户指定 electron-vite.org 作为构建框架
- Phase 4 仅实现 Today + Settings，Live/History 留给 Phase 5

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PRD 需求
- `vibetime-prd.md` §10.2 — Today view 规格（grand total, per-project breakdown, bar visualization, footer, 5s refresh）
- `vibetime-prd.md` §10.3 — Settings 规格（Connect Agents, Project Aliases, About）
- `vibetime-prd.md` §11 — CLI surface 完整规格（install/today/project/export/version）
- `vibetime-prd.md` §12 — 配置文件格式（config.toml schema）
- `vibetime-prd.md` §14 — 验收标准（Today view 相关条目）

### 锁定决策
- `.planning/DECISIONS.md` — D-IPC（Phase 4 决定），DEC-007（IPC-only renderer），DEC-015（设计系统）
- `.planning/PROJECT.md` — 技术栈约束、核心价值

### 已实现代码
- `packages/hook/src/cli.ts` — 现有 CLI 子命令实现（需增强）
- `packages/hook/src/store.ts` — queryEvents/queryOpenTurns（CLI 和 IPC 查询的基础）
- `packages/hook/src/install.ts` — 幂等 install 逻辑（Settings 面板复用）
- `packages/core/src/events.ts` — NormalizedEvent 类型定义
- `packages/core/src/schema.ts` — DDL 常量（events + open_turns）

### Phase 3 决策
- `.planning/phases/03-hook-binary-store-install/03-CONTEXT.md` — CLI 架构、install 合并策略、hook 热路径决策

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/hook/src/store.ts` — `queryEvents()`, `queryOpenTurns()`, `openDatabase()`, `closeDatabase()` — CLI 和 IPC 查询层的基础
- `packages/hook/src/install.ts` — `installAgent()` — Settings 面板 "Connect Agents" 直接复用
- `packages/hook/src/recovery.ts` — `sweepStale()` — desktop 启动时调用
- `packages/hook/src/cli.ts` — `runCli()` — desktop CLI 模式入口
- `packages/hook/src/constants.ts` — `VERSION`, `DB_PATH` — version 子命令和 IPC 共用

### Established Patterns
- Phase 3 hook 二进制通过 `basename(argv[1])` 自路由：`vibetime-hook` → hook 模式，`vibetime` → CLI 模式
- `openDatabase()` 每次调用都设置 PRAGMA + CREATE TABLE IF NOT EXISTS（幂等）
- `queryEvents()` 支持 from/to/project/agent 过滤，返回 `NormalizedEvent[]`
- 所有 hook 操作 try/catch 包裹，永不抛出

### Integration Points
- `packages/desktop/src/index.ts` — 当前空占位文件，将扩展为 Electron main 入口
- `packages/desktop/package.json` — 已有 `@vibetime/core` 依赖，需添加 `electron`, `better-sqlite3`, `react`, `react-dom`, `react-router-dom`, `jotai`, `tailwindcss`, `coss ui`, `echarts`, `chalk`
- IPC 类型文件将放在 `packages/desktop/src/shared/ipc-types.ts`，main 和 renderer 共享

</code_context>

<deferred>
## Deferred Ideas

- Live 视图动画和 30fps 需求 → Phase 5
- History 视图（heatmap + trends + table）→ Phase 5
- Menubar widget → Phase 5
- Auto-launch on login → Phase 5（SET-04）
- Close-to-menubar 生命周期 → Phase 5（LIFE-01, LIFE-02）

</deferred>

---

*Phase: 04-desktop-shell-today-cli*
*Context gathered: 2026-04-29*
