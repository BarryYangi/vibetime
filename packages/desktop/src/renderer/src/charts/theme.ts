import * as echarts from 'echarts'

const tokyoNightTheme = {
  color: ['#bb9af7', '#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#ff9e64', '#2ac3de', '#7dcfff'],
  backgroundColor: 'transparent',
  textStyle: { color: '#c0caf5', fontFamily: 'Inter, system-ui, sans-serif' },
  title: { textStyle: { color: '#c0caf5' }, subtextStyle: { color: '#565f89' } },
  legend: { textStyle: { color: '#a9b1d6' } },
  tooltip: {
    backgroundColor: '#24283b',
    borderColor: '#3b4261',
    textStyle: { color: '#c0caf5' },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#3b4261' } },
    axisTick: { lineStyle: { color: '#3b4261' } },
    axisLabel: { color: '#565f89' },
    splitLine: { lineStyle: { color: '#1a1b26' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#3b4261' } },
    axisTick: { lineStyle: { color: '#3b4261' } },
    axisLabel: { color: '#565f89' },
    splitLine: { lineStyle: { color: '#3b4261' } },
  },
}

echarts.registerTheme('tokyoNight', tokyoNightTheme)

export { tokyoNightTheme }
