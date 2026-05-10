export {
  durationParts,
  durationUnit,
  formatDurationFull,
  formatDurationSummary,
} from '../../../shared/format'

export function formatClockTime(timestampSeconds: number, locale: string): string {
  return new Date(timestampSeconds * 1000).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatShortDate(timestampSeconds: number | null, locale: string): string {
  if (timestampSeconds === null) return '-'
  return new Date(timestampSeconds * 1000).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  })
}

export function weekdayLabels(locale: string): string[] {
  return locale === 'zh-CN'
    ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
}

export function calendarDayLabels(locale: string): string[] {
  return locale === 'zh-CN'
    ? ['日', '一', '二', '三', '四', '五', '六']
    : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
}

export function calendarMonthLabels(locale: string): string[] {
  return locale === 'zh-CN'
    ? ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
}

export function formatPeriodLabel(days: number, locale: string): string {
  return locale === 'zh-CN' ? `${days}天` : `${days}d`
}

export function localizeDurationRangeLabel(label: string, locale: string): string {
  if (locale !== 'zh-CN') return label
  return label.replace(/m/g, '分').replace(/h/g, '时')
}
