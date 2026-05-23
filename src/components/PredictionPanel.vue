<script setup>
import { computed } from 'vue'

const props = defineProps({
  prediction: { type: Object, default: null },
  compact: { type: Boolean, default: false },
})

const RANK_STYLES = [
  { accent: '#fbbf24', glow: 'rgba(251,191,36,0.45)', icon: '🥇', tag: '首选' },
  { accent: '#a5b4fc', glow: 'rgba(165,180,252,0.4)', icon: '🥈', tag: '次选' },
]

const topTwo = computed(() => (props.prediction?.recommendations ?? []).slice(0, 2))

function styleFor(idx) {
  return RANK_STYLES[idx] ?? RANK_STYLES[RANK_STYLES.length - 1]
}

function digitColor(d) {
  return d <= 4 ? '#fbbf24' : '#60a5fa'
}
</script>

<template>
  <div v-if="prediction && prediction.recommendations.length && compact" class="pred-inline">
    <span class="label">下期推荐号码</span>
    <div class="inline-combos">
      <div
        v-for="(rec, idx) in topTwo"
        :key="idx"
        class="inline-combo"
        :title="`${styleFor(idx).tag} · 和值 ${rec.sum} · 形态 ${rec.pattern} · 奇偶比 ${rec.oddEvenRatio}`"
      >
        <span class="inline-tag" :style="{ color: styleFor(idx).accent }">{{ styleFor(idx).tag }}</span>
        <span class="inline-nums">
          <span v-for="(n, i) in rec.digits" :key="i" class="inline-ball">{{ n }}</span>
        </span>
        <span class="inline-sum">{{ rec.sum }}</span>
      </div>
    </div>
  </div>

  <div v-else-if="prediction && prediction.recommendations.length" class="pred-wrap">
    <div class="pred-header">
      <div class="title-row">
        <span class="pred-title">⭐ 下期推荐号码</span>
        <span class="pred-basis">
          基于「上下形态分布」反向冷却 + 和值参考 · 近 {{ prediction.basePeriods }} 期
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
      </div>
    </div>

    <div class="combos">
      <div
        v-for="(rec, idx) in topTwo"
        :key="idx"
        class="combo-card"
        :style="{ '--accent': styleFor(idx).accent, '--glow': styleFor(idx).glow }"
      >
        <div class="combo-head">
          <span class="rank-icon">{{ styleFor(idx).icon }}</span>
          <div class="rank-info">
            <span class="rank-tag">{{ styleFor(idx).tag }}</span>
            <span class="rank-pattern">综合评分 {{ rec.score }}</span>
          </div>
          <div class="combo-sum">
            <span class="sum-num">{{ rec.sum }}</span>
            <span class="sum-label">
              和值
              <span :class="['sum-dev', rec.sumDev >= 0 ? 'pos' : 'neg']">
                {{ rec.sumDev >= 0 ? '+' : '' }}{{ rec.sumDev }}
              </span>
            </span>
          </div>
        </div>

        <div class="balls-row">
          <div
            v-for="(digit, i) in rec.digits"
            :key="i"
            class="ball-slot"
          >
            <span class="pos-tag">{{ ['百位','十位','个位'][i] }}</span>
            <span
              class="big-ball"
              :style="{ '--ball-color': digitColor(digit) }"
            >{{ digit }}</span>
            <span class="pos-flag" :class="rec.flags[i] === 0 ? 'up' : 'down'">
              {{ rec.flags[i] === 0 ? '上' : '下' }}
            </span>
          </div>
        </div>

        <div class="meta-row">
          <span class="meta-pill">
            <span class="dot dot-gold" />
            形态 {{ rec.pattern }}
          </span>
          <span class="meta-pill oe-pill">
            <span class="dot dot-cyan" />
            奇偶比 <b>{{ rec.oddEvenRatio }}</b>
            <span class="oe-prob">{{ rec.oddEvenProb }}%</span>
          </span>
          <span class="meta-pill">
            <span class="dot dot-orange" />
            和值遗漏 {{ rec.sumGap }}
          </span>
        </div>
      </div>
    </div>

    <div class="legend-row">
      <span class="leg"><span class="ldot up" /> 上 (0–4)</span>
      <span class="leg"><span class="ldot down" /> 下 (5–9)</span>
      <span class="leg-spacer" />
      <span class="leg-note">
        评分 = 数字冷却 55% + 和值贴近 30% + 和值遗漏 15%
      </span>
    </div>

    <p class="disclaimer">⚠️ 预测仅供参考，彩票结果随机，请理性购彩。</p>
  </div>
</template>

<style scoped>
.pred-inline {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pred-inline .label {
  font-size: 11px;
  color: #64748b;
}

.inline-combos {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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

.inline-combo:nth-child(2) .inline-ball {
  background: linear-gradient(145deg, #c7d2fe, #a5b4fc);
  box-shadow: 0 2px 6px rgba(165, 180, 252, 0.35);
}

.inline-sum {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
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
.banner-prob { font-size: 13px; font-weight: 700; color: #fbbf24; padding: 1px 8px; border-radius: 8px; background: rgba(251, 191, 36, 0.15); }
.banner-prob.oe { color: #22d3ee; background: rgba(34, 211, 238, 0.14); }
.banner-divider { width: 1px; height: 16px; background: rgba(255, 255, 255, 0.12); margin: 0 4px; }
.banner-sum { font-size: 16px; font-weight: 800; color: #60a5fa; }

.combos {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
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

.combo-sum {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1;
}

.sum-num { font-size: 26px; font-weight: 900; color: var(--accent); }
.sum-label { margin-top: 4px; font-size: 11px; color: #94a3b8; letter-spacing: 0.3px; }

.sum-dev {
  margin-left: 4px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 6px;
}
.sum-dev.pos { color: #fbbf24; background: rgba(251,191,36,0.12); }
.sum-dev.neg { color: #60a5fa; background: rgba(96,165,250,0.12); }

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
  .inline-combos { gap: 12px; }
}
</style>
