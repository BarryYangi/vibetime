type DurationUnit = 'h' | 'm' | 's'

export function durationParts(seconds: number): { h: number; m: number; s: number } {
  const whole = Math.max(0, Math.floor(seconds))
  return {
    h: Math.floor(whole / 3600),
    m: Math.floor((whole % 3600) / 60),
    s: whole % 60,
  }
}

export function durationUnit(unit: DurationUnit, locale: string): string {
  if (locale === 'zh-CN') {
    if (unit === 'h') return '时'
    if (unit === 'm') return '分'
    return '秒'
  }
  return unit
}

export function formatDurationFull(seconds: number, locale: string): string {
  const { h, m, s } = durationParts(seconds)
  if (h === 0 && m === 0) return `${s}${durationUnit('s', locale)}`

  if (h === 0) {
    return s > 0
      ? `${m}${durationUnit('m', locale)}${s}${durationUnit('s', locale)}`
      : `${m}${durationUnit('m', locale)}`
  }

  const minuteText = m > 0 || s > 0 ? `${m}${durationUnit('m', locale)}` : ''
  const secondText = s > 0 ? `${s}${durationUnit('s', locale)}` : ''
  return `${h}${durationUnit('h', locale)}${minuteText}${secondText}`
}

export function formatDurationSummary(seconds: number, locale: string): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}${durationUnit('s', locale)}`

  const totalMinutes = Math.round(whole / 60)
  if (totalMinutes < 60) return `${totalMinutes}${durationUnit('m', locale)}`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0
    ? `${hours}${durationUnit('h', locale)}${minutes}${durationUnit('m', locale)}`
    : `${hours}${durationUnit('h', locale)}`
}

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
