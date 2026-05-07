export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

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

export interface VibetimeConfig {
  projects: Record<string, string>
  display: { timezone: string }
  app: {
    open_at_login: boolean
    auto_launch_prompted: boolean
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

export interface HistorySummary {
  periodDays: 7 | 30 | 90 | 365
  calendar: HistoryCalendarDay[]
  trendProjects: string[]
  trends: HistoryTrendDay[]
  topProjects: TopProjectRow[]
}

export interface MenubarState {
  todayTotal: number
  active: boolean
  projects: Array<{ name: string; total: number }>
  activeTurns: ActiveTurn[]
}

export interface AppPreferences {
  openAtLogin: boolean
  autoLaunchPrompted: boolean
  lastView: string
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
  showMainWindow: { args: { route?: string }; result: undefined }
  installAgent: { args: { agent: string }; result: undefined }
  uninstallAgent: { args: { agent: string }; result: undefined }
}

export type IpcChannel = keyof IpcMethods

export type IpcPushEvent = {
  type: 'db-changed'
  agent?: string
  event_type?: string
  session_id?: string
  project?: string
  ts?: number
}
