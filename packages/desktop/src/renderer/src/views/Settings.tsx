import { useAtomValue } from 'jotai'
import { useEffect, useId, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { AppPreferences } from '../../../shared/ipc-types'
import {
  agentStatusAtom,
  appPreferencesAtom,
  cliStatusAtom,
  configAtom,
  refreshAgentStatus,
  refreshCliStatus,
  store,
} from '../store'

const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', description: 'Anthropic Claude Code CLI' },
  { id: 'codex', name: 'Codex', description: 'OpenAI Codex CLI' },
  { id: 'cursor', name: 'Cursor', description: 'Cursor IDE' },
  { id: 'gemini-cli', name: 'Gemini CLI', description: 'Google Gemini CLI' },
] as const

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-[14px] font-semibold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">{description}</p>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-border/55 bg-card shadow-sm shadow-black/[0.02]">
        <div className="flex flex-col divide-y divide-border/40">{children}</div>
      </div>
    </section>
  )
}

function SettingsRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 p-4', className)}>{children}</div>
  )
}

function ConnectAgents() {
  const statuses = useAtomValue(agentStatusAtom)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleInstall = async (agent: string) => {
    setActiveAction(`${agent}:install`)
    setError(null)
    const result = await window.api.invoke('installAgent', { agent })
    if (result.ok) {
      await refreshAgentStatus()
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
      await refreshAgentStatus()
    } else {
      setError(result.error)
    }
    setActiveAction(null)
  }

  const handleToggle = (agent: string, checked: boolean) => {
    if (checked) {
      void handleInstall(agent)
      return
    }
    void handleUninstall(agent)
  }

  return (
    <SettingsSection
      title="Agent Hooks"
      description="Manage VibeTime hooks for your AI agents without touching other configurations."
    >
      {AGENTS.map(({ id, name, description }) => {
        const status = statuses?.find((s) => s.agent === id)
        const statusKnown = status !== undefined
        const isInstalled = status?.installed ?? false
        const isInstalling = activeAction === `${id}:install`
        const isUninstalling = activeAction === `${id}:uninstall`
        const isBusy = isInstalling || isUninstalling
        const labelId = `agent-hook-${id}`

        return (
          <SettingsRow key={id}>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-foreground" id={labelId}>
                {name}
              </div>
              <div className="mt-1 text-[13px] text-muted-foreground leading-snug">
                {description}
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end">
              <Switch
                aria-labelledby={labelId}
                checked={isInstalled}
                disabled={isBusy || !statusKnown}
                onCheckedChange={(checked) => handleToggle(id, checked)}
              />
            </div>
          </SettingsRow>
        )
      })}
      {error && (
        <div className="bg-destructive/5 px-4 py-3 text-[13px] text-destructive-foreground">
          {error}
        </div>
      )}
    </SettingsSection>
  )
}

function AppPreferencesSection() {
  const openAtLoginLabelId = useId()
  const preferences = useAtomValue(appPreferencesAtom)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePreferences = async (patch: Partial<AppPreferences>) => {
    setSaving(true)
    setError(null)
    const result = await window.api.invoke('updateAppPreferences', patch)
    if (result.ok) {
      store.set(appPreferencesAtom, result.data)
    } else {
      setError(result.error)
    }
    setSaving(false)
  }

  const openAtLogin = preferences?.openAtLogin ?? false

  return (
    <SettingsSection title="App Startup" description="Control the VibeTime menubar lifecycle.">
      <SettingsRow>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-foreground" id={openAtLoginLabelId}>
            Open at login
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
            Keep VibeTime available in the menu bar after sign in.
          </p>
        </div>
        <Switch
          aria-labelledby={openAtLoginLabelId}
          checked={openAtLogin}
          disabled={!preferences || saving}
          onCheckedChange={(checked) => updatePreferences({ openAtLogin: checked })}
        />
      </SettingsRow>
      {error && (
        <div className="bg-destructive/5 px-4 py-3 text-[13px] text-destructive-foreground">
          {error}
        </div>
      )}
    </SettingsSection>
  )
}

function displayHomePath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~')
}

