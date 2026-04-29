export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

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

export interface OpenTurn {
  turn_id: string
  agent: string
  project: string
  session_id: string
  started_at: number
  timezone: string
  elapsed: number
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
  getTodaySummary: { args: void; result: TodaySummary }
  getOpenTurns: { args: void; result: OpenTurn[] }
  getAgentStatus: { args: void; result: AgentStatus[] }
  getConfig: { args: void; result: VibetimeConfig }
  updateConfig: { args: Partial<VibetimeConfig>; result: void }
  installAgent: { args: { agent: string }; result: void }
}

export type IpcChannel = keyof IpcMethods

export type IpcPushEvent =
  | { type: 'db-changed' }
