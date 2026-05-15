# Usage Analytics Research

Date: 2026-05-15

Scope: local-first usage/cost analytics for the currently supported agents:
Claude Code, Codex, Cursor, and Gemini CLI.

References reviewed:

- ccusage: https://github.com/ryoppippi/ccusage and https://ccusage.com/
- ccusage Codex package: https://ccusage.com/guide/codex/
- CodexBar: https://github.com/steipete/CodexBar
- CodexBar Codex notes: https://github.com/steipete/CodexBar/blob/main/docs/codex.md
- CodexBar Claude notes: https://github.com/steipete/CodexBar/blob/main/docs/claude.md
- Claude Code hooks reference: https://code.claude.com/docs/en/hooks
- Gemini CLI hooks reference: https://geminicli.com/docs/hooks/reference/
- Local VibeTime code:
  - `packages/core/src/schema.ts`
  - `packages/core/src/adapters/*`
  - `packages/hook/src/hook.ts`
  - `packages/hook/src/store.ts`
  - `packages/hook/src/install.ts`
  - `packages/hook/src/recovery.ts`

## Executive Summary

Usage 模块适合做，而且和 VibeTime 当前架构天然相合。

第一性原理看，usage dashboard 需要四类事实：

1. 谁在工作：agent、project、session、turn。
2. 何时工作：turn start/end、usage row timestamp。
3. 用了什么：model、token breakdown。
4. 花了多少：用本地 token * 定价表估算出来的 cost。

当前 hook 已经可靠解决第 1、2 类的大半：project/session/turn/time window。usage 模块不应把 hook 变重，而应新增一个 read-only scanner 去读各工具已有的本地 transcript，再由 reconciler 把 usage rows 归因到 VibeTime turns。

结论分层：

| Agent | 本地 token/cost 可行性 | turn 归因质量 | 建议 |
| --- | --- | --- | --- |
| Codex | 高 | 高 | MVP 必做。原生日志含 token_count、turn_context、task_started/turn_id。 |
| Claude Code | 高 | 中高 | MVP 必做。JSONL assistant usage 稳定，缺原生 turn_id，用 session + transcript + 时间窗归因。 |
| Gemini CLI | 中 | 中 | 不进 MVP。以后再做，本机日志已有 tokens，但格式稳定性低于 Claude/Codex。 |
| Cursor | 低 | 高但无 usage | 不进 MVP。以后再做，当前只保留 hook timeline，不做 token/cost。 |

MVP 范围决策：

- usage scanner：只注册 Claude Code 和 Codex。
- cost estimation：只估算 Claude Code 和 Codex。
- dashboard aggregates：默认只统计 Claude Code 和 Codex 的 usage/cost rows。
- Gemini CLI / Cursor：现阶段不展示 token/cost，不做 unknown usage surface，避免初版范围发散。

因此最稳路线：

1. 保持 hook 当前轻量职责不变。
2. 新增 usage scanner 读本地文件。
3. 新增 attribution/reconciliation 层把 scanner rows 贴到 turns。
4. 新增 ECharts dashboard 做项目、模型、时间、agent、成本趋势分析。
5. cost 全部标为 estimate，带 pricing snapshot version。

## Existing VibeTime Baseline

当前 schema 只有两个核心表：

- `events`: session/turn lifecycle events。
- `open_turns`: crash recovery 和 live state。

`events.meta` 已经保留模型/source/reason 等轻量扩展字段，但没有 token/cost 表。

当前 hook pipeline:

1. 从 stdin 读 agent hook JSON。
2. detect agent。
3. adapter 归一化。
4. resolve project。
5. persist event。
6. notify desktop。

这正是 usage 归因所需的时间轴。不要在 hook 中扫描大文件、算价格、聚合报表；这些应放到后台 scanner 或 app refresh 流程里。

当前 adapter 粒度：

| Agent | 当前 turn id 情况 | 当前 model 情况 |
| --- | --- | --- |
| Codex | hook payload 有 `turn_id` 时直接保存 | session/turn meta 可保存 model |
| Claude Code | 无原生 turn id，当前派生 `${session_id}-${ts}` | session meta 可保存 model |
| Cursor | `generation_id` 可作为 turn_id | `model` 可保存 |
| Gemini CLI | `BeforeAgent` 创建 turn_id，`BeforeModel` 可 enrich 当前 open turn meta | `BeforeModel.llm_request.model` 或 top-level model |

这说明：turn/project/model 归属，hook 已有基础；token/cost 需要另一个数据源。

## Data Source Findings

### Claude Code

成熟项目做法：

