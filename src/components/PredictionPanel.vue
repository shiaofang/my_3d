<script setup>
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getNumberType } from '../utils/parser.js'

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({
  prediction: { type: Object, default: null },
  compact: { type: Boolean, default: false },
})

const PRIMARY_STYLE = {
  accent: '#fbbf24',
  glow: 'rgba(251,191,36,0.45)',
  icon: '🥇',
  tag: '首选',
}

const showGroupModal = ref(false)

const primary = computed(() => props.prediction?.recommendations?.[0] ?? null)

const predictionGroups = computed(() => props.prediction?.predictionGroups ?? [])

const groupChartOption = computed(() => {
  const groups = predictionGroups.value
  if (!groups.length) return null
  const labels = groups.map((g) => g.label)
  const probs = groups.map((g) => g.probability)
  return {
    backgroundColor: 'transparent',
    grid: { left: 48, right: 16, top: 24, bottom: 40 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15,23,42,0.95)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter(params) {
        const p = params[0]
        const g = groups[p.dataIndex]
        return `${g.label}<br/>相对概率 <b style="color:#fbbf24">${g.probability}%</b><br/>综合评分 ${g.score}`
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#94a3b8', fontSize: 12, fontWeight: 700 },
      axisLine: { lineStyle: { color: '#334155' } },
    },
    yAxis: {
      type: 'value',
      name: '概率%',
      nameTextStyle: { color: '#64748b', fontSize: 11 },
      axisLabel: { color: '#64748b', formatter: '{value}%' },
      splitLine: { lineStyle: { color: 'rgba(51,65,85,0.5)' } },
    },
    series: [{
      type: 'bar',
      data: probs,
      barMaxWidth: 36,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: '#fbbf24' },
            { offset: 1, color: '#d97706' },
          ],
        },
        borderRadius: [4, 4, 0, 0],
      },
      label: {
        show: true,
        position: 'top',
        color: '#fbbf24',
        fontSize: 11,
        formatter: '{c}%',
      },
    }],
  }
})

/** 推荐号码实际形态（组三/组六），由三位号码计算 */
const recNumberType = computed(() => {
  const p = primary.value
  if (!p?.digits?.length) return null
  const t = getNumberType(p.digits)
  return t === '豹子' ? null : t
})

function digitColor(d) {
  return d <= 4 ? '#fbbf24' : '#60a5fa'
}

function openGroupModal() {
  if (predictionGroups.value.length) showGroupModal.value = true
}
</script>

