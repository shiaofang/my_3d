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
import { chartDataZoomPair, useZoomRangeLabels } from '../../utils/chartDataZoom.js'
import ChartZoomRangeFooter from './ChartZoomRangeFooter.vue'

use([LineChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

const props = defineProps({
  draws: { type: Array, default: () => [] },
})

const POSITION_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d']
const POSITION_NAMES = ['百位', '十位', '个位']

const issues = computed(() => props.draws.map((d) => String(d.issue)))
const dates = computed(() => props.draws.map((d) => d.kjdate))
const { rangeLabels, onDataZoom, zoomStart, zoomEnd } = useZoomRangeLabels(
  () => issues.value,
  () => dates.value,
  () => issues.value.length,
)

const option = computed(() => {
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
        const lines = params
          .map((p) => `<div><span style="color:${p.color}">●</span> ${p.seriesName}: ${p.value}</div>`)
          .join('')
        return `<div style="font-weight:600;margin-bottom:4px">期号 ${draw.issue}</div>
          <div>${draw.kjdate}</div>
          <div style="margin-top:6px;font-size:16px;color:#fbbf24">开奖: ${nums}</div>
          <div style="margin-top:4px;color:#94a3b8">和值 ${draw.sum} · ${draw.type}</div>
          <div style="margin-top:6px">${lines}</div>`
      },
    },
    legend: {
      data: POSITION_NAMES,
      textStyle: { color: '#94a3b8' },
      top: 0,
    },
    grid: { left: 52, right: 24, top: 48, bottom: 80, containLabel: true },
    xAxis: {
      type: 'category',
      data: issues.value,
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 9,
      interval: 1,
      boundaryGap: ['12%', '12%'],
      axisLabel: { color: '#64748b' },
      axisLine: { show: true, lineStyle: { color: '#334155' } },
      axisTick: { show: true, lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    dataZoom: chartDataZoomPair({
      issueCount: issues.value.length,
      start: zoomStart.value,
      end: zoomEnd.value,
      color: '#fbbf24',
      fillerColor: 'rgba(251, 191, 36, 0.15)',
      insetLeft: 52,
      insetRight: 40,
    }),
    series,
  }
})
</script>

<template>
  <div class="chart-wrap">
    <VChart :option="option" autoresize class="chart" @datazoom="onDataZoom" />
    <ChartZoomRangeFooter :start="rangeLabels.start" :end="rangeLabels.end" />
  </div>
</template>

<style scoped>
.chart-wrap {
  position: relative;
  width: 100%;
}

.chart {
  width: 100%;
  height: 380px;
}
</style>
