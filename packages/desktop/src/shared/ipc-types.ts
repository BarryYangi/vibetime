import type {
  UsageAuditRow,
  UsageDailySummaryRow,
  UsageDataQualitySummary,
  UsageEfficiencySummary,
  UsagePeriodComparison,
  UsageProjectModelMatrixCell,
  UsageSummaryBreakdownRow,
  UsageSummaryTotals,
  UsageTokenBreakdown,
} from '@vibetime/core'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const APP_LANGUAGES = ['en', 'zh'] as const
export const APP_THEMES = ['system', 'light', 'dark'] as const
export const HISTORY_PERIODS = [7, 30, 90, 365] as const
export const USAGE_AGENTS = ['claude-code', 'codex'] as const
export const USAGE_AGENT_FILTERS = ['all', 'claude-code', 'codex'] as const
export const USAGE_REFRESH_FREQUENCIES = ['manual', '1m', '2m', '5m', '15m', '30m'] as const

export interface TodaySummary {
  date: string
  grandTotal: number
  projects: Array<{
    name: string
    total: number
    agents: Array<{ agent: string; total: number }>
  }>
  turnCount: number
  activeProjectCount: number
}

export interface ActiveTurn {
  turn_id: string
  agent: string
  project: string
  session_id: string
  started_at: number
  timezone: string
}

export interface TodayLiveState {
  revision: number
  serverNow: number
  dayStart: number
  completed: TodaySummary
  activeTurns: ActiveTurn[]
}

export interface AgentStatus {
  agent: string
  installed: boolean
}

export type AppLanguage = (typeof APP_LANGUAGES)[number]
export type AppTheme = (typeof APP_THEMES)[number]
export type HistoryPeriodDays = (typeof HISTORY_PERIODS)[number]
export type UsageAgent = (typeof USAGE_AGENTS)[number]
export type UsageAgentFilter = (typeof USAGE_AGENT_FILTERS)[number]
export type UsageRefreshFrequency = (typeof USAGE_REFRESH_FREQUENCIES)[number]
export type UsagePricingStatus =
  | 'fresh'
  | 'cached'
  | 'refresh_failed_with_cache'
  | 'refresh_failed_without_cache'

export interface VibetimeConfig {
  projects: Record<string, string>
  display: { timezone: string }
  app: {
    language: AppLanguage
    open_at_login: boolean
    theme: AppTheme
    last_view: string
    usage_refresh_frequency: UsageRefreshFrequency
  }
}

export interface HistoryCalendarDay {
  date: string
  total: number
}

export interface HistoryTrendDay {
  date: string
  projects: Record<string, number>
}

export interface TopProjectRow {
  project: string
  total: number
  turns: number
  lastActive: number | null
}

export interface HistoryHourlyCell {
  weekday: number
  hour: number
  total: number
}

export interface HistoryTurnDuration {
  project: string
  agent: string
  turnId: string | null
  startedAt: number
  endedAt: number
  duration: number
}

export interface HistoryProjectAgentTotal {
  project: string
  total: number
  agents: Array<{ agent: string; total: number; turns: number }>
}

export interface HistoryPeriodCompare {
  currentTotal: number
  previousTotal: number
  delta: number
  deltaRatio: number | null
}

export interface HistorySummary {
  periodDays: HistoryPeriodDays
  calendar: HistoryCalendarDay[]
  trendProjects: string[]
  trends: HistoryTrendDay[]
  topProjects: TopProjectRow[]
  hourlyMatrix: HistoryHourlyCell[]
  turnDurations: HistoryTurnDuration[]
  projectAgentTotals: HistoryProjectAgentTotal[]
  periodCompare: HistoryPeriodCompare
}

export interface UsageSummaryArgs {
  periodDays: HistoryPeriodDays
  agent?: UsageAgentFilter
  project?: string | null
  model?: string | null
  includeSidechain?: boolean
}