<template>
  <div v-if="primary && compact" class="pred-inline">
    <div class="inline-head">
      <span class="label">下期推荐号码</span>
      <span
        v-if="recNumberType"
        class="inline-type"
        :class="recNumberType === '组三' ? 'type-zu3' : 'type-zu6'"
      >{{ recNumberType }}</span>
    </div>
    <div
      class="inline-combo"
      :title="`${PRIMARY_STYLE.tag} · ${recNumberType} · 上下${primary.pattern} · 奇偶${primary.oddEvenRatio}`"
    >
      <span class="inline-tag" :style="{ color: PRIMARY_STYLE.accent }">{{ PRIMARY_STYLE.tag }}</span>
      <span class="inline-nums">
        <span v-for="(n, i) in primary.digits" :key="i" class="inline-ball">{{ n }}</span>
      </span>
      <button
        v-if="predictionGroups.length"
        type="button"
        class="btn-pred-group"
        title="查看概率最高的预测号码组"
        @click="openGroupModal"
      >预测组</button>
    </div>
  </div>

  <div v-else-if="primary" class="pred-wrap">
    <div class="pred-header">
      <div class="title-row">
        <span class="pred-title">⭐ 下期推荐号码</span>
        <span class="pred-basis">
          形态·奇偶比·和值·组三/组六 + 组合次数中间段 · 近 {{ prediction.basePeriods }} 期
        </span>
      </div>
      <div class="pattern-banner">
        <span class="banner-label">上下形态</span>
        <span class="banner-pattern">{{ prediction.topPattern }}</span>
        <span class="banner-prob">{{ prediction.topPatternProb }}%</span>
        <span class="banner-divider" />
        <span class="banner-label">最优奇偶比</span>
        <span class="banner-pattern oe">{{ prediction.topOddEven }}</span>
        <span class="banner-prob oe">{{ prediction.topOddEvenProb }}%</span>
        <span class="banner-divider" />
        <span class="banner-label">近期和值</span>
        <span class="banner-sum">{{ prediction.recentSumAvg }}</span>
        <span class="banner-divider" />
        <span class="banner-label">下期倾向</span>
        <span class="banner-pattern type">{{ prediction.topType }}</span>
        <span class="banner-prob type">{{ prediction.topTypeProb }}%</span>
      </div>
      <p v-if="prediction.typeSignal" class="type-signal">{{ prediction.typeSignal }}</p>
    </div>

    <div class="combos">
      <div
        class="combo-card"
        :style="{ '--accent': PRIMARY_STYLE.accent, '--glow': PRIMARY_STYLE.glow }"
      >
        <div class="combo-head">
          <span class="rank-icon">{{ PRIMARY_STYLE.icon }}</span>
          <div class="rank-info">
            <span class="rank-tag">{{ PRIMARY_STYLE.tag }}</span>
            <span class="rank-pattern">综合评分 {{ primary.score }}</span>
          </div>
        </div>

        <div class="balls-row">
          <div
            v-for="(digit, i) in primary.digits"
            :key="i"
            class="ball-slot"
          >
            <span class="pos-tag">{{ ['百位','十位','个位'][i] }}</span>
            <span
              class="big-ball"
              :style="{ '--ball-color': digitColor(digit) }"
            >{{ digit }}</span>
            <span class="pos-flag" :class="primary.flags[i] === 0 ? 'up' : 'down'">
              {{ primary.flags[i] === 0 ? '上' : '下' }}
            </span>
          </div>
        </div>

        <div class="meta-row">
          <span class="meta-pill">
            <span class="dot dot-gold" />
            形态 {{ primary.pattern }}
          </span>
          <span class="meta-pill oe-pill">
            <span class="dot dot-cyan" />
            奇偶比 <b>{{ primary.oddEvenRatio }}</b>
            <span class="oe-prob">{{ primary.oddEvenProb }}%</span>
          </span>
          <span
            v-if="primary.numberType"
            class="meta-pill type-pill"
            :class="primary.numberType === '组三' ? 'type-zu3' : 'type-zu6'"
          >
            {{ primary.numberType }}
            <span class="type-prob">{{ primary.numberTypeProb }}%</span>
          </span>
        </div>
      </div>
    </div>

    <div class="legend-row">
      <span class="leg"><span class="ldot up" /> 上 (0–4)</span>
      <span class="leg"><span class="ldot down" /> 下 (5–9)</span>
      <span class="leg-spacer" />
      <span class="leg-note">
        首选优先从历史开奖中选取，组合出现次数在 3D 图次数 1/3～2/3 区间内
      </span>
    </div>

    <p class="disclaimer">⚠️ 预测仅供参考，彩票结果随机，请理性购彩。</p>
  </div>

  <Teleport to="body">
    <div
      v-if="showGroupModal && predictionGroups.length"
      class="group-overlay"
      @click.self="showGroupModal = false"
    >
      <div class="group-dialog" role="dialog" aria-labelledby="group-dialog-title">
        <div class="group-dialog-head">
          <div>
            <h3 id="group-dialog-title" class="group-dialog-title">预测组</h3>
            <p class="group-dialog-sub">
              形态 {{ prediction.topPattern }} · 奇偶 {{ prediction.topOddEven }}
              · 共 {{ predictionGroups.length }} 组（相对概率）
            </p>
          </div>
          <button type="button" class="group-close" @click="showGroupModal = false">×</button>
        </div>

        <ul class="group-list">
          <li v-for="g in predictionGroups" :key="g.label" class="group-item">
            <span class="group-rank">{{ g.rank }}</span>
            <span class="group-nums">
              <span v-for="(n, i) in g.digits" :key="i" class="group-ball">{{ n }}</span>
            </span>
            <span class="group-type" :class="g.numberType === '组三' ? 'type-zu3' : 'type-zu6'">
              {{ g.numberType }}
            </span>
            <span class="group-prob">{{ g.probability }}%</span>
          </li>
        </ul>

        <div v-if="groupChartOption" class="group-chart-wrap">
          <VChart class="group-chart" :option="groupChartOption" autoresize />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pred-inline {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: 28px;
}

.inline-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pred-inline .label {
  font-size: 11px;
  color: #64748b;
}

.inline-type {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 6px;
}

.inline-type.type-zu3 {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
}

.inline-type.type-zu6 {
  color: #34d399;
  background: rgba(52, 211, 153, 0.12);
}

.inline-combo {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: default;
}

.inline-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  min-width: 24px;
}

.inline-nums {
  display: flex;
  gap: 3px;
}

.inline-ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fbbf24, #f59e0b);
  color: #1c1917;
  font-weight: 700;
  font-size: 12px;
  box-shadow: 0 1px 4px rgba(251, 191, 36, 0.35);
}

.btn-pred-group {
  margin-left: 4px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.btn-pred-group:hover {
  background: rgba(251, 191, 36, 0.2);
  border-color: rgba(251, 191, 36, 0.55);
}

.group-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(4px);
}

.group-dialog {
  width: min(480px, 100%);
  max-height: min(94vh, 740px);
  overflow: hidden;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 16px 18px 18px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
}

.group-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.group-dialog-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
}

.group-dialog-sub {
  margin: 0;
  font-size: 11px;
  color: #64748b;
}

.group-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}
.group-close:hover {
  color: #f8fafc;
  background: rgba(248, 113, 113, 0.2);
}

.group-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.group-rank {
  width: 18px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-align: center;
}

.group-nums {
  display: flex;
  gap: 3px;
  flex: 1;
}

