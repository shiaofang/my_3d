<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([LineChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

const props = defineProps({
  draws: { type: Array, default: () => [] },
})

const POSITION_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d']
const POSITION_NAMES = ['百位', '十位', '个位']

const option = computed(() => {
  const issues = props.draws.map((d) => String(d.issue))
  const series = POSITION_NAMES.map((name, pos) => ({
    name,
    type: 'line',
    data: props.draws.map((d) => d.digits[pos]),
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { width: 2, color: POSITION_COLORS[pos] },
    itemStyle: { color: POSITION_COLORS[pos] },
    emphasis: { scale: 1.6 },
  }))

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      formatter(params) {
        const draw = props.draws[params[0]?.dataIndex]
        if (!draw) return ''
        const nums = draw.digits.join(' ')
        return `<div style="font-weight:600;margin-bottom:4px">期号 ${draw.issue}</div>
          <div>${draw.kjdate}</div>
          <div style="margin-top:6px;font-size:16px;color:#fbbf24">开奖: ${nums}</div>
          <div style="margin-top:4px;color:#94a3b8">和值 ${draw.sum} · ${draw.type}</div>`
      },
    },
    legend: {
      data: POSITION_NAMES,
      textStyle: { color: '#94a3b8' },
      top: 0,
    },
    grid: { left: 48, right: 24, top: 48, bottom: 72 },
    xAxis: {
      type: 'category',
      data: issues,
      axisLabel: { color: '#64748b', rotate: 45, fontSize: 10, interval: Math.floor(issues.length / 12) },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 9,
      interval: 1,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    dataZoom: [
      { type: 'inside', start: Math.max(0, 100 - (80 / issues.length) * 100) },
      { type: 'slider', start: Math.max(0, 100 - (80 / issues.length) * 100), height: 20, bottom: 8, borderColor: '#334155', fillerColor: 'rgba(251, 191, 36, 0.15)', handleStyle: { color: '#fbbf24' } },
    ],
    series,
  }
})
</script>

<template>
  <VChart :option="option" autoresize class="chart" />
</template>

<style scoped>
.chart {
  width: 100%;
  height: 360px;
}
</style>
