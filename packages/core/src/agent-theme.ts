const DEFAULT_AGENT_COLOR_HEX = [
  '#3b82f6',
  '#f43f5e',
  '#f59e0b',
  '#64748b',
  '#10b981',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
]

const FALLBACK_AGENT_COLOR_HEX = DEFAULT_AGENT_COLOR_HEX[0] ?? '#737373'

const BRAND_AGENT_COLOR_HEX: Record<string, string> = {
  'claude-code': '#f97316',
  codex: '#10b981',
  cursor: '#22d3ee',
  'gemini-cli': '#8b5cf6',
}

export function getAgentColorHex(agent: string, index: number): string {
  return (
    BRAND_AGENT_COLOR_HEX[agent] ??
    DEFAULT_AGENT_COLOR_HEX[index % DEFAULT_AGENT_COLOR_HEX.length] ??
    FALLBACK_AGENT_COLOR_HEX
  )
}