.group-ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fbbf24, #f59e0b);
  color: #1c1917;
  font-weight: 700;
  font-size: 12px;
}

.group-type {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 6px;
}
.group-type.type-zu3 {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
}
.group-type.type-zu6 {
  color: #34d399;
  background: rgba(52, 211, 153, 0.12);
}

.group-prob {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
  min-width: 42px;
  text-align: right;
}

.group-chart-wrap {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 12px;
}

.group-chart {
  width: 100%;
  height: 220px;
}

.pred-wrap {
  margin: 0 32px 8px;
  padding: 18px 24px 14px;
  background: linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.88) 100%);
  border: 1px solid #334155;
  border-radius: 16px;
  backdrop-filter: blur(6px);
}

.pred-header { margin-bottom: 14px; }

.title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.pred-title {
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: 0.5px;
}

.pred-basis {
  font-size: 12px;
  color: #64748b;
}

.pattern-banner {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 10px;
  flex-wrap: wrap;
}

.banner-label { font-size: 11px; color: #94a3b8; letter-spacing: 0.5px; }
.banner-pattern { font-size: 16px; font-weight: 800; color: #fbbf24; letter-spacing: 1px; }
.banner-pattern.oe { color: #22d3ee; letter-spacing: 0.5px; }
.banner-pattern.type { color: #34d399; letter-spacing: 0.5px; }
.banner-prob { font-size: 13px; font-weight: 700; color: #fbbf24; padding: 1px 8px; border-radius: 8px; background: rgba(251, 191, 36, 0.15); }
.banner-prob.oe { color: #22d3ee; background: rgba(34, 211, 238, 0.14); }
.banner-prob.type { color: #34d399; background: rgba(52, 211, 153, 0.14); }

.type-signal {
  margin: 8px 0 0;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}
.banner-divider { width: 1px; height: 16px; background: rgba(255, 255, 255, 0.12); margin: 0 4px; }
.banner-sum { font-size: 16px; font-weight: 800; color: #60a5fa; }

.combos {
  display: grid;
  grid-template-columns: 1fr;
  max-width: 420px;
}

.combo-card {
  position: relative;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px 18px 12px;
  transition: all 0.22s;
  overflow: hidden;
}

.combo-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2.5px;
  background: var(--accent);
  opacity: 0.85;
}

.combo-card:hover {
  border-color: var(--accent);
  box-shadow: 0 0 22px var(--glow);
  transform: translateY(-1px);
}

.combo-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.rank-icon { font-size: 26px; line-height: 1; }
.rank-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.rank-tag { font-size: 14px; font-weight: 700; color: var(--accent); letter-spacing: 0.4px; }
.rank-pattern { font-size: 11px; color: #64748b; letter-spacing: 0.3px; }

.balls-row {
  display: flex;
  justify-content: space-around;
  gap: 10px;
  padding: 6px 0 12px;
}

.ball-slot { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.pos-tag { font-size: 10px; color: #64748b; letter-spacing: 0.5px; }

.big-ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--ball-color), color-mix(in srgb, var(--ball-color) 55%, #000));
  color: #0f172a;
  font-weight: 900;
  font-size: 22px;
  box-shadow: 0 3px 14px color-mix(in srgb, var(--ball-color) 50%, transparent);
}

.pos-flag {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 8px;
  letter-spacing: 0.5px;
}
.pos-flag.up   { background: rgba(251,191,36,0.18); color: #fbbf24; }
.pos-flag.down { background: rgba(96,165,250,0.18); color: #60a5fa; }

.meta-row {
  display: flex;
  gap: 8px;
  border-top: 1px dashed rgba(255,255,255,0.06);
  padding-top: 10px;
  flex-wrap: wrap;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  font-size: 11px;
}

.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.dot-gold { background: #fbbf24; }
.dot-orange { background: #fb923c; }
.dot-cyan { background: #22d3ee; }

.oe-pill b { color: #22d3ee; margin: 0 2px; font-weight: 800; }
.oe-prob { color: #22d3ee; opacity: 0.75; font-size: 10px; margin-left: 2px; }

.type-pill { font-weight: 700; }
.type-zu3 { color: #fbbf24; background: rgba(251, 191, 36, 0.1); }
.type-zu6 { color: #34d399; background: rgba(52, 211, 153, 0.1); }
.type-prob { font-size: 10px; opacity: 0.8; margin-left: 4px; font-weight: 600; }

.legend-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.leg { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #94a3b8; }
.ldot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.ldot.up   { background: #fbbf24; }
.ldot.down { background: #60a5fa; }
.leg-spacer { flex: 1; }
.leg-note { font-size: 11px; color: #475569; }

.disclaimer {
  margin: 8px 0 0;
  font-size: 11px;
  color: #475569;
  text-align: center;
}

@media (max-width: 900px) {
  .pred-wrap { margin: 0 16px 8px; padding: 14px 14px 12px; }
  .combos { grid-template-columns: 1fr; }
  .legend-row { flex-direction: column; align-items: flex-start; gap: 6px; }
  .pred-inline { width: auto; }
}
</style>
