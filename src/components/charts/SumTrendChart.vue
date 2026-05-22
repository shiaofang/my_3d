<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([LineChart, BarChart, GridComponent, TooltipComponent, MarkLineComponent, DataZoomComponent, CanvasRenderer])

const props = defineProps({
  sumSeries: { type: Array, default: () => [] },
})

const option = computed(() => {
  const issues = props.sumSeries.map((d) => String(d.issue))
  const sums = props.sumSeries.map((d) => d.sum)
  const avg = sums.length ? (sums.reduce((a, b) => a + b, 0) / sums.length).toFixed(1) : 0

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    grid: { left: 48, right: 24, top: 32, bottom: 72 },
    xAxis: {
      type: 'category',
      data: issues,
      axisLabel: { color: '#64748b', rotate: 45, fontSize: 10, interval: Math.floor(issues.length / 12) },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 27,
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    dataZoom: [
      { type: 'inside', start: Math.max(0, 100 - (80 / issues.length) * 100) },
      { type: 'slider', start: Math.max(0, 100 - (80 / issues.length) * 100), height: 20, bottom: 8, borderColor: '#334155', fillerColor: 'rgba(96, 165, 250, 0.15)', handleStyle: { color: '#60a5fa' } },
    ],
    series: [
      {
        name: '和值',
        type: 'line',
        data: sums,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#60a5fa' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(96, 165, 250, 0.35)' },
              { offset: 1, color: 'rgba(96, 165, 250, 0.02)' },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f472b6', type: 'dashed' },
          label: { formatter: `均值 ${avg}`, color: '#f472b6' },
          data: [{ yAxis: Number(avg) }],
        },
      },
    ],
  }
})
</script>

<template>
  <VChart :option="option" autoresize class="chart" />
</template>

<style scoped>
.chart {
  width: 100%;
  height: 300px;
}
</style>
