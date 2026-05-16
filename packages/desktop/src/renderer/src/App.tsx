import { useAtomValue } from 'jotai'
import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from 'overlayscrollbars-react'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useResolvedColorScheme } from './appearance'
import { preloadECharts } from './charts/useEChart'
import Sidebar from './components/Sidebar'
import { APP_LOCALES, i18n } from './i18n'
import { appPreferencesAtom, handlePush, prefetchSettingsData } from './store'
import Live from './views/Live'
import Settings from './views/Settings'
import Today from './views/Today'

const isMac = window.api.platform === 'darwin'
const LAST_VIEW_ROUTES = new Set(['/', '/live', '/history', '/usage', '/settings'])
const loadHistory = () => import('./views/History')
const loadUsage = () => import('./views/Usage')
const History = lazy(loadHistory)
const Usage = lazy(loadUsage)

type IdleGlobal = typeof globalThis & {
  cancelIdleCallback?: (handle: number) => void
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
}

function preloadAnalyticsModules(): void {
  void loadHistory()
  void loadUsage()
  void preloadECharts()
}

function scheduleIdleTask(callback: () => void): () => void {
  const idleGlobal = globalThis as IdleGlobal
  if (typeof idleGlobal.requestIdleCallback === 'function') {
    const handle = idleGlobal.requestIdleCallback(callback, { timeout: 2500 })
    return () => idleGlobal.cancelIdleCallback?.(handle)
  }

  const handle = globalThis.setTimeout(callback, 1000)
  return () => globalThis.clearTimeout(handle)
}

function RouteFallback() {
  return <div className="h-full bg-background" />
}

function AppRoutes() {
  const location = useLocation()
  const scrollerRef = useRef<OverlayScrollbarsComponentRef>(null)

  useEffect(() => {
    if (!LAST_VIEW_ROUTES.has(location.pathname)) return
    void window.api.invoke('updateAppPreferences', { lastView: location.pathname })
  }, [location.pathname])

  // The OverlayScrollbars viewport is stable across route transitions, so a leftover
  // scrollTop from the previous route would land you mid-page on the new one. Reset
  // to the top on every navigation — paint-blocking so the user never sees the stale frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger, not read inside
  useLayoutEffect(() => {
    const viewport = scrollerRef.current?.osInstance()?.elements().viewport
    if (viewport) viewport.scrollTop = 0
  }, [location.pathname])

  return (
    <div
      className={cn(
        'isolate flex h-screen min-h-[640px] min-w-[960px] flex-col',
        isMac ? 'bg-transparent' : 'bg-muted/80',
      )}
    >
      {isMac && <div className="electron-drag absolute inset-x-0 top-0 h-9" aria-hidden />}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <Sidebar className={isMac ? 'pt-8' : undefined} />
        <main
          className={cn(
            'relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl',
            'bg-background',
            'shadow-[0_1px_0_rgba(255,255,255,0.55)_inset,0_2px_12px_-4px_rgba(0,0,0,0.12)]',
            'dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_4px_24px_-6px_rgba(0,0,0,0.65)]',
          )}
        >
          <OverlayScrollbarsComponent
            ref={scrollerRef}
            className="scrollbar-shell h-full scroll-smooth"
            defer
            options={{ scrollbars: { autoHide: 'leave', autoHideDelay: 100 } }}
          >
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Today />} />
                <Route path="/live" element={<Live />} />
                <Route path="/history" element={<History />} />
                <Route path="/usage" element={<Usage />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Suspense>
          </OverlayScrollbarsComponent>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const preferences = useAtomValue(appPreferencesAtom)
  const colorScheme = useResolvedColorScheme()

  useEffect(() => {
    prefetchSettingsData()
    const cancelPreload = scheduleIdleTask(preloadAnalyticsModules)
    const unsubscribe = window.api.onPush(handlePush)
    return () => {
      cancelPreload()
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const theme = preferences?.theme ?? 'system'
    const language = preferences?.language ?? 'en'

    root.classList.toggle('dark', colorScheme === 'dark')
    root.dataset.theme = theme
    root.dataset.resolvedTheme = colorScheme
    root.lang = language
    root.dataset.locale = APP_LOCALES[language]
    if (i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
  }, [colorScheme, preferences?.language, preferences?.theme])

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
