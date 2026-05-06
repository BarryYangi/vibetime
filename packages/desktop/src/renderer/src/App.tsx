import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import { cn } from '@/lib/utils'
import { handlePush } from './store'
import Settings from './views/Settings'
import Today from './views/Today'

const isMac = window.api.platform === 'darwin'

export default function App() {
  useEffect(() => {
    return window.api.onPush(handlePush)
  }, [])

  return (
    <HashRouter>
      <div className="isolate flex h-screen min-h-0 flex-col bg-muted/80">
        {isMac && (
          <div className="electron-drag h-9 shrink-0 pl-[76px]" aria-hidden />
        )}
        <div
          className={cn(
            'flex min-h-0 flex-1 gap-3 px-3 pb-3',
            isMac ? 'pt-1' : 'pt-3',
          )}
        >
          <Sidebar />
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
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </HashRouter>
  )
}
