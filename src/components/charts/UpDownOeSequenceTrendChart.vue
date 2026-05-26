<script setup>
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  GraphicComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import {
  PATTERN_LABELS,
  OE_SEQUENCE_LABELS,
  patternIdxOf,
  oeSequenceIdxOf,
} from '../../utils/predict.js'
import {
  ORDER_MODES,
  idxToRank,
  positionAgreement,
  resolveAxisOrders,
  structuralHamming,
  topJointPairs,
  buildIntersectionProbSeries,
  nextIntersectionProbPct,
  intersectionBacktestSummary,
} from '../../utils/patternOeAxisOrder.js'
import { chartDataZoomPair, shortChartDate, useZoomRangeLabels } from '../../utils/chartDataZoom.js'
import ChartZoomRangeFooter from './ChartZoomRangeFooter.vue'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, GraphicComponent, CanvasRenderer])

const props = defineProps({
  draws: { type: Array, default: () => [] },
})

const orderMode = ref('aligned')

const PAT_COLOR = '#fbbf24'
const OE_COLOR = '#22d3ee'
const INTERSECT_COLOR = '#4ade80'

const axisSetup = computed(() => resolveAxisOrders(props.draws, orderMode.value))

const insight = computed(() => {
  const n = props.draws.length
  if (!n) return null
  let sameIdx = 0
  const ham = [0, 0, 0, 0]
  for (const draw of props.draws) {
    const p = patternIdxOf(draw)
    const o = oeSequenceIdxOf(draw)
    if (p === o) sameIdx++
    ham[structuralHamming(draw)]++
  }
  const topPairs = topJointPairs(axisSetup.value.joint, PATTERN_LABELS, OE_SEQUENCE_LABELS, 3)
  return {
    samePct: ((sameIdx / n) * 100).toFixed(1),
    hamPct: ham.map((c, i) => `${i}位${((c / n) * 100).toFixed(0)}%`).join(' · '),
    topPairs,
  }
})

const chartData = computed(() => {
  const { patOrder, oeOrder } = axisSetup.value
  const issues = []
  const patRank = []
  const oeRank = []
  for (const draw of props.draws) {
    issues.push(String(draw.issue))
    patRank.push(idxToRank(patternIdxOf(draw), patOrder))
    oeRank.push(idxToRank(oeSequenceIdxOf(draw), oeOrder))
  }
  const patLabels = patOrder.map((i) => PATTERN_LABELS[i])
  const oeLabels = oeOrder.map((i) => OE_SEQUENCE_LABELS[i])
  return { issues, patRank, oeRank, patLabels, oeLabels, patOrder, oeOrder }
})

const intersectionSeries = computed(() => {
  const { patOrder, oeOrder } = axisSetup.value
  const { probs, actualHits, baseline } = buildIntersectionProbSeries(props.draws, patOrder, oeOrder)
  const nextProb = nextIntersectionProbPct(props.draws, patOrder, oeOrder, axisSetup.value.joint)
  const backtest = intersectionBacktestSummary(probs, actualHits)
  return { probs, actualHits, baseline, nextProb, backtest }
})

const intersectMarkPoints = computed(() => {
  const { patRank } = chartData.value
  return intersectionSeries.value.actualHits
    .map((hit, i) => (hit ? { coord: [i, patRank[i]], value: '交' } : null))
    .filter(Boolean)
})

const zoomDates = computed(() => props.draws.map((d) => d.kjdate))
const { rangeLabels, onDataZoom, zoomStart, zoomEnd } = useZoomRangeLabels(
  () => chartData.value.issues,
  () => zoomDates.value,
  () => chartData.value.issues.length,
)

