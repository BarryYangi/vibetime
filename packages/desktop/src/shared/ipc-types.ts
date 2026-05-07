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
}

export interface IpcMethods {
  getTodayLiveState: { args: undefined; result: TodayLiveState }
  getAgentStatus: { args: undefined; result: AgentStatus[] }
  getConfig: { args: undefined; result: VibetimeConfig }
  updateConfig: { args: Partial<VibetimeConfig>; result: undefined }
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
