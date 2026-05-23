<script setup>
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import 'echarts-gl'
import { comboCountBandFromFreq } from '../../utils/combinationFrequency.js'

use([TooltipComponent, CanvasRenderer])

const props = defineProps({
  combinationFrequency: { type: Array, default: () => [] },
})

const GRADIENT = ['#16a34a', '#65a30d', '#eab308', '#f97316', '#ef4444', '#b91c1c']

const dataMin = ref(0)
const dataMax = ref(1)
const filterMin = ref(0)
const filterMax = ref(1)
/** After first render, only push series updates so 3D view is preserved. */
const viewLocked = ref(false)

// computed option always returns a new reference; force merge so slider updates don't replace the whole chart
const chartUpdateOptions = { notMerge: false, replaceMerge: ['series'] }

watch(
  () => props.combinationFrequency,
  (freq) => {
    if (!freq.length) return
    const band = comboCountBandFromFreq(freq)
    dataMin.value = band.dataMin
    dataMax.value = band.dataMax
    filterMin.value = band.filterMin
    filterMax.value = band.filterMax
    viewLocked.value = false
  },
  { immediate: true },
)

function lockView() {
  viewLocked.value = true
}

function lerpColor(hex1, hex2, t) {
  const a = hex1 || GRADIENT[0]
  const b = hex2 || GRADIENT[GRADIENT.length - 1]
  const r1 = parseInt(a.slice(1, 3), 16)
  const g1 = parseInt(a.slice(3, 5), 16)
  const b1 = parseInt(a.slice(5, 7), 16)
  const r2 = parseInt(b.slice(1, 3), 16)
  const g2 = parseInt(b.slice(3, 5), 16)
  const b2 = parseInt(b.slice(5, 7), 16)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const bl = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r},${g},${bl})`
}

function freqColor(count, minVal, maxVal) {
  const span = maxVal - minVal
  const t = span > 0 ? Math.min(1, Math.max(0, (count - minVal) / span)) : 0
  const idx = t * (GRADIENT.length - 1)
  const lo = Math.min(Math.floor(idx), GRADIENT.length - 1)
  const hi = Math.min(lo + 1, GRADIENT.length - 1)
  return lerpColor(GRADIENT[lo], GRADIENT[hi], idx - lo)
}

function onMinInput(e) {
  const v = Number(e.target.value)
  filterMin.value = Math.min(v, filterMax.value)
}

function onMaxInput(e) {
  const v = Number(e.target.value)
  filterMax.value = Math.max(v, filterMin.value)
}

const rangeTrackStyle = computed(() => {
  const span = dataMax.value - dataMin.value || 1
  const left = ((filterMin.value - dataMin.value) / span) * 100
  const right = ((dataMax.value - filterMax.value) / span) * 100
  return { left: `${left}%`, right: `${right}%` }
})

function buildSeriesData(freq, lo, hi, minVal, maxVal) {
  const data = []
  for (let num = 0; num < 1000; num++) {
    const hundreds = Math.floor(num / 100)
    const lastTwo = num % 100
    data.push([hundreds, lastTwo, freq[num] ?? 0])
  }

  return data.map((item) => {
    const count = item[2]
    const inRange = count >= lo && count <= hi
    return {
      value: item,
      itemStyle: {
        color: freqColor(count, minVal, maxVal),
        opacity: inRange ? 0.95 : 0.06,
      },
    }
  })
}

function buildSeries(freq, lo, hi, minVal, maxVal) {
  return {
    type: 'bar3D',
    data: buildSeriesData(freq, lo, hi, minVal, maxVal),
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
  }
}

const option = computed(() => {
  const freq = props.combinationFrequency
  if (!freq.length) return {}

  const minVal = dataMin.value
  const maxVal = dataMax.value
  const lo = filterMin.value
  const hi = filterMax.value
  const series = buildSeries(freq, lo, hi, minVal, maxVal)

  if (viewLocked.value) {
    return { series: [series] }
  }

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
        autoRotate: true,
        autoRotateSpeed: 4,
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
    series: [series],
  }
})
</script>

<template>
  <div class="chart-wrap">
    <div class="hint">自动缓慢旋转 · 鼠标拖拽旋转 · 滚轮缩放 · 底部滑块筛选次数</div>
    <VChart
      :option="option"
      :update-options="chartUpdateOptions"
      autoresize
      class="chart"
      @rendered="lockView"
    />

    <div v-if="combinationFrequency.length" class="range-panel">
      <div class="range-header">
        <span class="range-title">次数范围</span>
        <span class="range-value">{{ filterMin }} — {{ filterMax }} 次</span>
      </div>

      <div class="dual-slider">
        <div class="slider-track" />
        <div class="slider-active" :style="rangeTrackStyle" />
        <input
          type="range"
          class="thumb thumb-min"
          :min="dataMin"
          :max="dataMax"
          :value="filterMin"
          @input="onMinInput"
        />
        <input
          type="range"
          class="thumb thumb-max"
          :min="dataMin"
          :max="dataMax"
          :value="filterMax"
          @input="onMaxInput"
        />
      </div>

      <div class="range-labels">
        <span>低 {{ dataMin }}</span>
        <span class="gradient-bar" />
        <span>高 {{ dataMax }}</span>
      </div>
    </div>
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

.range-panel {
  padding: 4px 8px 0;
}

.range-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.range-title {
  font-size: 12px;
  color: #94a3b8;
}

.range-value {
  font-size: 13px;
  font-weight: 600;
  color: #fbbf24;
  font-variant-numeric: tabular-nums;
}

.dual-slider {
  position: relative;
  height: 28px;
}

.slider-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 8px;
  margin-top: -4px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    #16a34a,
    #65a30d,
    #eab308,
    #f97316,
    #ef4444,
    #b91c1c
  );
  opacity: 0.35;
}

.slider-active {
  position: absolute;
  top: 50%;
  height: 8px;
  margin-top: -4px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    #16a34a,
    #65a30d,
    #eab308,
    #f97316,
    #ef4444,
    #b91c1c
  );
  pointer-events: none;
}

.thumb {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 28px;
  margin: 0;
  background: transparent;
  pointer-events: none;
  -webkit-appearance: none;
  appearance: none;
}

.thumb::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f8fafc;
  border: 2px solid #fbbf24;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  cursor: grab;
  pointer-events: auto;
}

.thumb::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f8fafc;
  border: 2px solid #fbbf24;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  cursor: grab;
  pointer-events: auto;
}

.thumb::-webkit-slider-runnable-track {
  background: transparent;
  height: 8px;
}

.thumb::-moz-range-track {
  background: transparent;
  height: 8px;
}

.thumb-max {
  z-index: 2;
}

.thumb-min {
  z-index: 3;
}

.range-labels {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: #64748b;
}

.gradient-bar {
  flex: 1;
  height: 3px;
  margin: 0 12px;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    #16a34a,
    #65a30d,
    #eab308,
    #f97316,
    #ef4444,
    #b91c1c
  );
  opacity: 0.6;
}
</style>
