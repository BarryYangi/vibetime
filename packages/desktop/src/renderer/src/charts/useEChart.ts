import type { EChartsCoreOption } from 'echarts/types/dist/echarts'
import { useEffect, useRef } from 'react'

type EChartsModule = typeof import('./echarts')
type EChartsInstance = ReturnType<EChartsModule['echarts']['init']>

type QueuedChartUpdate = {
  cancelled: boolean
  run: () => void
}

const chartUpdateQueue: QueuedChartUpdate[] = []
let chartUpdateScheduled = false
let echartsModulePromise: Promise<EChartsModule> | null = null

export function preloadECharts(): Promise<EChartsModule> {
  echartsModulePromise ??= import('./echarts')
  return echartsModulePromise
}

function requestNextFrame(callback: () => void): number {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(() => callback())
  }
  return globalThis.setTimeout(callback, 16)
}

function scheduleChartUpdate(run: () => void): () => void {
  const task: QueuedChartUpdate = { cancelled: false, run }
  chartUpdateQueue.push(task)
  if (!chartUpdateScheduled) {
    chartUpdateScheduled = true
    requestNextFrame(flushChartUpdates)
  }
  return () => {
    task.cancelled = true
  }
}

function flushChartUpdates(): void {
  chartUpdateScheduled = false
  const task = chartUpdateQueue.shift()
  if (task && !task.cancelled) task.run()
  if (chartUpdateQueue.length > 0) {
    chartUpdateScheduled = true
    requestNextFrame(flushChartUpdates)
  }
}

function chartOptions(options: EChartsCoreOption): EChartsCoreOption {
  return { ...options, animation: false }
}

export function useChart(
  ref: React.RefObject<HTMLDivElement | null>,
  options: EChartsCoreOption | null,
  themeName: string,
): void {
  const chartRef = useRef<EChartsInstance | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    let cancelled = false
    let cancelInitialUpdate: (() => void) | null = null
    let resize: (() => void) | null = null

    void preloadECharts().then(({ echarts }) => {
      if (cancelled || chartRef.current || !ref.current) return
      cancelInitialUpdate = scheduleChartUpdate(() => {
        if (cancelled || chartRef.current || !ref.current) return
        const chart = echarts.init(ref.current, themeName)
        chartRef.current = chart
        resize = () => chart.resize()
        window.addEventListener('resize', resize)
        if (optionsRef.current) {
          chart.setOption(chartOptions(optionsRef.current), true, true)
        }
      })
    })

    return () => {
      cancelled = true
      cancelInitialUpdate?.()
      if (resize) window.removeEventListener('resize', resize)
      const chart = chartRef.current
      chartRef.current = null
      chart?.dispose()
    }
  }, [ref, themeName])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !options) return
    return scheduleChartUpdate(() => {
      if (chartRef.current === chart) {
        chart.setOption(chartOptions(options), true, true)
      }
    })
  }, [options])
}