- ccusage 读取：
  - `~/.config/claude/projects`
  - `~/.claude/projects`
  - 支持 `CLAUDE_CONFIG_DIR`
- CodexBar 也以这些 project JSONL 为 native cost usage source。

本机观察：

- `~/.claude/projects/**/*.jsonl` 内有 assistant rows。
- 常见字段：
  - `timestamp`
  - `sessionId`
  - `cwd`
  - `message.id`
  - `requestId`
  - `message.model`
  - `message.usage.input_tokens`
  - `message.usage.output_tokens`
  - `message.usage.cache_creation_input_tokens`
  - `message.usage.cache_read_input_tokens`
  - `isSidechain`
  - `agentId`
  - `gitBranch`

去重规则：

- streaming/chunk 场景会出现重复/累积行。
- ccusage 和 CodexBar 的核心思路都是用 `message.id + requestId` 去重。
- 更安全的 row key：`sessionId + message.id + requestId`。
- 同一 key 多行时取最后/最完整 usage row。

turn 归因：

- Claude 本地 usage row 通常没有 VibeTime turn_id。
- Claude hook input 的 common fields 包含 `session_id`、`transcript_path`、`cwd` 等，Stop hook 在每 turn 结束时触发。
- 最稳归因不是“在 transcript 里找 hook 执行记录”，而是：
  1. 用 VibeTime events 建立 turn window。
  2. 用 `session_id` 精筛。
  3. 若 hook meta 保存 transcript file fingerprint/path basename，则再用 transcript 精筛。
  4. 用 usage row timestamp 落入 `[turn_start - grace, turn_end + grace]` 做匹配。
  5. 多候选时选最小窗口、最近 turn_end。

严格性判断：

- 可以做到高置信，不应宣称数学上 100% exact。
- 若一个 Claude turn 内产生多次 assistant/API usage，应该允许一个 turn 对多个 usage rows。
- 若 subagent/sidechain 出现在同 session/time window 内，需要保留 `isSidechain`、`agentId`，UI 可选择 include/exclude。

适合 MVP。

### Codex

成熟项目做法：

- ccusage Codex 读取 `$CODEX_HOME`，默认 `~/.codex`。
- 主要读：
  - `~/.codex/sessions/YYYY/MM/DD/*.jsonl`
  - `~/.codex/archived_sessions/*.jsonl`
- CodexBar 同样读取 native Codex logs，并解析 `event_msg` token_count 和 `turn_context`。

关键日志字段：

- `event_msg` with `payload.type === "token_count"`
- `info.total_token_usage`
- `info.last_token_usage`
- token fields:
  - `input_tokens`
  - `cached_input_tokens`
  - `output_tokens`
  - `reasoning_output_tokens`
  - `total_tokens`
  - `model_context_window`
- `turn_context` carries model metadata。
- `task_started` can carry current turn id in recent logs。
- `rate_limits` can include plan/window metadata。

token delta：

- 优先用 `last_token_usage`，它已经是 delta。
- 若只有 `total_token_usage`，用当前 total 减 previous total。
- `cached_input_tokens` 应 clamp 到 input tokens。
- `reasoning_output_tokens` 只用于展示；Codex/OpenAI billing 里 output 通常已包含 reasoning，不应重复计费。

model：

- `turn_context` 是最可靠的 model bucket。
- 旧日志缺 `turn_context` 时可以 fallback 为 unknown，或像 ccusage 早期兼容那样标 `isFallbackModel`。
- 不建议静默按 `gpt-5` 计价；VibeTime 更应显示 unknown/fallback，避免误导。

turn 归因：

- VibeTime Codex hook 已有 `session_id` 和 `turn_id`。
- Codex transcript 也有 `task_started`/turn id 时，可以 exact join。
- 没有 turn id 时 fallback 到 session + time window。

严格性判断：

- 在四家里 Codex 最接近 strict alignment。
- 可以把 attribution method 标为:
  - `native_turn_id`: high
  - `session_time_window`: medium

适合 MVP。

### Cursor

当前 hook 能拿到：

- `conversation_id` -> session_id
- `generation_id` -> turn_id
- `model`
- `workspace_roots`
- `beforeSubmitPrompt`
- `stop`

本机观察：

- `~/.cursor/projects/**/agent-transcripts/**/*.jsonl` 有消息、tool use、role/content 等。
- 未观察到稳定的 token usage/model cost 字段。
- `~/Library/Application Support/Cursor/logs/**` 有 agent/extension logs，但没有确认可稳定解析 token/cost。
- `~/.cursor/**/store.db` 可能保存 chat state，但不是一个成熟、可承诺的 usage source。

外部材料：

