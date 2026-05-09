import type { ResolvedColorScheme } from '../appearance'
import { echarts } from './echarts'

const chartFontFamily =
  '"SN Pro", -apple-system, BlinkMacSystemFont, system-ui, ui-sans-serif, sans-serif'

const chartThemeNames = {
  light: 'cossNeutral',
  dark: 'cossNeutralDark',
} as const

const cossNeutralTheme = {
  color: ['#262626', '#737373', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
  backgroundColor: 'transparent',
  textStyle: {
    color: '#262626',
    fontFamily: chartFontFamily,
  },
  title: { textStyle: { color: '#262626' }, subtextStyle: { color: '#737373' } },
  legend: { textStyle: { color: '#737373' } },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: '#00000014',
    textStyle: { color: '#262626' },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#00000014' } },
    axisTick: { lineStyle: { color: '#00000014' } },
    axisLabel: { color: '#737373' },
    splitLine: { lineStyle: { color: '#0000000a' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#00000014' } },
    axisTick: { lineStyle: { color: '#00000014' } },
    axisLabel: { color: '#737373' },
    splitLine: { lineStyle: { color: '#00000014' } },
  },
}

const cossNeutralDarkTheme = {
  color: ['#f5f5f5', '#a3a3a3', '#60a5fa', '#34d399', '#fbbf24', '#f87171'],
  backgroundColor: 'transparent',
  textStyle: {
    color: '#f5f5f5',
    fontFamily: chartFontFamily,
  },
  title: { textStyle: { color: '#f5f5f5' }, subtextStyle: { color: '#a3a3a3' } },
  legend: { textStyle: { color: '#a3a3a3' } },
  tooltip: {
    backgroundColor: '#171717',
    borderColor: '#ffffff1a',
    textStyle: { color: '#f5f5f5' },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#ffffff1a' } },
    axisTick: { lineStyle: { color: '#ffffff1a' } },
    axisLabel: { color: '#a3a3a3' },
    splitLine: { lineStyle: { color: '#ffffff14' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#ffffff1a' } },
    axisTick: { lineStyle: { color: '#ffffff1a' } },
    axisLabel: { color: '#a3a3a3' },
    splitLine: { lineStyle: { color: '#ffffff14' } },
  },
}

const chartTokens = {
  light: {
    axisLabel: '#737373',
    axisPointer: '#0000000a',
    calendarBorder: '#ffffff',
    calendarFill: '#ffffff',
    heatmap: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    hourlyHeatmap: ['#f7f7f7', '#dbeafe', '#93c5fd', '#3b82f6', '#1e3a8a'],
    seriesPalette: ['#2563eb', '#10b981', '#f59e0b', '#e11d48', '#7c3aed', '#737373'],
    splitLine: '#0000000f',
    text: '#262626',
    tooltipBg: '#ffffff',
    tooltipMuted: '#737373',
    tooltipRow: '#404040',
    tooltipShadow: 'rgba(0,0,0,0.10)',
    turnBucket: {
      short: '#f59e0b',
      standard: '#2563eb',
      long: '#10b981',
    },
    weakAxisLabel: '#a3a3a3',
  },
  dark: {
    axisLabel: '#a3a3a3',
    axisPointer: '#ffffff0a',
    calendarBorder: '#171717',
    calendarFill: '#171717',
    heatmap: ['#222222', '#193524', '#166534', '#22c55e', '#86efac'],
    hourlyHeatmap: ['#222222', '#232832', '#1f3658', '#2556c7', '#60a5fa'],
    seriesPalette: ['#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#a3a3a3'],
    splitLine: '#ffffff14',
    text: '#f5f5f5',
    tooltipBg: '#171717',
    tooltipMuted: '#a3a3a3',
    tooltipRow: '#d4d4d4',
    tooltipShadow: 'rgba(0,0,0,0.20)',
    turnBucket: {
      short: '#fbbf24',
      standard: '#60a5fa',
      long: '#34d399',
    },
    weakAxisLabel: '#737373',
  },
} as const

echarts.registerTheme('cossNeutral', cossNeutralTheme)
echarts.registerTheme('cossNeutralDark', cossNeutralDarkTheme)

export function getChartThemeName(colorScheme: ResolvedColorScheme) {
  return chartThemeNames[colorScheme]
}

export function getChartTokens(colorScheme: ResolvedColorScheme) {
  return chartTokens[colorScheme]
}

export { cossNeutralDarkTheme, cossNeutralTheme }
