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

const POS_COLORS = [
  { base: '#f59e0b', mid: '#fbbf24', peak: '#fef08a' }, // 百位
  { base: '#0891b2', mid: '#22d3ee', peak: '#a5f3fc' }, // 十位
  { base: '#7c3aed', mid: '#a78bfa', peak: '#e9d5ff' }, // 个位
]

function lerpColor(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16)
  const g1 = parseInt(hex1.slice(3, 5), 16)
  const b1 = parseInt(hex1.slice(5, 7), 16)
  const r2 = parseInt(hex2.slice(1, 3), 16)
  const g2 = parseInt(hex2.slice(3, 5), 16)
  const b2 = parseInt(hex2.slice(5, 7), 16)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r},${g},${b})`
}

const option = computed(() => {
  const positions = Object.keys(props.positionFrequency)
  const data = []

  positions.forEach((name, y) => {
    props.positionFrequency[name].forEach((count, x) => {
      data.push([x, y, count])
    })
  })

  const maxVal = Math.max(...data.map((d) => d[2]), 1)
  const minVal = Math.min(...data.map((d) => d[2]))

  function barColor(posIdx, count) {
    const t = (count - minVal) / (maxVal - minVal || 1)
    const c = POS_COLORS[posIdx] ?? POS_COLORS[0]
    if (t < 0.5) return lerpColor(c.base, c.mid, t * 2)
    return lerpColor(c.mid, c.peak, (t - 0.5) * 2)
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      formatter(p) {
        const pos = positions[p.value[1]]
        const pct = ((p.value[2] / maxVal) * 100).toFixed(1)
        return `${pos} · 号码 <b>${p.value[0]}</b><br/>出现 <b>${p.value[2]}</b> 次（相对 ${pct}%）`
      },
    },
    legend: {
      data: positions.map((name, i) => ({
        name,
        itemStyle: { color: POS_COLORS[i]?.mid ?? '#fff' },
      })),
      textStyle: { color: '#94a3b8', fontSize: 12 },
      top: 4,
      left: 'center',
    },
    xAxis3D: {
      type: 'category',
      name: '号码',
      nameTextStyle: { color: '#94a3b8', fontSize: 12 },
      data: Array.from({ length: 10 }, (_, i) => String(i)),
      axisLabel: { color: '#64748b', fontSize: 12 },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis3D: {
      type: 'category',
      name: '位置',
      nameTextStyle: { color: '#94a3b8', fontSize: 12 },
      data: positions,
      axisLabel: { color: '#94a3b8', fontSize: 12 },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    zAxis3D: {
      type: 'value',
      name: '次数',
      nameTextStyle: { color: '#94a3b8', fontSize: 12 },
      axisLabel: { color: '#64748b', fontSize: 11 },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    grid3D: {
      boxWidth: 140,
      boxDepth: 80,
      boxHeight: 100,
      viewControl: {
        autoRotate: true,
        autoRotateSpeed: 4,
        distance: 230,
        rotateSensitivity: 1.5,
        zoomSensitivity: 1.2,
      },
      light: {
        main: { intensity: 1.4, shadow: true, shadowQuality: 'medium' },
        ambient: { intensity: 0.45 },
      },
    },
    series: [
      {
        type: 'bar3D',
        data: data.map((item) => {
          const [, posIdx, count] = item
          const t = (count - minVal) / (maxVal - minVal || 1)
          return {
            value: item,
            itemStyle: {
              color: barColor(posIdx, count),
              opacity: 0.75 + t * 0.23,
            },
          }
        }),
        shading: 'lambert',
        barSize: 9,
        emphasis: {
          itemStyle: { opacity: 1 },
          label: {
            show: true,
            formatter: (p) => p.value[2],
            textStyle: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
          },
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
  height: 320px;
}
</style>
