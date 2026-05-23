<script setup>
import { computed, ref } from 'vue'
import { TRANSITION_POSITIONS, computeTransitionProbs } from '../utils/transition.js'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { avgMarkLine } from '../utils/chartAvgMarkLine.js'

use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

const props = defineProps({
  draws: { type: Array, default: () => [] },
})

const POSITIONS = TRANSITION_POSITIONS

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const THEOR_PCT = 10 // 1/10

const selectedPos = ref(2)
const selectedDigit = ref(4)

const posMeta = computed(() =>
  POSITIONS.find((p) => p.key === selectedPos.value) ?? POSITIONS[2],
)

const stats = computed(() => {
  const draws = props.draws
  if (!draws.length) {
    return { counts: new Array(10).fill(0), sampleSize: 0, total: 0 }
  }
  const { counts, sampleSize } = computeTransitionProbs(
    draws,
    selectedPos.value,
    selectedDigit.value,
  )
  return { counts, sampleSize, total: draws.length }
})

const lastGap = computed(() => {
  const draws = props.draws
  if (!draws.length) return null
  for (let i = draws.length - 1; i >= 0; i--) {
    if (draws[i]?.digits?.[selectedPos.value] === selectedDigit.value) {
      return draws.length - 1 - i
    }
  }
  return null
})

const lastDigitOfPosition = computed(() => {
  const draws = props.draws
  if (!draws.length) return null
  return draws[draws.length - 1]?.digits?.[selectedPos.value] ?? null
})

const transitionResult = computed(() =>
  computeTransitionProbs(props.draws, selectedPos.value, selectedDigit.value),
)

const omissions = computed(() => transitionResult.value.omissions)
const rawPercents = computed(() => transitionResult.value.rawPercents)
const percents = computed(() => transitionResult.value.percents)

const option = computed(() => {
  const pcts = percents.value
  const histPcts = rawPercents.value
  const { counts, sampleSize } = stats.value
  const baseColor = posMeta.value.color
  const topPct = Math.max(...pcts)

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
        const d = p.dataIndex
        const cnt = counts[d]
        const histPct = histPcts[d]
        const pct = pcts[d]
        const diff = (pct - THEOR_PCT).toFixed(1)
        const sign = Number(diff) >= 0 ? '+' : ''
        const trend = pct >= THEOR_PCT ? '▲ 高于理论' : '▼ 低于理论'
        const gap = omissions.value[d]
        const gapTxt = gap === 0 ? '上期刚出现' : `${gap} 期未出`
        return (
          `<b>${posMeta.value.label} 下一期 = ${d}</b><br/>` +
          `转移出现 <b style="color:${baseColor}">${cnt}</b> 次 / 共 ${sampleSize} 次　历史占比 ${histPct.toFixed(1)}%<br/>` +
          `当前遗漏 <b style="color:#fb923c">${gapTxt}</b><br/>` +
          `综合概率 <b style="color:${pct >= THEOR_PCT ? '#4ade80' : '#f87171'}">${pct.toFixed(1)}%</b>　${trend} ${sign}${diff}%`
        )
      },
    },
    grid: { top: 36, right: 16, bottom: 40, left: 56, containLabel: true },
    xAxis: {
      type: 'category',
      data: DIGITS,
      axisLabel: { color: '#94a3b8', fontSize: 13, fontWeight: 'bold' },
      axisLine: { lineStyle: { color: '#334155' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '概率',
      nameTextStyle: { color: '#64748b', fontSize: 12 },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false },
      max: (v) => Math.max(THEOR_PCT * 2, Math.ceil((v.max || 1) * 1.25)),
    },
    series: [
      {
        type: 'bar',
        data: DIGITS.map((d) => {
          const v = pcts[d]
          const isTop = sampleSize > 0 && Math.abs(v - topPct) < 1e-9 && v > 0
          return {
            value: Number(v.toFixed(2)),
            itemStyle: {
              color: isTop ? '#4ade80' : baseColor,
              borderRadius: [6, 6, 0, 0],
              shadowBlur: isTop ? 14 : 6,
              shadowColor: isTop ? '#4ade8088' : baseColor + '55',
              opacity: v === 0 ? 0.35 : 1,
            },
          }
        }),
        barMaxWidth: 56,
        label: {
          show: true,
          position: 'top',
          distance: 6,
          lineHeight: 16,
          formatter(p) {
            if (p.value <= 0) return ''
            const gap = omissions.value[p.dataIndex]
            return `{pct|${p.value}%}\n{gap|遗漏 ${gap}}`
          },
          rich: {
            pct: { color: '#fbbf24', fontSize: 12, fontWeight: 'bold', lineHeight: 18 },
            gap: { color: '#fb923c', fontSize: 11, fontWeight: 'bold', lineHeight: 16 },
          },
        },
        markLine: avgMarkLine(pcts),
      },
    ],
  }
})
</script>

