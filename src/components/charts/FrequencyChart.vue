<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps({
  positionFrequency: { type: Object, default: () => ({}) },
})

const COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d']

const option = computed(() => {
  const digits = Array.from({ length: 10 }, (_, i) => String(i))
  const positions = Object.keys(props.positionFrequency)

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
      data: positions,
      textStyle: { color: '#94a3b8' },
      top: 0,
    },
    grid: { left: 48, right: 24, top: 48, bottom: 32 },
    xAxis: {
      type: 'category',
      data: digits,
      axisLabel: { color: '#64748b', fontSize: 13, fontWeight: 'bold' },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value',
      name: '出现次数',
      nameTextStyle: { color: '#64748b' },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: positions.map((name, i) => ({
      name,
      type: 'bar',
      data: props.positionFrequency[name],
      itemStyle: {
        color: COLORS[i],
        borderRadius: [4, 4, 0, 0],
      },
      barMaxWidth: 28,
    })),
  }
})
</script>

<template>
  <VChart :option="option" autoresize class="chart" />
</template>

<style scoped>
.chart {
  width: 100%;
  height: 320px;
}
</style>