function CliSection() {
  const cliLabelId = useId()
  const status = useAtomValue(cliStatusAtom)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateCli = async (checked: boolean) => {
    setSaving(true)
    setError(null)
    const result = await window.api.invoke(checked ? 'installCli' : 'uninstallCli')
    if (result.ok) {
      store.set(cliStatusAtom, result.data)
    } else {
      setError(result.error)
      await refreshCliStatus()
    }
    setSaving(false)
  }

  const installed = status?.installed ?? false

  return (
    <SettingsSection
      title="Command Line"
      description="Expose the stable VibeTime command in your shell."
    >
      <SettingsRow>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-foreground" id={cliLabelId}>
            Install CLI tool
          </div>
          <p className="mt-1 break-all text-[13px] text-muted-foreground leading-snug">
            {status
              ? `${displayHomePath(status.linkPath)} → ${displayHomePath(status.targetPath)}`
              : 'Checking CLI link...'}
          </p>
        </div>
        <Switch
          aria-labelledby={cliLabelId}
          checked={installed}
          disabled={!status || saving || status.conflict}
          onCheckedChange={updateCli}
        />
      </SettingsRow>

      {status && !status.binDirInPath && (
        <div className="bg-muted/20 px-4 py-3 text-[13px] text-muted-foreground">
          Add <span className="font-mono text-foreground">{displayHomePath(status.binDir)}</span> to
          PATH to run vibetime from any shell.
        </div>
      )}

      {status?.conflict && (
        <div className="bg-destructive/5 px-4 py-3 text-[13px] text-destructive-foreground">
          {displayHomePath(status.linkPath)} already exists and is not managed by VibeTime.
        </div>
      )}

      {error && (
        <div className="bg-destructive/5 px-4 py-3 text-[13px] text-destructive-foreground">
          {error}
        </div>
      )}
    </SettingsSection>
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
    <SettingsSection
      title="Project Aliases"
      description="Map raw project directory names to display names. Changes are saved to config.toml."
    >
      <div className="flex flex-col gap-3 p-4">
        {Object.entries(aliases).map(([key, value]) => (
          <div
            key={key}
            className="group flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-foreground">
                {key}
              </span>
              <span className="text-muted-foreground/60 shrink-0">&rarr;</span>
              <span className="min-w-0 truncate text-[13px] font-medium">{value}</span>
            </div>
            <Button
              onClick={() => handleRemove(key)}
              size="xs"
              variant="ghost"
              className="text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              Remove
            </Button>
          </div>
        ))}
        {Object.keys(aliases).length === 0 && (
          <p className="py-2 text-[13px] italic text-muted-foreground">
            No aliases configured yet.
          </p>
        )}

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            type="text"
            placeholder="Directory name"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="flex-1"
          />
          <Input
            type="text"
            placeholder="Display name"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleAdd}
            disabled={!newKey.trim() || !newValue.trim()}
            variant="secondary"
            className="shrink-0"
          >
            Add
          </Button>
        </div>
      </div>
      <div className="bg-muted/20 px-4 py-3">
        <Button onClick={handleSave} disabled={saving} loading={saving}>
          Save Changes
        </Button>
      </div>
    </SettingsSection>
  )
}

function About() {
  const [version, setVersion] = useState('...')
  const [dbPath, setDbPath] = useState('...')

  useEffect(() => {
    window.api.invoke('getAppInfo').then((result) => {
      if (result.ok) {
        setVersion(result.data.version)
        setDbPath(displayHomePath(result.data.dbPath))
      }
    })
  }, [])

  return (
    <section className="space-y-3 pt-6 border-t border-border/40">
      <div className="px-1">
        <h2 className="text-[14px] font-semibold text-foreground">About VibeTime</h2>
        <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
          Build info and local data storage.
        </p>
      </div>
      <div className="px-1 mt-4">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-[13px]">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono text-foreground font-medium">{version}</dd>

          <dt className="text-muted-foreground">Database</dt>
          <dd className="break-all font-mono text-muted-foreground">{dbPath}</dd>

          <dt className="text-muted-foreground">License</dt>
          <dd className="text-foreground">MIT</dd>
        </dl>
      </div>
    </section>
  )
}

export default function Settings() {
  const preferences = useAtomValue(appPreferencesAtom)
  const agentStatus = useAtomValue(agentStatusAtom)
  const cliStatus = useAtomValue(cliStatusAtom)

  // Wait until prefetched data is ready so switches render with correct state
  const ready = preferences !== null && agentStatus !== null && cliStatus !== null

  if (!ready) {
    return <div className="h-full bg-background" />
  }

  return (
    <PageShell prose className="space-y-10 pb-12">
      <header className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-snug">
          Manage your app preferences, CLI tools, and agent hooks.
        </p>
      </header>
      <div className="flex flex-col gap-10">
        <AppPreferencesSection />
        <CliSection />
        <ConnectAgents />
        <ProjectAliases />
        <About />
      </div>
    </PageShell>
  )
}