export interface UsageAvailableFilters {
  agents: UsageAgent[]
  models: string[]
  projects: string[]
}

export interface UsageSummary {
  periodDays: HistoryPeriodDays
  totals: UsageSummaryTotals
  daily: UsageDailySummaryRow[]
  pricingStatus: UsagePricingStatus
  tokenBreakdown: UsageTokenBreakdown
  byAgent: UsageSummaryBreakdownRow[]
  byModel: UsageSummaryBreakdownRow[]
  byProject: UsageSummaryBreakdownRow[]
  projectModelMatrix: UsageProjectModelMatrixCell[]
  efficiency: UsageEfficiencySummary
  periodCompare?: UsagePeriodComparison
  dataQuality: UsageDataQualitySummary
  auditRows: UsageAuditRow[]
  availableFilters: UsageAvailableFilters
}

export interface UsageRefreshResult {
  frequency: UsageRefreshFrequency
  scannedAt: number
  recordsFound: number
  recordsInserted: number
  pricingStatus: UsagePricingStatus
}

export interface UsageRefreshStateSnapshot {
  status: 'idle' | 'loading' | 'success' | 'error'
  error: string | null
  lastResult: UsageRefreshResult | null
}

export interface MenubarState {
  todayTotal: number
  active: boolean
  projects: Array<{ name: string; total: number }>
  activeTurns: ActiveTurn[]
}

export interface AppPreferences {
  language: AppLanguage
  openAtLogin: boolean
  theme: AppTheme
  lastView: string
  usageRefreshFrequency: UsageRefreshFrequency
}

export interface CliInstallStatus {
  installed: boolean
  linkPath: string
  targetPath: string
  binDir: string
  binDirInPath: boolean
  conflict: boolean
}

export interface AppInfo {
  version: string
  commitHash: string
  dbPath: string
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'error'

export interface AppUpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  error: string | null
  lastCheckedAt: number | null
}

export interface IpcMethods {
  getTodayLiveState: { args: undefined; result: TodayLiveState }
  getHistorySummary: { args: { periodDays: 7 | 30 | 90 | 365 }; result: HistorySummary }
  getUsageSummary: { args: UsageSummaryArgs; result: UsageSummary }
  getUsageRefreshState: { args: undefined; result: UsageRefreshStateSnapshot }
  refreshUsage: { args: undefined; result: UsageRefreshResult }
  getMenubarState: { args: undefined; result: MenubarState }
  getAgentStatus: { args: undefined; result: AgentStatus[] }
  getConfig: { args: undefined; result: VibetimeConfig }
  updateConfig: { args: Partial<VibetimeConfig>; result: undefined }
  getAppPreferences: { args: undefined; result: AppPreferences }
  updateAppPreferences: { args: Partial<AppPreferences>; result: AppPreferences }
  getCliInstallStatus: { args: undefined; result: CliInstallStatus }
  installCli: { args: undefined; result: CliInstallStatus }
  uninstallCli: { args: undefined; result: CliInstallStatus }
  getAppInfo: { args: undefined; result: AppInfo }
  getUpdateState: { args: undefined; result: AppUpdateState }
  runUpdateCheck: { args: undefined; result: AppUpdateState }
  runUpdateAction: { args: undefined; result: AppUpdateState }
  openGitHubRepository: { args: undefined; result: undefined }
  showMainWindow: { args: { route?: string }; result: undefined }
  installAgent: { args: { agent: string }; result: undefined }
  uninstallAgent: { args: { agent: string }; result: undefined }
}

export type IpcChannel = keyof IpcMethods

export type IpcPushEvent = {
  type:
    | 'db-changed'
    | 'update-state-changed'
    | 'usage-changed'
    | 'usage-refresh-started'
    | 'usage-refresh-finished'
  agent?: string
  event_type?: string
  session_id?: string
  project?: string
  ts?: number
  usageRefresh?: UsageRefreshResult
  error?: string
}