const option = computed(() => {
  const { issues, patRank, oeRank, patLabels, oeLabels } = chartData.value
  const dates = zoomDates.value
  const { probs, actualHits, nextProb } = intersectionSeries.value
  const probMax = Math.max(35, ...probs.map((p) => p ?? 0), nextProb) + 5
  const actualScatter = actualHits
    .map((hit, i) => (hit ? [i, Math.min(probMax - 1, (probs[i] ?? 0) + 3)] : null))
    .filter(Boolean)

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 13 },
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
        },
        crossStyle: { color: 'rgba(255, 255, 255, 0.85)', width: 1, type: 'dashed' },
      },
      formatter(params) {
        const i = params[0]?.dataIndex
        const draw = props.draws[i]
        if (!draw) return ''
        const pat = params.find((p) => p.seriesName === '上下形态')
        const oe = params.find((p) => p.seriesName === '奇偶排序')
        const patLabel = pat ? patLabels[pat.value] : '—'
        const oeLabel = oe ? oeLabels[oe.value] : '—'
        const agree = positionAgreement(draw)
        const ham = structuralHamming(draw)
        const rankGap = pat && oe ? Math.abs(pat.value - oe.value) : 0
        const intersectPred = probs[i]
        const intersectHit = actualHits[i]
        const intersectMark = intersectHit
          ? '<span style="color:#4ade80">● 实际相交</span>'
          : '<span style="color:#64748b">○ 未相交</span>'
        const posLines = agree
          .map((p) => {
            const mark = p.agree ? '✓' : '✗'
            const color = p.agree ? '#4ade80' : '#f87171'
            return `<span style="color:${color}">${mark}</span> ${p.name}位 ${p.pat}/${p.oe}`
          })
          .join('　')
        const gapHint =
          rankGap === 0
            ? '<span style="color:#4ade80">两线同层 → 三位 0/1 结构一致，可联动看形态+奇偶</span>'
            : rankGap <= 1
              ? '<span style="color:#fbbf24">两线邻近 → 仅 1 档结构差，关注分歧位</span>'
              : '<span style="color:#94a3b8">两线分离 → 上下与奇偶结构差异大</span>'
        return (
          `<div style="font-weight:600;margin-bottom:4px">期号 ${draw.issue}</div>` +
          `<div style="color:#94a3b8">${draw.kjdate}</div>` +
          `<div style="margin-top:6px;font-size:15px;color:#fbbf24">开奖 ${draw.digits.join(' ')}</div>` +
          `<div style="margin-top:8px"><span style="color:${PAT_COLOR}">●</span> 上下形态 <b>${patLabel}</b></div>` +
          `<div><span style="color:${OE_COLOR}">●</span> 奇偶排序 <b>${oeLabel}</b></div>` +
          `<div style="margin-top:6px;color:#94a3b8">结构差 ${ham} 位不一致 · 图位差 ${rankGap}</div>` +
          `<div style="margin-top:4px"><span style="color:${INTERSECT_COLOR}">◆</span> 相交预测 <b>${intersectPred?.toFixed?.(1) ?? intersectPred}%</b> · ${intersectMark}</div>` +
          `<div style="margin-top:4px;font-size:12px">${posLines}</div>` +
          `<div style="margin-top:6px;font-size:12px">${gapHint}</div>`
        )
      },
    },
    legend: {
      data: ['上下形态', '奇偶排序', '相交概率', '实际相交'],
      textStyle: { color: '#94a3b8' },
      top: 0,
    },
    grid: [
      { left: 92, right: 96, top: 48, bottom: 140, containLabel: false },
      { left: 118, right: 96, top: '79%', height: '9%', bottom: 52, containLabel: false },
    ],
    xAxis: [
      {
        type: 'category',
        gridIndex: 0,
        data: issues,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#334155' } },
        boundaryGap: false,
      },
      {
        type: 'category',
        gridIndex: 1,
        data: issues,
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          margin: 10,
          hideOverlap: true,
          interval: Math.max(0, Math.floor(issues.length / 6)),
          formatter: (value) => {
            const i = issues.indexOf(String(value))
            const date = i >= 0 ? dates[i] : ''
            return date ? shortChartDate(date) : value
          },
        },
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        boundaryGap: false,
      },
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        name: '上下形态',
        min: 0,
        max: 7,
        interval: 1,
        position: 'left',
        nameGap: 14,
        nameTextStyle: { color: PAT_COLOR, fontSize: 12 },
        axisLabel: {
          color: PAT_COLOR,
          fontSize: 10,
          width: 44,
          overflow: 'truncate',
          margin: 6,
          formatter: (v) => patLabels[v] ?? '',
        },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLine: { show: true, lineStyle: { color: '#334155' } },
      },
      {
        type: 'value',
        gridIndex: 0,
        name: '奇偶排序',
        min: 0,
        max: 7,
        interval: 1,
        position: 'right',
        nameGap: 16,
        nameTextStyle: { color: OE_COLOR, fontSize: 12 },
        axisLabel: {
          color: OE_COLOR,
          fontSize: 9,
          width: 40,
          overflow: 'truncate',
          margin: 8,
          hideOverlap: true,
          formatter: (v) => oeLabels[v] ?? '',
        },
        splitLine: { show: false },
        axisLine: { show: true, lineStyle: { color: '#334155' } },
      },
      {
        type: 'value',
        gridIndex: 1,
        min: 0,
        max: probMax,
        splitNumber: 2,
        position: 'left',
        name: '',
        axisLabel: {
          show: true,
          color: INTERSECT_COLOR,
          fontSize: 9,
          margin: 4,
          formatter: (v) => `${Math.round(v)}%`,
        },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
    ],
    dataZoom: chartDataZoomPair({
      issueCount: issues.length,
      start: zoomStart.value,
      end: zoomEnd.value,
      xAxisIndex: [0, 1],
      color: '#fbbf24',
      fillerColor: 'rgba(251, 191, 36, 0.12)',
      insetLeft: 92,
      insetRight: 96,
    }),
    graphic: [
      {
        type: 'text',
        left: 120,
        top: '79.5%',
        style: {
          text: '相交概率',
          fill: INTERSECT_COLOR,
          fontSize: 11,
          fontWeight: 600,
        },
      },
    ],
    series: [
      {
        name: '上下形态',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: patRank,
        smooth: false,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: issues.length <= 120,
        lineStyle: { width: 2, color: PAT_COLOR },
        itemStyle: { color: PAT_COLOR, borderColor: '#fff', borderWidth: 1 },
        emphasis: { focus: 'series', scale: 1.2 },
        markPoint: intersectMarkPoints.value.length
          ? {
              symbol: 'pin',
              symbolSize: 28,
              label: { show: false },
              itemStyle: { color: INTERSECT_COLOR, borderColor: '#fff', borderWidth: 1 },
              data: intersectMarkPoints.value,
            }
          : undefined,
      },
      {
        name: '奇偶排序',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 1,
        data: oeRank,
        smooth: false,
        symbol: 'diamond',
        symbolSize: 5,
        showSymbol: issues.length <= 120,
        lineStyle: { width: 2, color: OE_COLOR },
        itemStyle: { color: OE_COLOR, borderColor: '#fff', borderWidth: 1 },
        emphasis: { focus: 'series', scale: 1.2 },
      },
      {
        name: '相交概率',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: probs,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color: INTERSECT_COLOR },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(74, 222, 128, 0.35)' },
              { offset: 1, color: 'rgba(74, 222, 128, 0.04)' },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#64748b', type: 'dashed', width: 1 },
          label: {
            color: '#64748b',
            fontSize: 9,
            position: 'insideStartTop',
            formatter: '理论 {c}%',
          },
          data: [{ yAxis: intersectionSeries.value.baseline }],
        },
      },
      {
        name: '实际相交',
        type: 'scatter',
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: actualScatter,
        symbol: 'circle',
        symbolSize: 7,
        itemStyle: { color: INTERSECT_COLOR, borderColor: '#fff', borderWidth: 1 },
        z: 5,
      },
    ],
  }
})
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <span class="toolbar-label">Y 轴排序</span>
      <button
        v-for="m in ORDER_MODES"
        :key="m.id"
        type="button"
        class="mode-btn"
        :class="{ active: orderMode === m.id }"
        @click="orderMode = m.id"
      >
        {{ m.label }}
      </button>
    </div>

    <p v-if="insight" class="insight">
      <span>历史 <b>{{ insight.samePct }}%</b> 期上下与奇偶<strong>索引相同</strong>（三位 0/1 结构一致）；结构差分布：{{ insight.hamPct }}。</span>
      <span class="insight-intersect">
        下期两线<strong>同层相交</strong>预测概率
        <b class="intersect-next">{{ intersectionSeries.nextProb }}%</b>
        <template v-if="intersectionSeries.backtest.hitRate">
          · 预测 ≥25% 时历史命中 {{ intersectionSeries.backtest.hitRate }}%（{{ intersectionSeries.backtest.highN }} 期）
        </template>
      </span>
      <span class="insight-pairs">
        高共现：
        <template v-for="(pair, i) in insight.topPairs" :key="pair.pat + pair.oe">
          <span v-if="i"> · </span>{{ pair.pat }}+{{ pair.oe }} {{ pair.pct.toFixed(1) }}%
        </template>
      </span>
    </p>

    <div class="chart-wrap">
      <VChart :option="option" autoresize class="chart" @datazoom="onDataZoom" />
      <ChartZoomRangeFooter :start="rangeLabels.start" :end="rangeLabels.end" />
    </div>
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

.toolbar-label {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}

.mode-btn {
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid #334155;
  background: transparent;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
}
.mode-btn:hover { border-color: #22d3ee; color: #22d3ee; }
.mode-btn.active {
  background: linear-gradient(135deg, #22d3ee, #0ea5e9);
  border-color: transparent;
  color: #0f172a;
  font-weight: 700;
}

.insight {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.55;
  color: #64748b;
}
.insight b { color: #94a3b8; }
.insight strong { color: #cbd5e1; font-weight: 600; }
.insight-intersect { display: block; margin-top: 4px; color: #64748b; }
.intersect-next { color: #4ade80 !important; font-size: 13px; }
.insight-pairs { display: block; margin-top: 4px; color: #475569; }

.chart-wrap {
  position: relative;
  width: 100%;
}

.chart {
  width: 100%;
  height: 480px;
}
</style>
