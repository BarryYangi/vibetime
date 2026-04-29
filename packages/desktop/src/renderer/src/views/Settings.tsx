import { useState, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { store, configAtom } from '../store'

// Agent display info
const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', description: 'Anthropic Claude Code CLI' },
  { id: 'codex', name: 'Codex', description: 'OpenAI Codex CLI' },
  { id: 'cursor', name: 'Cursor', description: 'Cursor IDE' },
] as const

function ConnectAgents() {
  const [statuses, setStatuses] = useState<Array<{ agent: string; installed: boolean }>>([])
  const [installing, setInstalling] = useState<string | null>(null)

  useEffect(() => {
    window.api.invoke('getAgentStatus').then((result) => {
      if (result.ok) setStatuses(result.data)
    })
  }, [])

  const handleInstall = async (agent: string) => {
    setInstalling(agent)
    const result = await window.api.invoke('installAgent', { agent })
    if (result.ok) {
      // Refresh status
      const statusResult = await window.api.invoke('getAgentStatus')
      if (statusResult.ok) setStatuses(statusResult.data)
    }
    setInstalling(null)
  }

  return (
    <section className="mb-8">
      <h3 className="text-lg font-semibold text-tn-fg mb-4">Connect Agents</h3>
      <div className="space-y-3">
        {AGENTS.map(({ id, name, description }) => {
          const status = statuses.find(s => s.agent === id)
          const isInstalled = status?.installed ?? false
          const isInstalling = installing === id

          return (
            <div key={id} className="flex items-center justify-between p-3 bg-tn-surface rounded-lg">
              <div>
                <div className="font-medium text-tn-fg">{name}</div>
                <div className="text-sm text-tn-muted">{description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded ${isInstalled ? 'bg-tn-success/20 text-tn-success' : 'bg-tn-muted/20 text-tn-muted'}`}>
                  {isInstalled ? 'Connected' : 'Not connected'}
                </span>
                <button
                  onClick={() => handleInstall(id)}
                  disabled={isInstalling}
                  className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
                    isInstalling
                      ? 'bg-tn-muted/20 text-tn-muted cursor-not-allowed'
                      : isInstalled
                        ? 'bg-tn-surface border border-tn-border text-tn-fg hover:bg-tn-border'
                        : 'bg-tn-primary text-tn-bg hover:bg-tn-primary/80'
                  }`}
                >
                  {isInstalling ? 'Installing...' : isInstalled ? 'Reinstall' : 'Install'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ProjectAliases() {
  const config = useAtomValue(configAtom)
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.invoke('getConfig').then((result) => {
      if (result.ok) {
        store.set(configAtom, result.data)
        setAliases(result.data.projects ?? {})
      }
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const result = await window.api.invoke('updateConfig', { projects: aliases })
    if (result.ok) {
      // Refresh config
      const configResult = await window.api.invoke('getConfig')
      if (configResult.ok) store.set(configAtom, configResult.data)
    }
    setSaving(false)
  }

  const handleAdd = () => {
    if (newKey.trim() && newValue.trim()) {
      setAliases(prev => ({ ...prev, [newKey.trim()]: newValue.trim() }))
      setNewKey('')
      setNewValue('')
    }
  }

  const handleRemove = (key: string) => {
    setAliases(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  return (
    <section className="mb-8">
      <h3 className="text-lg font-semibold text-tn-fg mb-4">Project Aliases</h3>
      <p className="text-sm text-tn-muted mb-4">
        Map project directory names to display names. Changes are saved to config.toml.
      </p>

      {/* Existing aliases */}
      <div className="space-y-2 mb-4">
        {Object.entries(aliases).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-sm font-mono text-tn-accent bg-tn-surface px-2 py-1 rounded flex-shrink-0">{key}</span>
            <span className="text-tn-muted">&rarr;</span>
            <span className="text-sm text-tn-fg flex-1">{value}</span>
            <button
              onClick={() => handleRemove(key)}
              className="text-tn-error hover:text-tn-error/80 text-sm px-2"
            >
              Remove
            </button>
          </div>
        ))}
        {Object.keys(aliases).length === 0 && (
          <p className="text-sm text-tn-muted italic">No aliases configured.</p>
        )}
      </div>

      {/* Add new alias */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Directory name"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          className="flex-1 bg-tn-surface border border-tn-border rounded px-3 py-1.5 text-sm text-tn-fg placeholder-tn-muted focus:outline-none focus:border-tn-primary"
        />
        <input
          type="text"
          placeholder="Display name"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          className="flex-1 bg-tn-surface border border-tn-border rounded px-3 py-1.5 text-sm text-tn-fg placeholder-tn-muted focus:outline-none focus:border-tn-primary"
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim() || !newValue.trim()}
          className="px-3 py-1.5 text-sm rounded font-medium bg-tn-accent text-tn-bg hover:bg-tn-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 text-sm rounded font-medium bg-tn-primary text-tn-bg hover:bg-tn-primary/80 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </section>
  )
}

function About() {
  const [version, setVersion] = useState('...')
  const [dbPath, setDbPath] = useState('...')

  useEffect(() => {
    window.api.invoke('getConfig').then((result) => {
      if (result.ok) {
        // Version comes from the main process; for now use a placeholder
        // The main process will inject this via a getVersion IPC or static value
        setVersion('0.0.0-dev')
        setDbPath('~/.vibetime/data.db')
      }
    })
  }, [])

  return (
    <section>
      <h3 className="text-lg font-semibold text-tn-fg mb-4">About</h3>
      <div className="bg-tn-surface rounded-lg p-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-tn-muted">Version</span>
          <span className="font-mono text-tn-fg">{version}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-tn-muted">Database</span>
          <span className="font-mono text-sm text-tn-accent">{dbPath}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-tn-muted">License</span>
          <span className="text-tn-fg">MIT</span>
        </div>
      </div>
    </section>
  )
}

export default function Settings() {
  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold text-tn-fg mb-6">Settings</h2>
      <ConnectAgents />
      <ProjectAliases />
      <About />
    </div>
  )
}
