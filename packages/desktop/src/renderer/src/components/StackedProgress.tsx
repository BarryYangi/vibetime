import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

export interface StackedProgressSegment {
  id: string
  label: string
  value: number
  tooltip?: string
  colorClass?: string
  colorHex?: string
  textClass?: string
}

export interface StackedProgressProps {
  segments: StackedProgressSegment[]
  total: number
  className?: string
  trackClassName?: string
}

interface ThemeDefinition {
  text: string
  bg: string
}

const FALLBACK_THEME: ThemeDefinition = {
  text: 'text-blue-600 dark:text-blue-400',
  bg: 'bg-blue-500',
}

const DEFAULT_THEMES: ThemeDefinition[] = [
  FALLBACK_THEME,
  { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500' },
  { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500' },
  { text: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-500' },
  { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500' },
  { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500' },
  { text: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-500' },
  { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500' },
]

const BRAND_THEMES: Record<string, ThemeDefinition> = {
  'claude-code': {
    text: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-500',
  },
  codex: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500' },
  cursor: { text: 'text-cyan-500 dark:text-cyan-300', bg: 'bg-cyan-400' },
  'gemini-cli': {
    text: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-500',
  },
}

export function getThemeByIndex(index: number): ThemeDefinition {
  return DEFAULT_THEMES[index % DEFAULT_THEMES.length] ?? FALLBACK_THEME
}

export function getAgentTheme(agent: string, index: number): ThemeDefinition {
  return BRAND_THEMES[agent] ?? getThemeByIndex(index)
}

export function StackedProgress({
  segments,
  total,
  className,
  trackClassName,
}: StackedProgressProps) {
  const activeSegments = segments.filter((s) => s.value > 0)
  const segmentsTotal = activeSegments.reduce((sum, s) => sum + s.value, 0)

  // The overall width of the stacked bar relative to the total container
  const containerShare = total > 0 ? (segmentsTotal / total) * 100 : 0
  const visualWidth = containerShare > 0 ? Math.max(containerShare, 0.5) : 0

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-input', trackClassName)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={containerShare}
    >
      <motion.div
        layout
        className={cn('flex h-full will-change-[width]', className)}
        initial={false}
        animate={{ width: `${visualWidth}%` }}
        transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
      >
        {activeSegments.map((segment, index) => {
          const segmentShare = segmentsTotal > 0 ? (segment.value / segmentsTotal) * 100 : 0
          const theme = getAgentTheme(segment.id, index)

          return (
            <motion.div
              layout
              key={segment.id}
              className={cn(
                'h-full relative',
                segment.colorClass || (!segment.colorHex && theme.bg),
                index === 0 && 'rounded-l-full',
                index === activeSegments.length - 1 && 'rounded-r-full',
                // To ensure no microscopic gaps due to sub-pixel rendering,
                // we use a tiny negative margin or overlap if needed, but flex should be fine.
              )}
              style={segment.colorHex ? { backgroundColor: segment.colorHex } : undefined}
              initial={false}
              animate={{ width: `${segmentShare}%` }}
              transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
              title={segment.tooltip || `${segment.label}: ${segment.value}`}
            />
          )
        })}
      </motion.div>
    </div>
  )
}
