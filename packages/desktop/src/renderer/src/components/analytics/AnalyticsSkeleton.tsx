import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const SUMMARY_SKELETON_KEYS = ['primary', 'secondary', 'tertiary', 'quaternary'] as const
const INSIGHT_SKELETON_KEYS = ['primary', 'secondary', 'tertiary'] as const
const HIGHLIGHT_SKELETON_KEYS = ['primary', 'secondary', 'tertiary', 'quaternary'] as const
const TABLE_ROW_SKELETON_KEYS = ['row-a', 'row-b', 'row-c', 'row-d'] as const
const TABLE_COLUMN_SKELETON_KEYS = [
  'name',
  'primary',
  'secondary',
  'tertiary',
  'quaternary',
  'quinary',
] as const

export function AnalyticsSummarySkeleton({
  className,
  itemClassName,
  valueClassName = 'h-8 w-32',
  detailClassName = 'h-3 w-40',
}: {
  className?: string
  itemClassName?: string
  valueClassName?: string
  detailClassName?: string
}) {
  return (
    <section className={cn('grid gap-2 md:grid-cols-4', className)}>
      {SUMMARY_SKELETON_KEYS.map((key) => (
        <div
          className={cn(
            'flex min-h-[132px] flex-col justify-between rounded-xl border border-border/40 bg-card/40 p-5 shadow-sm shadow-black/[0.01]',
            itemClassName,
          )}
          key={key}
        >
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className={valueClassName} />
          </div>
          <Skeleton className={detailClassName} />
        </div>
      ))}
    </section>
  )
}

export function AnalyticsHighlightSkeleton({ className }: { className?: string }) {
  return (
    <section className={cn('grid gap-2 lg:grid-cols-4', className)}>
      {HIGHLIGHT_SKELETON_KEYS.map((key) => (
        <div className="rounded-xl border border-border/50 bg-card/30 px-4 py-3" key={key}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-5 w-28" />
          <Skeleton className="mt-2 h-3 w-36" />
        </div>
      ))}
    </section>
  )
}

export function AnalyticsPanelSkeleton({
  chartHeightClassName = 'h-[260px]',
  showInsights = false,
}: {
  chartHeightClassName?: string
  showInsights?: boolean
}) {
  return (
    <section className="flex min-w-0 flex-col pt-1">
      <header className="mb-2.5 px-1">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-3 w-56" />
      </header>
      <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-sm shadow-black/[0.01]">
        <div className="flex h-full flex-col px-5 pt-4 pb-5">
          {showInsights && (
            <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-4 px-1">
              {INSIGHT_SKELETON_KEYS.map((key) => (
                <div className="flex flex-col" key={key}>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-4 w-28" />
                </div>
              ))}
            </div>
          )}
          <Skeleton className={cn('w-full', chartHeightClassName)} />
        </div>
      </div>
    </section>
  )
}

export function AnalyticsTableSkeleton() {
  return (
    <section className="flex min-w-0 flex-col pt-1">
      <header className="mb-2.5 px-1">
        <Skeleton className="h-4 w-28" />
      </header>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 px-5 py-4 shadow-sm shadow-black/[0.01]">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.8fr_0.7fr_0.7fr] gap-4 border-border/35 border-b pb-3">
          {TABLE_COLUMN_SKELETON_KEYS.map((key) => (
            <Skeleton className="h-3 w-full" key={key} />
          ))}
        </div>
        <div className="divide-y divide-border/25">
          {TABLE_ROW_SKELETON_KEYS.map((key) => (
            <div
              className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.8fr_0.7fr_0.7fr] gap-4 py-3"
              key={key}
            >
              {TABLE_COLUMN_SKELETON_KEYS.map((columnKey) => (
                <Skeleton className="h-4 w-full" key={`${key}-${columnKey}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
