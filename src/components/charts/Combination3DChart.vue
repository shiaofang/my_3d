<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import 'echarts-gl'

use([CanvasRenderer])

const props = defineProps({
  combinationFrequency: { type: Array, default: () => [] },
})

const option = computed(() => {
  const freq = props.combinationFrequency
  if (!freq.length) return {}

  const data = []
  for (let num = 0; num < 1000; num++) {
    const hundreds = Math.floor(num / 100)
    const lastTwo = num % 100
    data.push([hundreds, lastTwo, freq[num] ?? 0])
  }

  const maxVal = Math.max(...freq, 1)

  const lastTwoLabels = Array.from({ length: 100 }, (_, i) =>
    i % 10 === 0 ? String(i).padStart(2, '0') : '',
  )

  return {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(p) {
        const [h, lt, cnt] = p.value
        const combo = String(h * 100 + lt).padStart(3, '0')
        return `组合 <b>${combo}</b><br/>出现 <b style="color:#fbbf24">${cnt}</b> 次`
      },
    },
    visualMap: {
      max: maxVal,
      min: 0,
      inRange: {
        color: ['#16a34a', '#65a30d', '#eab308', '#f97316', '#ef4444', '#b91c1c'],
      },
      textStyle: { color: '#cbd5e1', fontSize: 12 },
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      itemWidth: 14,
      itemHeight: 120,
    },
    xAxis3D: {
      type: 'category',
      name: '百位',
      nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
      data: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#64748b' } },
      axisTick: { lineStyle: { color: '#64748b' } },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
    },
    yAxis3D: {
      type: 'category',
      name: '十个位',
      nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
      data: lastTwoLabels,
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#64748b' } },
      axisTick: { lineStyle: { color: '#64748b' } },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
    },
    zAxis3D: {
      type: 'value',
      name: '次数',
      nameTextStyle: { color: '#cbd5e1', fontSize: 12 },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#64748b' } },
      axisTick: { lineStyle: { color: '#64748b' } },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
    },
    grid3D: {
      boxWidth: 180,
      boxDepth: 320,
      boxHeight: 80,
      environment: 'rgba(15, 23, 42, 0.6)',
      viewControl: {
        autoRotate: false,
        rotateSensitivity: 1.5,
        zoomSensitivity: 1.2,
        panSensitivity: 1,
        distance: 300,
        alpha: 28,
        beta: 20,
        minDistance: 80,
        maxDistance: 600,
      },
      light: {
        main: { intensity: 1.1, shadow: false },
        ambient: { intensity: 0.9 },
      },
      postEffect: { enable: false },
      temporalSuperSampling: { enable: false },
    },
    series: [
      {
        type: 'bar3D',
        data: data.map((item) => ({
          value: item,
          itemStyle: { opacity: 0.95 },
        })),
        shading: 'color',
        barSize: 2.8,
        emphasis: {
          itemStyle: { opacity: 1, color: '#ffffff' },
          label: {
            show: true,
            formatter(p) {
              const [h, lt, cnt] = p.value
              return String(h * 100 + lt).padStart(3, '0') + '\n' + cnt + '次'
            },
            textStyle: { color: '#fff', fontSize: 11 },
          },
        },
      },
    ],
  }
})
</script>

<template>
  <div class="chart-wrap">
    <div class="hint">鼠标拖拽旋转 · 滚轮缩放 · 右键平移</div>
    <VChart :option="option" autoresize class="chart" />
  </div>
</template>

<style scoped>
.chart-wrap {
  position: relative;
  width: 100%;
}

.hint {
  position: absolute;
  top: 6px;
  right: 12px;
  font-size: 11px;
  color: #475569;
  pointer-events: none;
  z-index: 1;
  letter-spacing: 0.3px;
}

.chart {
  width: 100%;
  height: 380px;
}
</style>
