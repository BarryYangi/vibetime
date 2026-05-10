export type DurationUnit = 'h' | 'm' | 's'

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

export function formatDurationMinuteSummary(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return '<1m'

  const totalMinutes = Math.floor(whole / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}
