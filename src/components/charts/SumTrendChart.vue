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
import { chartDataZoomPair, useZoomRangeLabels } from '../../utils/chartDataZoom.js'
import ChartZoomRangeFooter from './ChartZoomRangeFooter.vue'

use([LineChart, BarChart, GridComponent, TooltipComponent, MarkLineComponent, DataZoomComponent, CanvasRenderer])

const props = defineProps({
  sumSeries: { type: Array, default: () => [] },
})

const issues = computed(() => props.sumSeries.map((d) => String(d.issue)))
const dates = computed(() => props.sumSeries.map((d) => d.date))
const { rangeLabels, onDataZoom, zoomStart, zoomEnd } = useZoomRangeLabels(
  () => issues.value,
  () => dates.value,
  () => issues.value.length,
)

const option = computed(() => {
  const sums = props.sumSeries.map((d) => d.sum)
  const avg = sums.length ? (sums.reduce((a, b) => a + b, 0) / sums.length).toFixed(1) : 0

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      confine: true,
      axisPointer: {
        type: 'cross',
        snap: true,
        label: {
          backgroundColor: '#0f172a',
          borderColor: '#ffffff',
          borderWidth: 1,
          color: '#ffffff',
          fontSize: 11,
          padding: [4, 8],
          formatter: (params) =>
            params.axisDimension === 'y' ? Math.round(params.value) : params.value,
        },
        crossStyle: { color: 'rgba(255, 255, 255, 0.85)', width: 1, type: 'dashed' },
      },
    },
    grid: { left: 56, right: 24, top: 32, bottom: 80 },
    xAxis: {
      type: 'category',
      data: issues.value,
      axisLabel: {
        show: false,
      },
      axisLine: { lineStyle: { color: '#334155' } },
      axisPointer: {
        show: true,
        snap: true,
        label: { show: false },
        lineStyle: { color: 'transparent', width: 0 },
      },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 27,
      interval: 1,
      axisLabel: {
        color: '#94a3b8',
        fontSize: 9,
      },
      splitLine: {
        lineStyle: {
          color: (params) => (params.value % 3 === 0 || params.value === 27 ? '#1e293b' : 'rgba(30, 41, 59, 0.35)'),
        },
      },
      axisPointer: {
        show: true,
        snap: false,
        lineStyle: { color: 'rgba(255, 255, 255, 0.9)', width: 1, type: 'dashed' },
      },
    },
    dataZoom: chartDataZoomPair({
      issueCount: issues.value.length,
      start: zoomStart.value,
      end: zoomEnd.value,
      color: '#60a5fa',
      fillerColor: 'rgba(96, 165, 250, 0.15)',
      insetLeft: 56,
      insetRight: 40,
    }),
    series: [
      {
        name: '和值',
        type: 'line',
        data: sums,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false,
        showAllSymbol: false,
        itemStyle: {
          color: '#60a5fa',
          borderColor: '#ffffff',
          borderWidth: 1,
        },
        emphasis: {
          scale: 1,
          focus: 'series',
          itemStyle: {
            color: '#ffffff',
            borderColor: '#60a5fa',
            borderWidth: 1,
          },
        },
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
          symbol: ['none', 'none'],
          lineStyle: { color: '#f472b6', type: 'dashed', width: 1.5 },
          label: {
            show: true,
            position: 'start',
            distance: 6,
            formatter: avg,
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 700,
            padding: [2, 6],
            borderRadius: 4,
            backgroundColor: '#f472b6',
          },
          data: [{ yAxis: Number(avg) }],
        },
      },
    ],
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
