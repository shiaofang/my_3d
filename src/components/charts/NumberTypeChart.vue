<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { predictTypeProbabilities } from '../../utils/numberTypePattern.js'

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({
  draws: { type: Array, default: () => [] },
})

const LABELS = ['组三', '组六']
const DESCRIPTIONS = ['对子+单号', '三位各异']
const BASE_COLORS = ['#fbbf24', '#34d399']

const analysis = computed(() => predictTypeProbabilities(props.draws))

const filteredStats = computed(() =>
  LABELS.map((label, i) => ({
    label,
    desc: DESCRIPTIONS[i],
    count: analysis.value.counts[label] ?? 0,
  })),
)

const totalDraws = computed(() => analysis.value.seq?.length ?? 0)
const predictedPcts = computed(() => analysis.value.pcts)

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
  const a = analysis.value

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
        const zu6Run = a.trailingZu6 ?? 0
        const runTxt =
          a.lastType === '组六'
            ? `当前已连续 <b style="color:#34d399">${zu6Run}</b> 期组六`
            : '上期刚出组三'
        return (
          `<b>${stats[i].label}</b> · ${stats[i].desc}<br/>` +
          `${a.windowLabel || '分析窗口'}出现 <b style="color:${BASE_COLORS[i]}">${cnt}</b> 次　占比 ${actualPct}%<br/>` +
          `${runTxt}<br/>` +
          `<span style="color:#94a3b8">${a.pattern?.hint?.replace(/<[^>]+>/g, '') || ''}</span><br/>` +
          `<span style="color:#64748b">${a.signalLabel || ''}</span><br/>` +
          `预测 <b style="color:${BASE_COLORS[i]}">${pred}%</b>`
        )
      },
    },
    grid: { top: 48, right: 16, bottom: 48, left: 48, containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.map((d) => d.label),
      axisLabel: {
        interval: 0,
        fontSize: 14,
        fontWeight: 'bold',
        color: '#94a3b8',
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
      max: (v) => Math.max(88, Math.ceil(v.max * 1.1)),
    },
    series: [
      {
        name: '预测概率',
        type: 'bar',
        data: stats.map((d, i) => {
          const p = pcts[i]
          const beatsOther = i === 0 ? p > pcts[1] : p > pcts[0]
          let color = BASE_COLORS[i]
          if (beatsOther) {
            color = blendHex(BASE_COLORS[i], '#fde047', i === 0 ? 0.35 : 0.2)
          }
          return {
            value: Number(p.toFixed(2)),
            itemStyle: {
              color,
              borderRadius: [8, 8, 0, 0],
              shadowBlur: beatsOther ? 20 : 8,
              shadowColor: beatsOther ? '#fbbf2488' : BASE_COLORS[i] + '55',
            },
          }
        }),
        barMaxWidth: 88,
        label: {
          show: true,
          position: 'top',
          distance: 6,
          formatter(p) {
            const win = p.dataIndex === 0 ? pcts[0] > pcts[1] : pcts[1] > pcts[0]
            const tag = win ? '{tag|▲ 占优}\n' : ''
            return `${tag}{pct|${p.value}%}`
          },
          rich: {
            tag: { color: '#fde047', fontSize: 11, fontWeight: 'bold', lineHeight: 16 },
            pct: { color: '#fbbf24', fontSize: 15, fontWeight: 'bold', lineHeight: 20 },
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
  height: 280px;
}
</style>