- Cursor marketplace/forum 可见 hooks 存在，如 `beforeSubmitPrompt`、`stop`、`afterAgentResponse` 等。
- 但未找到等价于 Claude/Codex 的稳定 local usage transcript 规范。

结论：

- Cursor 可精确知道“哪个项目、哪个 conversation、哪个 generation、什么 model/default、何时开始/结束”。
- 但纯本地 token/cost 不应承诺。
- MVP 不做 Cursor usage/cost surface；仅继续保留现有 hook timeline 能力。

后续可做专项调查：

- Cursor `store.db` schema。
- Cursor 团队是否暴露 usage API 或本地 usage log。
- 企业/团队 usage 是否只能云端拿。

### Gemini CLI

Status: future work, not MVP.

官方 hook 参考：

- `BeforeAgent`
- `AfterAgent`
- `BeforeModel`
- `AfterModel`
- `SessionStart`
- `SessionEnd`

官方文档中 `BeforeModel`/`AfterModel` 的 stable model API 包含：

- `llm_request.model`
- `llm_response.usageMetadata.totalTokenCount`

本机观察：

- `~/.gemini/tmp/<project-or-hash>/chats/session-*.jsonl` 存在 session chat logs。
- usage rows 可见：
  - `sessionId`
  - `projectHash`
  - `id`
  - `timestamp`
  - `type: "gemini"`
  - `model`
  - `tokens.input`
  - `tokens.output`
  - `tokens.cached`
  - `tokens.thoughts`
  - `tokens.tool`
  - `tokens.total`

注意：

- 同一 `id` 有时出现两行：前一行无 toolCalls，后一行补 toolCalls，但 tokens 一样。
- 去重 row key 建议：`sessionId + id`，若冲突再加 timestamp。
- 同 key 多行取最后/最完整 row。
- 不要持久化 content/thoughts/tool args，只读 token/model/timestamp/id。

turn 归因：

- VibeTime Gemini hook 在 `BeforeAgent` 生成 turn_id，`BeforeModel` enrich model。
- Gemini chat usage rows 未观察到 VibeTime turn_id。
- 用 `sessionId + timestamp window` 归因，confidence medium。
- 若未来 hook 可记录 `llm_request` fingerprint 或 response id，可提高精度，但需避免保存内容。

结论：

- 值得做，但放在 Claude/Codex 之后；初版不实现 scanner、不进费用估算。
- 标为 observed local format，不把它当长期稳定 contract。

## Proposed Architecture

### Components

```text
vendor local logs
    |
    v
usage scanners  -- read-only, incremental, no prompt persistence
    |
    v
usage_records table
    |
    v
reconciler  -- match usage rows to VibeTime turns
    |
    v
Usage dashboard / ECharts / exports
```

### Keep Hook Lightweight

Hook 只保留当前职责：

- 记录 lifecycle events。
- 记录 project/session/turn/timezone/model meta。
- 不扫描 vendor logs。
- 不计算 cost。
- 不做 ECharts 聚合。

可以做的小增强：

- Claude/Codex hook meta 里保存 `transcript_path` 的 basename/hash 或 root-relative path，而非完整绝对路径。
- 保存 source root type，如 `claude-projects`, `codex-sessions`。
- 保存 hook payload 中已有且非敏感的 native ids。

不建议：

- hook 内读整个 JSONL。
- hook 内解析 prompt/content。
- hook 内联网查价格。

### Suggested Schema

新增表：`usage_records`

```sql
CREATE TABLE usage_records (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version         INTEGER NOT NULL DEFAULT 1,
    agent                  TEXT    NOT NULL,
    source_kind            TEXT    NOT NULL,
    source_file_key        TEXT    NOT NULL,
    source_row_key         TEXT    NOT NULL,
    session_id             TEXT,
    turn_id                TEXT,
    project                TEXT,
    usage_ts               REAL    NOT NULL,
    timezone               TEXT    NOT NULL,
    model                  TEXT,
    input_tokens           INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens    INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens          INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens       INTEGER NOT NULL DEFAULT 0,
    tool_tokens            INTEGER NOT NULL DEFAULT 0,
    total_tokens           INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd     REAL,
    currency               TEXT    NOT NULL DEFAULT 'USD',
    pricing_source         TEXT,
    pricing_version        TEXT,
    attribution_method     TEXT    NOT NULL,
    attribution_confidence TEXT    NOT NULL,
    meta                   TEXT
);
```

Unique index:

```sql
CREATE UNIQUE INDEX idx_usage_unique_source
ON usage_records(agent, source_file_key, source_row_key);
```

Query indices:

