<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { HeatmapChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

const props = defineProps({
  omissionMatrix: { type: Object, default: () => ({}) },
})

const option = computed(() => {
  const positions = Object.keys(props.omissionMatrix)
  const digits = Array.from({ length: 10 }, (_, i) => String(i))
  const data = []

  positions.forEach((name, y) => {
    props.omissionMatrix[name].forEach((gap, x) => {
      data.push([x, y, gap])
    })
  })

  const maxGap = Math.max(...data.map((d) => d[2]), 1)

  return {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      formatter(p) {
        return `${positions[p.value[1]]} · 号码 ${p.value[0]}<br/>当前遗漏 ${p.value[2]} 期`
      },
    },
    grid: { left: 64, right: 48, top: 16, bottom: 48 },
    xAxis: {
      type: 'category',
      data: digits,
      splitArea: { show: true },
      axisLabel: { color: '#64748b', fontWeight: 'bold' },
    },
    yAxis: {
      type: 'category',
      data: positions,
      splitArea: { show: true },
      axisLabel: { color: '#64748b' },
    },
    visualMap: {
      min: 0,
      max: maxGap,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: {
        color: ['#064e3b', '#059669', '#fbbf24', '#ea580c', '#dc2626'],
      },
      textStyle: { color: '#94a3b8' },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: {
          show: true,
          color: '#fff',
          fontSize: 11,
          formatter: (p) => p.value[2],
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.4)' },
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
  height: 260px;
}
</style>
