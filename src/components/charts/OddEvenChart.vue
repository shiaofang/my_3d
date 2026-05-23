<script setup>
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer])

const props = defineProps({
  draws: { type: Array, default: () => [] },
})

const LABELS = ['3:0', '2:1', '1:2', '0:3']
const DESCRIPTIONS = ['全奇', '两奇一偶', '一奇两偶', '全偶']
const BASE_COLORS = ['#fbbf24', '#fb923c', '#60a5fa', '#22d3ee']

const DAYS_OPTIONS = [8, 16, 24, 32, 40, 48]
const selectedDays = ref(16)

const THEOR_PCT = 100 / 4 // 25%

function categoryOf(draw) {
  const odds = draw.digits.filter((d) => d % 2 === 1).length
  return 3 - odds // 3奇 → 0
}

const filteredStats = computed(() => {
  if (!props.draws.length) return LABELS.map((label, i) => ({ label, desc: DESCRIPTIONS[i], count: 0 }))

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - selectedDays.value)
  cutoff.setHours(0, 0, 0, 0)

  const counts = new Array(4).fill(0)
  for (const draw of props.draws) {
    const d = new Date(draw.kjdate?.replace(/-/g, '/') ?? '')
    if (isNaN(d.getTime()) || d < cutoff) continue
    counts[categoryOf(draw)]++
  }
  return LABELS.map((label, i) => ({ label, desc: DESCRIPTIONS[i], count: counts[i] }))
})

const totalDraws = computed(() => filteredStats.value.reduce((s, d) => s + d.count, 0))

/** Omission from full loaded history (independent of window). */
const omissions = computed(() => {
  const gaps = new Array(4).fill(0)
  if (!props.draws.length) return gaps
  for (let i = 0; i < 4; i++) {
    let gap = 0
    for (let j = props.draws.length - 1; j >= 0; j--) {
      if (categoryOf(props.draws[j]) === i) break
      gap++
    }
    gaps[i] = gap
  }
  return gaps
})

const maxOmission = computed(() => Math.max(...omissions.value, 1))

const predictedPcts = computed(() => {
  const stats = filteredStats.value
  const total = totalDraws.value
  const avg = total / 4
  const EPS = 0.05
  const OMI_WEIGHT = 0.6
  const omi = omissions.value
  const maxOmi = maxOmission.value
  const raws = stats.map((s, i) => {
    const base = Math.max(EPS, 2 * avg - s.count)
    const omiBoost = 1 + OMI_WEIGHT * (omi[i] / maxOmi)
    return base * omiBoost
  })
  const sumRaw = raws.reduce((a, b) => a + b, 0)
  return raws.map((r) => (sumRaw > 0 ? (r / sumRaw) * 100 : THEOR_PCT))
})

