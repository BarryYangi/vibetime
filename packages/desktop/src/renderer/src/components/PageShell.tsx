import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageShellProps = {
  children: ReactNode
  className?: string
  /** Full-width layout for dashboard-style pages */
  fluid?: boolean
  /** Narrower column for form-heavy pages (e.g. Settings) */
  prose?: boolean
}

export function PageShell({ children, className, fluid, prose }: PageShellProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-6 py-8 sm:px-8 sm:py-10',
        fluid
          ? 'max-w-none'
          : prose
            ? 'max-w-2xl lg:max-w-3xl'
            : 'max-w-3xl lg:max-w-5xl xl:max-w-6xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
