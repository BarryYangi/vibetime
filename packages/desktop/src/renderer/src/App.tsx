import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import Sidebar from './components/Sidebar'
import { handlePush } from './store'
import Live from './views/Live'
import Settings from './views/Settings'
import Today from './views/Today'

const isMac = window.api.platform === 'darwin'
const LAST_VIEW_ROUTES = new Set(['/', '/live', '/history', '/settings'])
const History = lazy(() => import('./views/History'))

function RouteFallback() {
  return <div className="h-full bg-background" />
}

function AppRoutes() {
  const location = useLocation()

  useEffect(() => {
    if (!LAST_VIEW_ROUTES.has(location.pathname)) return
    void window.api.invoke('updateAppPreferences', { lastView: location.pathname })
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
        <Sidebar className={isMac ? 'pb-3 pt-8' : undefined} />
        <main
          className={cn(
            'relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl',
            'bg-background',
            'shadow-[0_1px_0_rgba(255,255,255,0.55)_inset,0_2px_12px_-4px_rgba(0,0,0,0.12)]',
            'dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_4px_24px_-6px_rgba(0,0,0,0.65)]',
          )}
        >
          <div className="h-full overflow-auto scroll-smooth">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Today />} />
                <Route path="/live" element={<Live />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    return window.api.onPush(handlePush)
  }, [])

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