function blendHex(hex1, hex2, t) {
  const parse = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = parse(hex1)
  const [r2, g2, b2] = parse(hex2)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r},${g},${b})`
}

const option = computed(() => {
  const stats = filteredStats.value
  const total = totalDraws.value
  const pcts = predictedPcts.value

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
      formatter(params) {
        const p = params.find((x) => x.seriesIndex === 0)
        if (!p) return ''
        const i = p.dataIndex
        const cnt = stats[i].count
        const actualPct = total ? ((cnt / total) * 100).toFixed(1) : '0.0'
        const pred = pcts[i].toFixed(1)
        const diff = (pcts[i] - THEOR_PCT).toFixed(1)
        const sign = Number(diff) >= 0 ? '+' : ''
        const trend = pcts[i] < THEOR_PCT ? '▼ 低于理论' : '▲ 高于理论'
        const gap = omissions.value[i]
        const gapTxt = gap === 0 ? '上期刚出现' : `${gap} 期未出`
        return (
          `<b>${stats[i].label}</b> · ${stats[i].desc}<br/>` +
          `历史出现 <b style="color:${BASE_COLORS[i]}">${cnt}</b> 次　实际占比 ${actualPct}%<br/>` +
          `当前遗漏 <b style="color:#fb923c">${gapTxt}</b><br/>` +
          `预测概率 <b style="color:${pcts[i] < THEOR_PCT - 2 ? '#f87171' : '#4ade80'}">${pred}%</b>　${trend} ${sign}${diff}%`
        )
      },
    },
    grid: { top: 56, right: 24, bottom: 56, left: 52, containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.map((d) => d.label),
      axisLabel: {
        interval: 0,
        fontSize: 13,
        lineHeight: 18,
        formatter(value, idx) {
          const d = stats[idx]
          return `{name|${d.label}}\n{desc|${d.desc}}\n{cnt|（${d.count}次）}`
        },
        rich: {
          name: { color: '#94a3b8', fontSize: 14, fontWeight: 'bold', lineHeight: 20 },
          desc: { color: '#94a3b8', fontSize: 11, lineHeight: 15 },
          cnt:  { color: '#64748b', fontSize: 11, lineHeight: 15 },
        },
      },
      axisLine: { lineStyle: { color: '#334155' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '预测概率',
      nameTextStyle: { color: '#64748b', fontSize: 12 },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false },
      max: (v) => Math.max(THEOR_PCT * 1.6, Math.ceil(v.max * 1.3)),
    },
    series: [
      {
        name: '预测概率',
        type: 'bar',
        data: stats.map((d, i) => {
          const p = pcts[i]
          const excess = p - THEOR_PCT
          let color = BASE_COLORS[i]
          if (excess < -3) {
            color = blendHex(BASE_COLORS[i], '#ef4444', Math.min(0.55, Math.abs(excess) * 0.035))
          } else if (excess > 3) {
            color = blendHex(BASE_COLORS[i], '#4ade80', Math.min(0.5, excess * 0.03))
          }
          return {
            value: Number(p.toFixed(2)),
            itemStyle: {
              color,
              borderRadius: [8, 8, 0, 0],
              shadowBlur: excess > 0 ? 16 : 8,
              shadowColor: excess > 0 ? '#4ade8066' : BASE_COLORS[i] + '66',
            },
          }
        }),
        barMaxWidth: 96,
        label: {
          show: true,
          position: 'top',
          distance: 6,
          lineHeight: 16,
          formatter(p) {
            const gap = omissions.value[p.dataIndex]
            return `{pct|${p.value}%}\n{gap|遗漏 ${gap}}`
          },
          rich: {
            pct: { color: '#fbbf24', fontSize: 14, fontWeight: 'bold', lineHeight: 20 },
            gap: { color: '#fb923c', fontSize: 11, fontWeight: 'bold', lineHeight: 16 },
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#64748b', type: 'dashed', width: 1 },
          label: {
            formatter: '理论 25%',
            color: '#64748b',
            fontSize: 11,
            position: 'insideEndTop',
          },
          data: [{ yAxis: THEOR_PCT }],
        },
      },
    ],
  }
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <button
        v-for="d in DAYS_OPTIONS"
        :key="d"
        class="day-btn"
        :class="{ active: selectedDays === d }"
        @click="selectedDays = d"
      >
        近 {{ d }} 天
      </button>
      <span class="period-count">
        共 <b>{{ totalDraws }}</b> 期 &nbsp;·&nbsp; 理论每种 25%
      </span>
    </div>

    <VChart :option="option" autoresize class="chart" />
  </div>
</template>

<style scoped>
.wrap { width: 100%; }

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.day-btn {
  padding: 5px 13px;
  border-radius: 20px;
  border: 1px solid #334155;
  background: transparent;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.day-btn:hover { border-color: #fbbf24; color: #fbbf24; }
.day-btn.active {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  border-color: transparent;
  color: #0f172a;
  font-weight: 700;
}

.period-count {
  margin-left: auto;
  font-size: 12px;
  color: #475569;
  white-space: nowrap;
}
.period-count b { color: #94a3b8; }

.chart {
  width: 100%;
  height: 300px;
}
</style>
