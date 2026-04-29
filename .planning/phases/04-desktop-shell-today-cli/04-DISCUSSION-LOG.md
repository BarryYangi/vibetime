# Phase 4: Desktop Shell, Today View & CLI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 4-desktop-shell-today-cli
**Areas discussed:** IPC 方法签名, CLI 代码复用策略, 渲染器数据获取架构, Electron 应用骨架

---

## IPC 方法签名

### Q1: IPC 方法粒度

| Option | Description | Selected |
|--------|-------------|----------|
| 细粒度方法 | 每个查询一个 invoke 方法，简单直接，返回值类型明确 | ✓ |
| 通用查询接口 | 一个通用 query(sql, params) 方法，灵活但安全性差 | |
| 分组命名空间 | 按视图分组：today.*、project.*、settings.* | |

**User's choice:** 细粒度方法 (推荐)
**Notes:** 无

### Q2: IPC 类型共享方式

| Option | Description | Selected |
|--------|-------------|----------|
| 共享类型文件 | main 和 renderer 都从同一文件导入，编译期保证类型安全 | ✓ |
| 手动类型声明 | renderer 用 d.ts 声明手动同步，简单但容易漂移 | |
| 自动类型生成 | 用工具（如 electron-trpc）自动生成端到端类型安全 | |

**User's choice:** 共享类型文件 (推荐)
**Notes:** 无

### Q3: IPC 方法集范围

| Option | Description | Selected |
|--------|-------------|----------|
| 最小集 | 仅 Today view + Settings 所需，Phase 5 再加 Live/History | ✓ |
| 完整集 | 一次定义所有视图需要的 IPC 方法 | |
| Today + CLI 共享 | Today + Settings + 通用 export/version，CLI 也通过 IPC | |

**User's choice:** 最小集 (推荐)
**Notes:** 无

### Q4: IPC 错误处理模式

| Option | Description | Selected |
|--------|-------------|----------|
| Result 包装 | { ok: true, data } | { ok: false, error: string }，统一处理 | ✓ |
| 直接返回/抛出 | 成功返回数据，失败 throw | |
| data + error 双返回 | 类似 Go 风格 | |

**User's choice:** Result 包装 (推荐)
**Notes:** 无

---

## CLI 代码复用策略

### Q1: CLI 复用方式

| Option | Description | Selected |
|--------|-------------|----------|
| 增强 hook CLI | 在 hook 包中增强格式化输出，desktop 直接调用 runCli() | ✓ |
| desktop 独立 CLI | desktop 主进程独立实现，hook 保持精简 | |
| core 共享格式化 | 查询+格式化逻辑抽到 core 包 | |

**User's choice:** 增强 hook CLI (推荐)
**Notes:** 无

### Q2: CLI 输出格式

| Option | Description | Selected |
|--------|-------------|----------|
| 纯文本表格 | 对齐的文本表格，类似 ps 或 docker stats | |
| 彩色终端输出 | 用 chalk 加颜色高亮，视觉效果好 | ✓ |
| 极简每行一条 | 每行一个条目，方便脚本解析 | |

**User's choice:** 彩色终端输出
**Notes:** 无

### Q3: 颜色库选择

| Option | Description | Selected |
|--------|-------------|----------|
| chalk | 最流行的终端颜色库，API 简单，tree-shakable | ✓ |
| kleur | 更轻量（~3KB），API 兼容 chalk | |
| 手写 ANSI | 不引入依赖，用 ANSI 转义码手写 | |

**User's choice:** chalk (推荐)
**Notes:** 无

### Q4: CLI 路由位置

| Option | Description | Selected |
|--------|-------------|----------|
| hook 包路由 | Phase 3 已决定，CLI 逻辑全在 hook 包中 | ✓ |
| desktop 主进程路由 | CLI 在 desktop 主进程中实现，用 better-sqlite3 | |

**User's choice:** hook 包路由 (推荐)
**Notes:** 无

