import { BarChart, CustomChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/types/dist/echarts'

echarts.use([
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
])

export type { EChartsCoreOption }
export { echarts }