```sql
CREATE INDEX idx_usage_ts ON usage_records(usage_ts);
CREATE INDEX idx_usage_project_ts ON usage_records(project, usage_ts);
CREATE INDEX idx_usage_agent_model_ts ON usage_records(agent, model, usage_ts);
CREATE INDEX idx_usage_turn_id ON usage_records(turn_id) WHERE turn_id IS NOT NULL;
```

新增表：`usage_scan_state`

```sql
CREATE TABLE usage_scan_state (
    scanner         TEXT NOT NULL,
    root_key        TEXT NOT NULL,
    source_file_key TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL,
    mtime_ms        INTEGER NOT NULL,
    parsed_offset   INTEGER NOT NULL DEFAULT 0,
    last_scanned_at REAL    NOT NULL,
    meta            TEXT,
    PRIMARY KEY (scanner, root_key, source_file_key)
);
```

说明：

- `source_file_key` 不要默认存完整绝对路径；可用 known root + relative path，或 hash + basename。
- DB 是本地，但导出/截图/issue 里绝对路径会泄露用户名和项目结构。
- `meta` 可存 provider-specific details，但不能存 prompt/content/tool args。

### Reconciler

输入：

- `events` 里的 turn windows。
- scanner 产生的 `usage_records`。

turn window 构建：

- `turn_start.ts` 到对应 `turn_end.ts`。
- 若 turn still open，用 `next turn_start` 或 now。
- 对 crash/orphan turns，使用 recovery 后的 synthetic end。

匹配优先级：

1. `agent + native turn_id` exact match。
2. `agent + session_id + usage_ts in [start - 2s, end + 15s]`。
3. `agent + project + usage_ts in window`，仅作 low confidence fallback。
4. 未匹配则保留为 unassigned，不丢数据。

多候选 tie-break：

1. 最小包含窗口。
2. usage_ts 最接近 turn_end。
3. 最新 turn_start。

confidence：

| Method | Confidence |
| --- | --- |
| `native_turn_id` | high |
| `session_transcript_time_window` | high/medium |
| `session_time_window` | medium |
| `project_time_window` | low |
| `unassigned` | none |

关键点：

- 一个 turn 可以有多个 usage rows。
- 一个 session 可以跨多个项目时，project 以 hook event 为准；scanner cwd 只作 fallback。
- model attribution 以 usage row model 为准；turn meta model 只在缺失时补。
- 一个 turn 多模型时，UI 显示 mixed，并给 breakdown。

## Cost Estimation

成本只能叫 estimated cost。

原因：

- 本地 logs 不一定包括所有云端收费项。
- vendor 定价会变。
- enterprise/team plan、credits、discount、included quota 不一定可本地推导。
- web search、tools、remote agent、subscription quota 不一定能从 transcript 精确还原。

定价来源建议：

1. 先内置一个 versioned pricing snapshot。
2. 后续可从 LiteLLM pricing dataset 或 models.dev 拉取并缓存。
3. 每条 cost 记录保存 `pricing_source` 和 `pricing_version`。
4. 无价格或模型别名未知时 cost = null，不要按错模型硬算。

provider rules：

- Codex/OpenAI:
  - non-cached input * input price。
  - cached input * cache-read price，缺失则 fallback input price 或 cost unknown。
  - output * output price。
  - reasoning tokens 展示但不额外计费，避免双算。
- Claude:
  - input tokens、cache creation、cache read、output 分别按 Anthropic pricing rule。
  - 若 row 自带 `costUSD`，可保留 original_cost_usd，同时仍可计算 estimated_cost_usd 供一致聚合。
- Gemini:
  - future work，不进 MVP。
- Cursor:
  - future work，不进 MVP。

## UI Opportunities With ECharts

Usage 模块可以比 CodexBar/ccusage 更适合 VibeTime，因为我们有项目/turn timeline。

建议首屏指标：

- Today cost estimate。
- Today tokens。
- Active model mix。
- Project cost ranking。
- Cost per productive hour / per turn。
- Unknown/unattributed rows count。

图表：

- Daily stacked cost by agent/model。
- Token breakdown: input/cache/output/reasoning。
- Project x model heatmap。
- Turn scatter: duration vs estimated cost。
- Per-session waterfall。
- Mixed model turn breakdown。
- Unassigned usage audit table。

过滤：

- date range。
- agent。
- project。
- model。
- include/exclude subagents。
- include/exclude low confidence attribution。

必须展示的信任信息：

- cost is estimated。
- per-row attribution confidence。
- unknown cost/model rows 不应被隐藏。

## MVP Implementation Plan

### Phase 1: Data Model And Scanner Skeleton