---

## 渲染器数据获取架构

### Q1: 数据获取模式

| Option | Description | Selected |
|--------|-------------|----------|
| 自定义 hook + Jotai | useIpcQuery hook + Jotai atom + setInterval，零额外依赖 | ✓ |
| React Query | @tanstack/react-query 处理缓存、轮询、错误状态 | |
| Jotai atomWithRefresh | Jotai atom 带 refresh 计数器，最简但缓存需手写 | |

**User's choice:** 自定义 hook + Jotai (推荐)
**Notes:** 无

### Q2: 自动刷新策略

| Option | Description | Selected |
|--------|-------------|----------|
| 固定 5 秒 | 所有视图统一 5 秒轮询 | |
| 自适应轮询 | 有活跃 turn 时 5 秒，idle 时 30 秒或停止 | |
| 主进程推送 | 主进程在数据变化时主动推送 | ✓ |

**User's choice:** 主进程推送
**Notes:** 用户明确要求事件驱动而非轮询："尽量不要使用轮询这种低效的方式，我们本来就是 hook 事件驱动"

### Q3: 推送触发机制

| Option | Description | Selected |
|--------|-------------|----------|
| SQLite updateHook | better-sqlite3 db.updateHook()，INSERT/UPDATE/DELETE 时触发 | ✓ |
| Hook 写后发信号 | hook 写入后向 Unix socket / named pipe 发信号 | |
| WAL 文件监听 | chokidar 监听 data.db-wal 文件变化 | |

**User's choice:** SQLite updateHook (推荐)
**Notes:** 真正事件驱动，零轮询

### Q4: 渲染器更新方式

| Option | Description | Selected |
|--------|-------------|----------|
| Jotai atom 直接更新 | 收到推送后直接更新 atom，组件自动重渲染 | ✓ |
| 增量更新快照 | 维护本地数据快照，增量更新 | |

**User's choice:** Jotai atom 直接更新 (推荐)
**Notes:** 无

---

## Electron 应用骨架

### Q1: 目录结构

| Option | Description | Selected |
|--------|-------------|----------|
| 标准三层 | main/、preload/、renderer/，清晰分离 | ✓ |
| 两层 + 内联 preload | main/ 和 renderer/，preload 内联到 BrowserWindow | |

**User's choice:** 标准三层 (推荐)
**Notes:** 无

### Q2: 安全配置

| Option | Description | Selected |
|--------|-------------|----------|
| 严格安全 | contextIsolation: true, sandbox: true, nodeIntegration: false | ✓ |
| 中等安全 | contextIsolation: true, sandbox: false | |

**User's choice:** 严格安全 (推荐)
**Notes:** 无

### Q3: 构建工具

| Option | Description | Selected |
|--------|-------------|----------|
| Vite + electron-vite | Vite 构建 renderer，社区主流方案 | ✓ |
| Webpack + electron-builder | 传统方案但配置复杂 | |
| 手写构建配置 | 手写 tsc + Vite 构建 | |

**User's choice:** electron-vite (electron-vite.org)
**Notes:** 用户直接指定使用 electron-vite.org 框架

### Q4: 视图路由

| Option | Description | Selected |
|--------|-------------|----------|
| React Router | react-router-dom 实现视图切换，支持侧边栏导航 | ✓ |
| Jotai 视图状态 | Jotai atom 控制当前视图，极简 | |
| 多窗口 | 每个视图一个窗口 | |

**User's choice:** React Router (推荐)
**Notes:** 无

---

## Claude's Discretion

- Today view 条形可视化实现方式（ECharts bar 或 CSS）
- Settings 面板 agent 状态检测逻辑
- electron-vite 具体配置
- preload 脚本精确 API 表面

## Deferred Ideas

- Live 视图动画 → Phase 5
- History 视图 → Phase 5
- Menubar widget → Phase 5
- Auto-launch on login → Phase 5
