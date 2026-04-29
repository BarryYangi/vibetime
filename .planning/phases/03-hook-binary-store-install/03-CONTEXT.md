# Phase 3 Context: Hook Binary, Store & Install

## Gray Area Discussions (in progress)

### 1. vibetime CLI 寄主架构 — RESOLVED

**Decision:** `vibetime-hook` 二进制通过 `path.basename(process.argv[1])` 自路由，零依赖手写 `process.argv` 解析。

| 调用名 | 模式 | 行为 |
|--------|------|------|
| `vibetime-hook` | HOOK 模式 | 读 stdin payload → 适配器 → SQLite，silent exit 0 |
| `vibetime` | CLI 模式 | 解析子命令（install / today / project / export / version） |
| `vetime` (无参) | CLI 模式特例 | 启动 Electron app（`open` / `exec`） |

**Rationale:**
- DEC-004 "Same binary runs headless on CLI subcommands" 的自然延伸
- Phase 3 不依赖 Phase 4 Electron 骨架
- Phase 6 打包时 `vibetime` 是 `vibetime-hook` 的硬链接/复制，零额外工作
- CLI 子命令（today/export）走 Bun 二进制（<50ms），不碰 Electron（200-500ms）

**Constraints:**
- 不引入 commander / clipanion 等 CLI 库
- `core` 保持零依赖；`hook` 包可有小依赖，但此处选择零依赖手写

---

### 2. @vibetime/hook 测试器 (D-TEST-HOOK) — RESOLVED

**Decision:** `packages/hook` 用 `bun test`（Bun 内置测试器）跑单元/近单元测试，另配 1-2 个 bash 脚本做端到端集成测试。

**Rationale:**
- `bun:sqlite` 在 Node runtime 下直接崩溃，Vitest on Node 不可行
- Vitest on Bun runtime 仍为 experimental，不引入兼容性风险
- `bun test` 的 `describe`/`it`/`expect` API 与 vitest 几乎一致，心智负担低
- `core` 包继续用 `vitest run`，根目录 `pnpm run ci` 串行调用两者
- 集成测试用 shell 脚本验证真实 SQLite 行为，无 mock 负担

---

### 3. install 幂等合并策略 — PARTIALLY RESOLVED

**Claude Code — RESOLVED:**
- 文件：`~/.claude/settings.json`（JSON）
- 合并逻辑：读入 → 修改/创建 `hooks` 对象 → 保留所有非 `hooks` 字段 → 写回
- 若 hooks 已存在且值不是 vibetime-hook → 备份原文件（`.backup`）→ 覆盖并警告
- 若 hooks 已是 vibetime-hook → 完全跳过（幂等）

**Codex — PENDING LOCAL VERIFICATION:**
- 文件：`~/.codex/config.toml`（TOML）
- 已确认需写 `[features] codex_hooks = true`
- **待验证：** hook 可执行路径是写在 `config.toml` 里（集中配置），还是 Codex 自动找约定目录（如 `~/.codex/hooks/`）？
- 此验证列为 Phase 3 Plan Execution 第 1 步

**Cursor — PENDING LOCAL VERIFICATION:**
- 配置文件路径和格式都未确认
- 待验证后写具体 merge 逻辑

---

### 4. hook 热路径项目解析 — NOT STARTED

（待讨论）

## Next Steps

1. 完成灰色区域 4 讨论（hook 热路径项目解析）
2. 本地验证 Codex / Cursor 配置机制
3. 进入 03-PLAN.md 编写
