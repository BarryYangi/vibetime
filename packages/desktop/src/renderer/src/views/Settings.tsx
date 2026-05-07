import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/PageShell'
import type { AppPreferences } from '../../../shared/ipc-types'
import { configAtom, store } from '../store'

const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', description: 'Anthropic Claude Code CLI' },
  { id: 'codex', name: 'Codex', description: 'OpenAI Codex CLI' },
  { id: 'cursor', name: 'Cursor', description: 'Cursor IDE' },
] as const

function ConnectAgents({ onSuccessfulConnection }: { onSuccessfulConnection: () => void }) {
  const [statuses, setStatuses] = useState<Array<{ agent: string; installed: boolean }>>([])
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshStatuses = useCallback(async () => {
    const result = await window.api.invoke('getAgentStatus')
    if (result.ok) setStatuses(result.data)
  }, [])

  useEffect(() => {
    refreshStatuses()
  }, [refreshStatuses])

  const handleInstall = async (agent: string) => {
    setActiveAction(`${agent}:install`)
    setError(null)
    const result = await window.api.invoke('installAgent', { agent })
    if (result.ok) {
      await refreshStatuses()
      onSuccessfulConnection()
    } else {
      setError(result.error)
    }
    setActiveAction(null)
  }

  const handleUninstall = async (agent: string) => {
    setActiveAction(`${agent}:uninstall`)
    setError(null)
    const result = await window.api.invoke('uninstallAgent', { agent })
    if (result.ok) {
      await refreshStatuses()
    } else {
      setError(result.error)
    }
    setActiveAction(null)
  }

  return (
    <section className="space-y-3">
      <h2 className="font-heading font-semibold text-[13px] tracking-[-0.01em] text-foreground">
        Connect agents
      </h2>
      <Card>
        <CardHeader>
          <CardTitle>Hooks</CardTitle>
          <CardDescription>
            Manage VibeTime hooks without touching other agent hooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {AGENTS.map(({ id, name, description }) => {
            const status = statuses.find((s) => s.agent === id)
            const isInstalled = status?.installed ?? false
            const isInstalling = activeAction === `${id}:install`
            const isUninstalling = activeAction === `${id}:uninstall`
            const isBusy = isInstalling || isUninstalling

            return (
              <div
                key={id}
                className="flex flex-col gap-3 rounded-xl bg-muted/35 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${isInstalled ? 'bg-success' : 'bg-muted-foreground'}`}
                    />
                    <div className="text-[15px] font-medium leading-snug">{name}</div>
                    <span className="text-[11px] text-muted-foreground leading-snug">
                      {isInstalled ? 'Hook installed' : 'Not installed'}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] text-muted-foreground leading-snug">{description}</div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  {isInstalled ? (
                    <Button
                      onClick={() => handleUninstall(id)}
                      disabled={isBusy}
                      loading={isUninstalling}
                      size="sm"
                      variant="ghost"
                      className="text-destructive-foreground"
                    >
                      Uninstall Hook
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleInstall(id)}
                      disabled={isBusy}
                      loading={isInstalling}
                      size="sm"
                    >
                      Install
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
          {error && (
            <div className="rounded-lg bg-destructive/8 px-3 py-2 text-[13px] text-destructive-foreground leading-snug">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function AppPreferencesSection({
  onReadyToPrompt,
}: {
  onReadyToPrompt: (preferences: AppPreferences) => void
}) {
  const [preferences, setPreferences] = useState<AppPreferences | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshPreferences = useCallback(async () => {
    const result = await window.api.invoke('getAppPreferences')
    if (result.ok) {
      setPreferences(result.data)
      onReadyToPrompt(result.data)
      if (!result.data.autoLaunchPrompted) setShowPrompt(true)
    } else {
      setError(result.error)
    }
  }, [onReadyToPrompt])

  useEffect(() => {
    refreshPreferences()
  }, [refreshPreferences])

  const updatePreferences = async (patch: Partial<AppPreferences>) => {
    setSaving(true)
    setError(null)
    const result = await window.api.invoke('updateAppPreferences', patch)
    if (result.ok) {
      setPreferences(result.data)
      if (patch.autoLaunchPrompted !== undefined) setShowPrompt(false)
    } else {
      setError(result.error)
    }
    setSaving(false)
  }

  const openAtLogin = preferences?.openAtLogin ?? false

  return (
    <section className="space-y-3">
      <h2 className="font-heading font-semibold text-[13px] tracking-[-0.01em] text-foreground">
        App
      </h2>
      <Card>
        <CardHeader>
          <CardTitle>Startup</CardTitle>
          <CardDescription>Control the menubar timer lifecycle.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-xl bg-muted/35 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[15px] font-medium leading-snug">Open at login</div>
              <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
                Keep VibeTime available in the menu bar after sign in.
              </p>
            </div>
            <Button
              aria-pressed={openAtLogin}
              disabled={!preferences || saving}
              loading={saving}
              onClick={() =>
                updatePreferences({ openAtLogin: !openAtLogin, autoLaunchPrompted: true })
              }
              size="sm"
              variant={openAtLogin ? 'default' : 'outline'}
            >
              {openAtLogin ? 'On' : 'Off'}
            </Button>
          </div>

          {showPrompt && preferences && !preferences.autoLaunchPrompted && (
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="text-[15px] font-medium leading-snug">Open VibeTime at login?</h3>
              <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
                Keep the menubar timer available after you sign in.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={saving}
                  loading={saving}
                  onClick={() => updatePreferences({ openAtLogin: true, autoLaunchPrompted: true })}
                  size="sm"
                >
                  Open at login
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => updatePreferences({ autoLaunchPrompted: true })}
                  size="sm"
                  variant="ghost"
                >
                  Not now
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/8 px-3 py-2 text-[13px] text-destructive-foreground leading-snug">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function ProjectAliases() {
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
      const configResult = await window.api.invoke('getConfig')
      if (configResult.ok) store.set(configAtom, configResult.data)
    }
    setSaving(false)
  }

  const handleAdd = () => {
    if (newKey.trim() && newValue.trim()) {
      setAliases((prev) => ({ ...prev, [newKey.trim()]: newValue.trim() }))
      setNewKey('')
      setNewValue('')
    }
  }

  const handleRemove = (key: string) => {
    setAliases((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  return (
    <section className="space-y-3">
      <h2 className="font-heading font-semibold text-[13px] tracking-[-0.01em] text-foreground">
        Project aliases
      </h2>
      <Card>
        <CardHeader>
          <CardTitle>Directory names</CardTitle>
          <CardDescription>
            Map project directory names to display names. Changes are saved to config.toml.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {Object.entries(aliases).map(([key, value]) => (
              <div
                key={key}
                className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted/35 p-2 sm:flex-row sm:items-center"
              >
                <Badge variant="outline" className="w-fit shrink-0 font-mono">
                  {key}
                </Badge>
                <span className="hidden text-muted-foreground sm:inline">&rarr;</span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug">{value}</span>
                <Button
                  onClick={() => handleRemove(key)}
                  size="xs"
                  variant="ghost"
                  className="self-start text-destructive-foreground sm:self-center"
                >
                  Remove
                </Button>
              </div>
            ))}
            {Object.keys(aliases).length === 0 && (
              <p className="text-[13px] text-muted-foreground italic leading-snug">No aliases configured.</p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Input
              type="text"
              placeholder="Directory name"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="min-w-0 sm:min-w-[8rem] sm:flex-1"
            />
            <Input
              type="text"
              placeholder="Display name"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="min-w-0 sm:min-w-[8rem] sm:flex-1"
            />
            <Button
              onClick={handleAdd}
              disabled={!newKey.trim() || !newValue.trim()}
              variant="secondary"
              className="w-full sm:w-auto"
            >
              Add
            </Button>
          </div>

          <Button onClick={handleSave} disabled={saving} loading={saving} className="self-start">
            Save changes
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

function About() {
  const [version, setVersion] = useState('...')
  const [dbPath, setDbPath] = useState('...')

  useEffect(() => {
    window.api.invoke('getConfig').then((result) => {
      if (result.ok) {
        setVersion('0.0.0-dev')
        setDbPath('~/.vibetime/data.db')
      }
    })
  }, [])

  return (
    <section className="space-y-4 border-border/55 border-t pt-10">
      <div>
        <h2 className="font-heading font-semibold text-[13px] tracking-[-0.01em] text-foreground">
          About
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground leading-snug">Build and local data</p>
      </div>
      <dl className="grid max-w-lg gap-x-8 gap-y-3 text-[13px] leading-snug sm:grid-cols-[7rem_1fr]">
        <dt className="text-muted-foreground">Version</dt>
        <dd className="min-w-0 font-mono">{version}</dd>
        <dt className="text-muted-foreground">Database</dt>
        <dd className="min-w-0 break-all font-mono text-muted-foreground">{dbPath}</dd>
        <dt className="text-muted-foreground">License</dt>
        <dd>MIT</dd>
      </dl>
    </section>
  )
}

export default function Settings() {
  const [promptCandidate, setPromptCandidate] = useState<AppPreferences | null>(null)
  const [promptKey, setPromptKey] = useState(0)
  const maybePromptOpenAtLogin = useCallback(() => {
    if (promptCandidate && !promptCandidate.autoLaunchPrompted) {
      setPromptKey((key) => key + 1)
    }
  }, [promptCandidate])
  const handleReadyToPrompt = useCallback((preferences: AppPreferences) => {
    setPromptCandidate(preferences)
  }, [])

  return (
    <PageShell prose className="space-y-12 pb-12">
      <header>
        <h1 className="font-heading font-semibold text-2xl tracking-[-0.02em] text-foreground">
          Settings
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-snug">
          Hooks, project names, and app info
        </p>
      </header>
      <div className="flex flex-col gap-12">
        <AppPreferencesSection
          key={promptKey}
          onReadyToPrompt={handleReadyToPrompt}
        />
        <ConnectAgents onSuccessfulConnection={maybePromptOpenAtLogin} />
        <ProjectAliases />
        <About />
      </div>
    </PageShell>
  )
}
