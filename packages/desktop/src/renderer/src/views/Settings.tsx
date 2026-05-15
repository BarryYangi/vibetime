import { useAtomValue } from 'jotai'
import { useEffect, useId, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type {
  AppInfo,
  AppLanguage,
  AppPreferences,
  AppTheme,
  AppUpdateState,
  UsageRefreshFrequency,
} from '../../../shared/ipc-types'
import { USAGE_REFRESH_FREQUENCIES } from '../../../shared/ipc-types'
import { APP_LANGUAGES, type TranslationKey, useI18n } from '../i18n'
import {
  agentStatusAtom,
  appPreferencesAtom,
  cliStatusAtom,
  refreshAgentStatus,
  refreshCliStatus,
  refreshUpdateState,
  runUpdateCheck,
  store,
  updateStateAtom,
} from '../store'

const AGENTS = [
  { id: 'claude-code', name: 'Claude Code', descriptionKey: 'settings.agents.claudeDescription' },
  { id: 'codex', name: 'Codex', descriptionKey: 'settings.agents.codexDescription' },
  { id: 'cursor', name: `Cur${'sor'}`, descriptionKey: 'settings.agents.cursorDescription' },
  {
    id: 'gemini-cli',
    name: `Gem${'ini'} CLI`,
    descriptionKey: 'settings.agents.geminiDescription',
  },
] as const

const GITHUB_REPOSITORY_LABEL = 'github.com/BarryYangi/vibetime'

const THEME_OPTIONS: Array<{ labelKey: TranslationKey; value: AppTheme }> = [
  { labelKey: 'settings.theme.system', value: 'system' },
  { labelKey: 'settings.theme.light', value: 'light' },
  { labelKey: 'settings.theme.dark', value: 'dark' },
]

const LANGUAGE_OPTIONS: Array<{
  label: string
  value: AppLanguage
}> = APP_LANGUAGES.map((value) => ({
  label: value === 'zh' ? '中文' : 'English',
  value,
}))

const USAGE_FREQUENCY_OPTIONS: Array<{ labelKey: TranslationKey; value: UsageRefreshFrequency }> =
  USAGE_REFRESH_FREQUENCIES.map((value) => ({
    labelKey: `usage.frequency.${value}` as TranslationKey,
    value,
  }))

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

function GeneralSettingsSection() {
  const themeLabelId = useId()
  const languageLabelId = useId()
  const { t } = useI18n()
  const preferences = useAtomValue(appPreferencesAtom)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePreferences = async (patch: Partial<AppPreferences>) => {
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.invoke('updateAppPreferences', patch)
      if (result.ok) {
        store.set(appPreferencesAtom, result.data)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const theme = preferences?.theme ?? 'system'
  const language = preferences?.language ?? 'en'
  const themeItems = THEME_OPTIONS.map((item) => ({
    label: t(item.labelKey),
    value: item.value,
  }))

  return (
    <SettingsSection
      title={t('settings.general.title')}
      description={t('settings.general.description')}
    >
      <SettingsRow>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-foreground" id={themeLabelId}>
            {t('settings.general.theme')}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
            {t('settings.general.themeDescription')}
          </p>
        </div>
        <Select
          aria-labelledby={themeLabelId}
          disabled={!preferences || saving}
          items={themeItems}
          onValueChange={(value) => {
            if (value) void updatePreferences({ theme: value as AppTheme })
          }}
          value={theme}
        >
          <SelectTrigger className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {themeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </SettingsRow>
      <SettingsRow>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-foreground" id={languageLabelId}>
            {t('settings.general.language')}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
            {t('settings.general.languageDescription')}
          </p>
        </div>
        <Select
          aria-labelledby={languageLabelId}
          disabled={!preferences || saving}
          items={LANGUAGE_OPTIONS}
          onValueChange={(value) => {
            if (value) void updatePreferences({ language: value as AppLanguage })
          }}
          value={language}
        >
          <SelectTrigger className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {LANGUAGE_OPTIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </SettingsRow>
      {error && (
        <div className="bg-destructive/5 px-4 py-3 text-[13px] text-destructive-foreground">
          {error}
        </div>
      )}
    </SettingsSection>
  )
}

function ConnectAgents() {
  const { t } = useI18n()
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
      title={t('settings.agents.title')}
      description={t('settings.agents.description')}
    >
      {AGENTS.map(({ id, name, descriptionKey }) => {
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
                {t(descriptionKey)}
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
  const usageRefreshLabelId = useId()
  const { t } = useI18n()
  const preferences = useAtomValue(appPreferencesAtom)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePreferences = async (patch: Partial<AppPreferences>) => {
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.invoke('updateAppPreferences', patch)
      if (result.ok) {
        store.set(appPreferencesAtom, result.data)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const openAtLogin = preferences?.openAtLogin ?? false
  const usageRefreshFrequency = preferences?.usageRefreshFrequency ?? '30m'
  const usageFrequencyItems = USAGE_FREQUENCY_OPTIONS.map((item) => ({
    label: t(item.labelKey),
    value: item.value,
  }))

  return (
    <SettingsSection
      title={t('settings.startup.title')}
      description={t('settings.startup.description')}
    >
      <SettingsRow>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-foreground" id={openAtLoginLabelId}>
            {t('settings.startup.openAtLogin')}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
            {t('settings.startup.openAtLoginDescription')}
          </p>
        </div>
        <Switch
          aria-labelledby={openAtLoginLabelId}
          checked={openAtLogin}
          disabled={!preferences || saving}
          onCheckedChange={(checked) => updatePreferences({ openAtLogin: checked })}
        />
      </SettingsRow>
      <SettingsRow>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-foreground" id={usageRefreshLabelId}>
            {t('usage.refreshFrequency')}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
            {t('usage.refreshFrequencyDescription')}
          </p>
        </div>
        <Select
          aria-labelledby={usageRefreshLabelId}
          disabled={!preferences || saving}
          items={usageFrequencyItems}
          onValueChange={(value) => {
            if (value) {
              void updatePreferences({ usageRefreshFrequency: value as UsageRefreshFrequency })
            }
          }}
          value={usageRefreshFrequency}
        >
          <SelectTrigger className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {usageFrequencyItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
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

function updateStatusText(
  status: AppUpdateState['status'],
  availableVersion: string | null | undefined,
  lastChecked: string | null,
  locale: string,
  t: (key: TranslationKey) => string,
) {
  if (status === 'available') {
    const label = t('settings.update.statusAvailableNoVersion')
    const versionText = availableVersion
      ? locale.startsWith('zh')
        ? `${label}：${availableVersion}`
        : `${label}: ${availableVersion}`
      : label
    if (!lastChecked) return versionText
    return `${versionText} · ${t('settings.update.lastChecked')}: ${lastChecked}`
  }
  return `${t('settings.update.lastChecked')}: ${lastChecked ?? t('settings.update.neverChecked')}`
}

function formatLastChecked(timestamp: number | null | undefined, locale: string): string | null {
  if (!timestamp) return null
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function CliSection() {
  const cliLabelId = useId()
  const { t } = useI18n()
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
    <SettingsSection title={t('settings.cli.title')} description={t('settings.cli.description')}>
      <SettingsRow>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-foreground" id={cliLabelId}>
            {t('settings.cli.install')}
          </div>
          <p className="mt-1 break-all text-[13px] text-muted-foreground leading-snug">
            {status
              ? `${displayHomePath(status.linkPath)} → ${displayHomePath(status.targetPath)}`
              : t('settings.cli.checking')}
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
          {t('settings.cli.addPathPrefix')}{' '}
          <span className="font-mono text-foreground">{displayHomePath(status.binDir)}</span>{' '}
          {t('settings.cli.addPathSuffix')}
        </div>
      )}

      {status?.conflict && (
        <div className="bg-destructive/5 px-4 py-3 text-[13px] text-destructive-foreground">
          {displayHomePath(status.linkPath)} {t('settings.cli.conflictSuffix')}
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
  const { t } = useI18n()
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.invoke('getConfig').then((result) => {
      if (result.ok) {
        setAliases(result.data.projects ?? {})
      }
    })
  }, [])

  const persistAliases = async (next: Record<string, string>) => {
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.invoke('updateConfig', { projects: next })
      if (!result.ok) {
        setError(result.error)
        return false
      }
      setAliases(next)
      return true
    } catch (err) {
      setError(String(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    const key = newKey.trim()
    const value = newValue.trim()
    if (key && value) {
      const saved = await persistAliases({ ...aliases, [key]: value })
      if (!saved) return
      setNewKey('')
      setNewValue('')
    }
  }

  const handleRemove = async (key: string) => {
    const next = { ...aliases }
    delete next[key]
    await persistAliases(next)
  }

  return (
    <SettingsSection
      title={t('settings.aliases.title')}
      description={t('settings.aliases.description')}
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
              disabled={saving}
              onClick={() => handleRemove(key)}
              size="xs"
              variant="ghost"
              className="text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              {t('common.remove')}
            </Button>
          </div>
        ))}
        {Object.keys(aliases).length === 0 && (
          <p className="py-2 text-[13px] italic text-muted-foreground">
            {t('settings.aliases.empty')}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            type="text"
            placeholder={t('settings.aliases.directoryPlaceholder')}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="flex-1"
          />
          <Input
            type="text"
            placeholder={t('settings.aliases.displayPlaceholder')}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleAdd}
            disabled={saving || !newKey.trim() || !newValue.trim()}
            variant="secondary"
            className="shrink-0"
          >
            {t('common.add')}
          </Button>
        </div>
        {error && <p className="text-[13px] text-destructive-foreground">{error}</p>}
      </div>
    </SettingsSection>
  )
}

function About() {
  const { t, locale } = useI18n()
  const updateState = useAtomValue(updateStateAtom)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [dbPath, setDbPath] = useState('...')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.invoke('getAppInfo').then((result) => {
      if (result.ok) {
        setAppInfo(result.data)
        setDbPath(displayHomePath(result.data.dbPath))
      }
    })
    void refreshUpdateState()
  }, [])

  const status = updateState?.status ?? 'idle'
  const busy = running || status === 'checking'
  const lastChecked = formatLastChecked(updateState?.lastCheckedAt, locale)
  const versionText = appInfo
    ? appInfo.commitHash
      ? `${appInfo.version} (${appInfo.commitHash})`
      : appInfo.version
    : '...'

  const handleUpdateAction = async () => {
    setRunning(true)
    setError(null)
    try {
      await runUpdateCheck()
    } catch (err) {
      setError(String(err))
    } finally {
      await refreshUpdateState()
      setRunning(false)
    }
  }

  const handleGitHubOpen = async () => {
    const result = await window.api.invoke('openGitHubRepository')
    if (!result.ok) console.error(result.error)
  }

  return (
    <section className="space-y-3 pt-6 border-t border-border/40">
      <div className="px-1">
        <h2 className="text-[14px] font-semibold text-foreground">{t('settings.about.title')}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
          {t('settings.about.description')}
        </p>
      </div>
      <div className="px-1 mt-4">
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-3 text-[13px]">
          <dt className="pt-1 text-muted-foreground">{t('settings.about.version')}</dt>
          <dd className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="break-all font-mono font-medium text-foreground">{versionText}</div>
              <p className="mt-1 text-muted-foreground leading-snug">
                {updateStatusText(status, updateState?.availableVersion, lastChecked, locale, t)}
              </p>
              {(error || updateState?.error) && (
                <p className="mt-1 text-[12px] text-destructive-foreground leading-snug">
                  {error ?? updateState?.error}
                </p>
              )}
            </div>
            <Button
              className="shrink-0"
              disabled={busy}
              loading={running || status === 'checking'}
              onClick={handleUpdateAction}
              size="sm"
              variant="secondary"
            >
              {t('settings.update.actionCheck')}
            </Button>
          </dd>

          <dt className="text-muted-foreground">{t('settings.about.database')}</dt>
          <dd className="break-all font-mono text-muted-foreground">{dbPath}</dd>

          <dt className="text-muted-foreground">GitHub</dt>
          <dd>
            <button
              className="external-link break-all font-mono text-muted-foreground transition-colors hover:text-foreground"
              onClick={handleGitHubOpen}
              type="button"
            >
              {GITHUB_REPOSITORY_LABEL}
            </button>
          </dd>

          <dt className="text-muted-foreground">{t('settings.about.license')}</dt>
          <dd className="text-foreground">MIT</dd>
        </dl>
      </div>
    </section>
  )
}

export default function Settings() {
  const { t } = useI18n()
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('settings.title')}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-snug">
          {t('settings.description')}
        </p>
      </header>
      <div className="flex flex-col gap-10">
        <GeneralSettingsSection />
        <AppPreferencesSection />
        <CliSection />
        <ConnectAgents />
        <ProjectAliases />
        <About />
      </div>
    </PageShell>
  )
}
