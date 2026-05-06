import * as echarts from 'echarts'

const cossNeutralTheme = {
  color: ['#262626', '#737373', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
  backgroundColor: 'transparent',
  textStyle: {
    color: '#262626',
    fontFamily:
      '"SN Pro", -apple-system, BlinkMacSystemFont, system-ui, ui-sans-serif, sans-serif',
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

echarts.registerTheme('cossNeutral', cossNeutralTheme)

export { cossNeutralTheme }
