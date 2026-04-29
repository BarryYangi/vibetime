import { useIpcQuery } from '../hooks/useIpcQuery'
import { todaySummaryAtom } from '../store'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function ProjectBar({ name, total, agents, maxTotal }: {
  name: string
  total: number
  agents: Array<{ agent: string; total: number }>
  maxTotal: number
}) {
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-tn-fg">{name}</span>
        <span className="text-sm font-mono text-tn-accent">{formatDuration(total)}</span>
      </div>
      <div className="h-2 bg-tn-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-tn-primary to-tn-accent rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      {agents.length > 0 && (
        <div className="flex gap-3 mt-1">
          {agents.map(({ agent, total: agentTotal }) => (
            <span key={agent} className="text-xs text-tn-muted">
              {agent}: {formatDuration(agentTotal)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Today() {
  const summary = useIpcQuery('getTodaySummary', todaySummaryAtom)

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-tn-muted">Loading...</p>
      </div>
    )
  }

  const { date, grandTotal, projects, turnCount, activeProjectCount } = summary
  const maxTotal = projects.length > 0 ? Math.max(...projects.map(p => p.total)) : 0

  // Format date for display
  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (projects.length === 0) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold text-tn-fg mb-1">{displayDate}</h2>
        <p className="text-tn-muted mt-4">No activity today. Start coding to see your time breakdown.</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <h2 className="text-2xl font-bold text-tn-fg mb-1">{displayDate}</h2>

      {/* Grand Total */}
      <div className="mb-6">
        <span className="text-4xl font-mono font-bold text-tn-primary">
          {formatDuration(grandTotal)}
        </span>
        <span className="text-tn-muted ml-2">total today</span>
      </div>

      {/* Per-project breakdown */}
      <div className="space-y-1">
        {projects.map(({ name, total, agents }) => (
          <ProjectBar
            key={name}
            name={name}
            total={total}
            agents={agents}
            maxTotal={maxTotal}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-tn-border">
        <p className="text-sm text-tn-muted">
          {turnCount} turn{turnCount !== 1 ? 's' : ''} across {activeProjectCount} project{activeProjectCount !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