- Add usage schema DDL and migration path。
- Add scanner interfaces in core:
  - `scanUsage(options): UsageRecord[]`
  - provider-specific parsers。
- Add read-only debug command:
  - scan last N days。
  - print counts by source/model/agent。
  - no UI yet。

### Phase 2: Codex Scanner

- Read `$CODEX_HOME/sessions` and `$CODEX_HOME/archived_sessions`。
- Parse JSONL incrementally。
- Track `session_meta` / `turn_context` / `task_started` / `token_count`。
- Use `last_token_usage` or total delta。
- Store native turn_id when available。
- Reconcile to VibeTime turn_id。

### Phase 3: Claude Scanner

- Read `CLAUDE_CONFIG_DIR` roots plus defaults。
- Parse assistant message usage only。
- Deduplicate by `sessionId + message.id + requestId`。
- Preserve `isSidechain`, `agentId` in meta。
- Reconcile by session + transcript/time window。

### Phase 4: Aggregation Queries

- Daily/monthly/session/project/model aggregates。
- Confidence-aware aggregates。
- Unknown/unassigned audit query。
- Cost estimate query with pricing snapshot。

### Phase 5: Desktop Usage Page

- Add route/nav item: Usage。
- Reuse existing ECharts setup。
- Add date range and filters。
- Show trust/unknown states explicitly。

### Out Of MVP

- Gemini scanner。
- Cursor usage/cost surface。
- Any cloud dashboard/API integration。
- Online pricing refresh。

## Strict Turn Window Answer

不能统一说“严格对齐每个 turn”，要按 agent 分。

| Agent | 是否可严格对齐 | 原因 |
| --- | --- | --- |
| Codex | 基本可以 | native logs 有 turn/task markers，hook 也有 turn_id。 |
| Claude Code | 高置信但非绝对 | native usage row 没 VibeTime turn_id；靠 session/transcript/time window。 |
| Cursor | 不进 MVP | hook 有 generation_id；但本地 usage rows 不稳定。 |
| Gemini CLI | 不进 MVP | hook 有 turn timeline，chat logs 有 tokens，但 token rows 未见 turn_id。 |

“文件里面找 hook 的执行来匹配每一个 turn”不是主方案。

更稳的是：

- hook 负责生成 authoritative turn window。
- scanner 负责提取 native usage rows。
- reconciler 用 native id 优先，其次 session + transcript + time window。
- 每条 usage row 存 attribution method/confidence。

对 Claude 来说，若 transcript 内确实有 hook output 记录，也只能作为辅助线索；不要依赖它作为唯一匹配机制，因为 hook output、格式和保存策略可能变。

## Risks

1. Vendor log format changes.
   - Mitigation: scanner versioning, parser tests with fixtures, unknown rows preserved.

2. Duplicate usage rows.
   - Mitigation: provider-specific row keys and final-row-wins policy.

3. Cost inaccuracy.
   - Mitigation: estimated label, pricing version, null on unknown model.

4. Privacy leaks.
   - Mitigation: never persist prompt/content/tool args; avoid absolute path persistence; local-only read.

5. Large transcript performance.
   - Mitigation: scan state by mtime/size/offset; background refresh; date window.

6. Subagents and sidechains.
   - Mitigation: preserve provider flags and expose include/exclude toggle.

7. Mixed-model turns.
   - Mitigation: aggregate by usage row model, display mixed at turn level.

8. Ambiguous attribution.
   - Mitigation: confidence column and unassigned audit table.

## Open Decisions

1. Should subagent/sidechain usage count into parent project totals by default?
   - Recommendation: yes for project totals, but make it filterable.

2. Should VibeTime store source file paths?
   - Recommendation: store root-relative path or hash+basename, not full absolute path.

3. Should we fetch pricing online?
   - Recommendation: not in MVP. Bundle snapshot first; add manual refresh later.

4. Should Cursor `store.db` be reverse-engineered now?
   - Recommendation: no. Defer until Claude/Codex usage is solid.

5. Should we modify hooks to capture more data now?
   - Recommendation: only add non-sensitive ids/file fingerprints if needed. Keep hook fast and durable.

## Final Recommendation

Build the usage module.

The product value is strong because VibeTime has what ccusage and CodexBar lack by default: project/turn timeline across multiple agents. But implementation must be honest about data quality:

- Initial usage/cost support should include only Codex and Claude Code.
- Gemini is promising, but should wait until Claude/Codex are solid.
- Cursor should wait until a stable local usage source exists.

The correct core abstraction is not “one agent = one parser = exact cost”; it is:

```text
usage row + attribution confidence + pricing snapshot
```

This keeps the dashboard useful today and prevents misleading precision.
