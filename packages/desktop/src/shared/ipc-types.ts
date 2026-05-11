export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const APP_LANGUAGES = ['en', 'zh'] as const
export const APP_THEMES = ['system', 'light', 'dark'] as const
export const HISTORY_PERIODS = [7, 30, 90, 365] as const

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

export interface VibetimeConfig {
  projects: Record<string, string>
  display: { timezone: string }
  app: {
    language: AppLanguage
    open_at_login: boolean
    theme: AppTheme
    last_view: string
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
  type: 'db-changed' | 'update-state-changed'
  agent?: string
  event_type?: string
  session_id?: string
  project?: string
  ts?: number
}
