<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import 'echarts-gl'

use([CanvasRenderer])

const props = defineProps({
  positionFrequency: { type: Object, default: () => ({}) },
})

const option = computed(() => {
  const positions = Object.keys(props.positionFrequency)
  const data = []

  positions.forEach((name, y) => {
    props.positionFrequency[name].forEach((count, x) => {
      data.push([x, y, count])
    })
  })

  const maxVal = Math.max(...data.map((d) => d[2]), 1)

  return {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      formatter(p) {
        const pos = positions[p.value[1]]
        return `${pos} · 号码 ${p.value[0]}<br/>出现 ${p.value[2]} 次`
      },
    },
    visualMap: {
      max: maxVal,
      min: 0,
      inRange: {
        color: ['#1e3a5f', '#2563eb', '#60a5fa', '#fbbf24', '#f97316'],
      },
      textStyle: { color: '#94a3b8' },
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
    },
    xAxis3D: {
      type: 'category',
      name: '号码',
      nameTextStyle: { color: '#94a3b8' },
      data: Array.from({ length: 10 }, (_, i) => String(i)),
      axisLabel: { color: '#64748b' },
    },
    yAxis3D: {
      type: 'category',
      name: '位置',
      nameTextStyle: { color: '#94a3b8' },
      data: positions,
      axisLabel: { color: '#64748b' },
    },
    zAxis3D: {
      type: 'value',
      name: '次数',
      nameTextStyle: { color: '#94a3b8' },
      axisLabel: { color: '#64748b' },
    },
    grid3D: {
      boxWidth: 120,
      boxDepth: 80,
      viewControl: {
        autoRotate: true,
        autoRotateSpeed: 4,
        distance: 220,
      },
      light: {
        main: { intensity: 1.2, shadow: true },
        ambient: { intensity: 0.4 },
      },
    },
    series: [
      {
        type: 'bar3D',
        data: data.map((item) => ({
          value: item,
          itemStyle: { opacity: 0.92 },
        })),
        shading: 'lambert',
        barSize: 8,
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
  height: 420px;
}
</style>