<template>
  <div class="transition-panel">
    <div class="controls">
      <div class="filter-row">
        <span class="filter-label">位置</span>
        <div class="chip-group">
          <button
            v-for="opt in POSITIONS"
            :key="opt.key"
            class="chip"
            :class="{ active: selectedPos === opt.key }"
            @click="selectedPos = opt.key"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">当期值</span>
        <div class="chip-group">
          <button
            v-for="d in DIGITS"
            :key="d"
            class="chip chip-digit"
            :class="{ active: selectedDigit === d }"
            @click="selectedDigit = d"
          >
            {{ d }}
          </button>
        </div>
      </div>
    </div>

    <div class="summary">
      <div class="summary-line">
        历史中
        <b class="hi">{{ posMeta.label }} = {{ selectedDigit }}</b>
        共出现
        <b class="hi">{{ stats.sampleSize }}</b>
        次，        下一期
        <b class="hi">{{ posMeta.label }}</b>
        的综合概率分布如下（转移统计 + 遗漏加权）：
      </div>
      <div class="summary-sub">
        样本期数 {{ stats.total }} 期
        <template v-if="lastGap !== null">
          ·
          <span v-if="lastGap === 0">
            最新一期 {{ posMeta.label }} 正好为 {{ selectedDigit }}
            <span class="hot">（可直接当作下一期概率预测）</span>
          </span>
          <span v-else>
            距上次出现 {{ posMeta.label }} = {{ selectedDigit }} 已 {{ lastGap }} 期
          </span>
        </template>
        <template v-if="lastDigitOfPosition !== null">
          · 最新 {{ posMeta.label }} = <b class="cur">{{ lastDigitOfPosition }}</b>
        </template>
        <span
          v-if="lastDigitOfPosition !== null && lastDigitOfPosition !== selectedDigit"
          class="warn"
        >
          · 当期值与最新开奖不同，样本/遗漏按全量截至今日计算，与回测弹窗「截至该期」可能差 1 次转移
        </span>
      </div>
    </div>

    <div v-if="stats.sampleSize > 0" class="chart-wrap">
      <VChart :option="option" autoresize class="chart" />
    </div>

    <div v-else class="empty">
      历史样本中 {{ posMeta.label }} 暂未出现过 {{ selectedDigit }}，无法统计转移概率。
    </div>
  </div>
</template>

<style scoped>
.transition-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.filter-label {
  min-width: 56px;
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}

.chip-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(30, 41, 59, 0.5);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.chip-digit {
  min-width: 36px;
  padding: 6px 0;
  text-align: center;
  font-family: var(--mono);
  font-weight: 600;
}

.chip:hover {
  border-color: #fbbf24;
  color: #fbbf24;
}

.chip.active {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  border-color: #f59e0b;
  color: #1c1917;
  font-weight: 600;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.35);
  border-left: 3px solid #fbbf24;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
}

.summary-line .hi {
  color: #fbbf24;
  font-family: var(--mono);
  font-size: 14px;
  padding: 0 2px;
}

.summary-sub {
  font-size: 12px;
  color: #64748b;
}

.summary-sub .hot {
  color: #4ade80;
  font-weight: 600;
}

.summary-sub .cur {
  color: #e2e8f0;
  font-family: var(--mono);
}

.summary-sub .warn {
  color: #fb923c;
}

.chart-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chart {
  width: 100%;
  height: 280px;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  color: #64748b;
  font-size: 14px;
  background: rgba(15, 23, 42, 0.3);
  border: 1px dashed var(--border);
  border-radius: 10px;
}
</style>
