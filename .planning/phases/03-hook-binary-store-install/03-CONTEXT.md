# Phase 3 Context: Hook Binary, Store & Install

## Gray Area Discussions (in progress)

### 1. vibetime CLI 寄主架构 — RESOLVED

**Decision:** `vibetime-hook` 二进制通过 `path.basename(process.argv[1])` 自路由，零依赖手写 `process.argv` 解析。

| 调用名 | 模式 | 行为 |
|--------|------|------|
| `vibetime-hook` | HOOK 模式 | 读 stdin payload → 适配器 → SQLite，silent exit 0 |
| `vibetime` | CLI 模式 | 解析子命令（install / today / project / export / version） |
| `vibetime` (无参) | CLI 模式特例 | 启动 Electron app（`open` / `exec`） |

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

### 3. install 幂等合并策略 — RESOLVED

三 Agent 配置机制经文档调研已全部确认。

#### 3A. Claude Code

**文件：** `~/.claude/settings.json`（JSON）

**结构（三层嵌套）：**
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "/path/to/vibetime-hook" }
        ]
      }
    ],
    "Stop": [...],
    "SessionStart": [...],
    "SessionEnd": [...]
  }
}
```

**事件（4 个）：** `UserPromptSubmit`, `Stop`, `SessionStart`, `SessionEnd`

**合并策略：**
1. 读入现有 JSON（保留所有非 `hooks` 字段）
2. 对 4 个事件：创建/更新 matcher 组，设 `matcher: "*"`
3. 若 vibetime hook 已存在（按 `command` 字符串匹配）→ 跳过（幂等）
4. 若存在非 vibetime hooks → 备份原文件 → 覆盖（打印警告）
5. 写回（`JSON.stringify(data, null, 2)`）

**注意：** `command` 是 shell 命令字符串，非纯路径。支持参数：`"/path/to/vibetime-hook --source claude"`

---

#### 3B. Codex CLI

**文件：** `~/.codex/config.toml`（TOML）或 `~/.codex/hooks.json`（JSON，也支持）

**选择 hooks.json 路径（更简单，无需 TOML 解析库）：**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "/path/to/vibetime-hook", "timeout": 10 }
        ]
      }
    ],
    "UserPromptSubmit": [...],
    "Stop": [...]
  }
}
```

**事件（3 个，无 SessionEnd）：** `UserPromptSubmit`, `Stop`, `SessionStart`

**必须同时设置 features：** 在 `~/.codex/config.toml` 中确保 `[features]\ncodex_hooks = true`

**合并策略：**
1. 读 `~/.codex/config.toml`，确保 `[features] codex_hooks = true` 存在（正则检查/追加）
2. 读/创建 `~/.codex/hooks.json`，按 Claude Code 同逻辑合并 vibetime hooks
3. hooks 跨配置层累加（不替换），所以 vibetime 独占 `hooks.json` 文件最干净

**Codex 特殊：** `SessionStart` 支持 `matcher: "startup|resume"` 过滤 source

---

#### 3C. Cursor

**文件：** `~/.cursor/hooks.json`（JSON，本机已验证）

**结构（最简单）：**
```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      { "command": "/path/to/vibetime-hook" }
    ],
    "stop": [
      { "command": "/path/to/vibetime-hook" }
    ],
    "sessionStart": [
      { "command": "/path/to/vibetime-hook" }
    ],
    "sessionEnd": [
      { "command": "/path/to/vibetime-hook" }
    ]
  }
}
```

**事件（4 个）：** `beforeSubmitPrompt`, `stop`, `sessionStart`, `sessionEnd`

**合并策略：**
1. 读/创建 `~/.cursor/hooks.json`（默认 `{"version": 1, "hooks": {}}`）
2. 对 4 个事件：若 vibetime hook 已存在 → 跳过；否则 **追加** 到数组
3. 保留所有非 vibetime hooks
4. 备份原文件 → 写回

**注意：** Cursor 可能同时发射 camelCase 和 snake_case 字段名（adapter 已处理）

---

#### 通用 install 原则

| 原则 | 说明 |
|------|------|
| **幂等** | 多次运行结果一致，按 `command` 字符串匹配 |
| **备份** | 写入前备份原文件为 `.backup` |
| **保留** | 不删除用户已有的其他 hooks |
| **绝对路径** | hook 路径必须是 absolute（`process.execPath` 或 `import.meta.dir` + `/vibetime-hook`） |
| **silent** | hook stdout 为空，exit 0，PRD §7 约束 |

---

### 4. hook 热路径项目解析 — NOT STARTED

（待讨论：git remote 调用 vs <50ms 启动预算）

## Next Steps

1. 完成灰色区域 4 讨论（hook 热路径项目解析）
2. 进入 03-PLAN.md 编写
