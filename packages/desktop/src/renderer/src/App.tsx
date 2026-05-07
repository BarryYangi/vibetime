import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import Sidebar from './components/Sidebar'
import { handlePush } from './store'
import History from './views/History'
import Live from './views/Live'
import Menubar from './views/Menubar'
import Settings from './views/Settings'
import Today from './views/Today'

const isMac = window.api.platform === 'darwin'

function AppRoutes() {
  const location = useLocation()

  if (location.pathname === '/menubar') {
    return (
      <div className="h-screen min-h-[360px] min-w-[320px] overflow-hidden bg-popover">
        <Routes>
          <Route path="/menubar" element={<Menubar />} />
        </Routes>
      </div>
    )
  }

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
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/live" element={<Live />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
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
