<script setup>
import { ref, computed } from 'vue'
import { buildPrediction, patternIdxOf, oeCatOf, PATTERN_LABELS, OE_LABELS } from '../utils/predict.js'
import {
  computeAllPositionTransitions,
  formatTransitionPct,
  sliceDrawsThroughIssue,
  transitionBarWidth,
} from '../utils/transition.js'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

const props = defineProps({
  /** Full chronological draws from the store (oldest → newest) */
  draws: { type: Array, default: () => [] },
})

// ── Controls ──────────────────────────────────────────────
const running = ref(false)
const results = ref(null)

// ── Helpers ───────────────────────────────────────────────
function countDigitMatches(predicted, actual) {
  return predicted.filter((d, i) => d === actual[i]).length
}

function isAnyComboExact(recs, actual) {
  return recs.some((r) => r.digits.join(',') === actual.join(','))
}

function maxDigitMatch(recs, actual) {
  return Math.max(...recs.map((r) => countDigitMatches(r.digits, actual)), 0)
}

/** 下期：优先测试集内，否则从全量历史中取下一期 */
function resolveNextDraw(testDraws, index, allDraws) {
  if (testDraws[index + 1]) return testDraws[index + 1]
  const cur = testDraws[index]
  const idx = allDraws.findIndex((d) => String(d.issue) === String(cur?.issue))
  return idx >= 0 && idx < allDraws.length - 1 ? allDraws[idx + 1] : null
}

function canShowTransition(row) {
  return Array.isArray(row.transition) && row.transition.length > 0
}

// ── Run backtest ──────────────────────────────────────────
async function runBacktest() {
  if (!props.draws.length) return
  running.value = true
  results.value = null
  page.value = 1

  // Yield to render the spinner
  await new Promise((r) => setTimeout(r, 30))

  try {
    const total = props.draws.length
    const splitIdx = Math.floor(total * 2 / 3)

    const trainDraws = props.draws.slice(0, splitIdx)
    const testDraws  = props.draws.slice(splitIdx)

    if (trainDraws.length < 30) {
      results.value = { error: `训练数据不足（仅 ${trainDraws.length} 期），请增加数据量。` }
      return
    }

    // Rolling prediction: for test draw i, history = trainDraws + testDraws[0..i-1]
    const rows = []
    let historyDraws = [...trainDraws]

    for (let i = 0; i < testDraws.length; i++) {
      const testDraw = testDraws[i]
      const nextDraw = resolveNextDraw(testDraws, i, props.draws)
      const pred = buildPrediction(historyDraws)
      const historySlice = sliceDrawsThroughIssue(props.draws, testDraw.issue)
      const transition = testDraw.digits
        ? computeAllPositionTransitions(historySlice, testDraw.digits)
        : null

      if (pred) {
        const actualPatLabel = PATTERN_LABELS[patternIdxOf(testDraw)]
        const actualOELabel  = OE_LABELS[oeCatOf(testDraw)]
        const patHit = pred.topPattern === actualPatLabel
        const oeHit  = pred.topOE === actualOELabel
        const maxMatch = maxDigitMatch(pred.recommendations, testDraw.digits)
        const exactHit = isAnyComboExact(pred.recommendations, testDraw.digits)

        rows.push({
          issue:         testDraw.issue,
          date:          testDraw.kjdate,
          actual:        testDraw.digits,
          actualSum:     testDraw.sum,
          actualSpan:    Math.max(...testDraw.digits) - Math.min(...testDraw.digits),
          actualPattern: actualPatLabel,
          actualOE:      actualOELabel,
          predPattern:   pred.topPattern,
          predOE:        pred.topOE,
          recs:          pred.recommendations.map((r) => r.digits),
          patHit,
          oeHit,
          bothHit:       patHit && oeHit,
          maxMatch,
          exactHit,
          nextIssue:     nextDraw?.issue ?? '',
          nextDate:      nextDraw?.kjdate ?? '',
          nextDigits:    nextDraw?.digits ?? null,
          transition,
          hasNext:       !!nextDraw,
        })
      }

      historyDraws.push(testDraw)
    }

    // Aggregate stats
    const rowCount   = rows.length
    const patHits    = rows.filter((r) => r.patHit).length
    const oeHits     = rows.filter((r) => r.oeHit).length
    const bothHits   = rows.filter((r) => r.bothHit).length
    const match2     = rows.filter((r) => r.maxMatch >= 2).length
    const match3     = rows.filter((r) => r.exactHit).length
    const match1     = rows.filter((r) => r.maxMatch >= 1).length

    results.value = {
      trainCount:  trainDraws.length,
      testCount:   rowCount,
      trainPeriod: `${trainDraws[0]?.issue ?? ''} ~ ${trainDraws[trainDraws.length - 1]?.issue ?? ''}`,
      testPeriod:  `${testDraws[0]?.issue ?? ''} ~ ${testDraws[testDraws.length - 1]?.issue ?? ''}`,
      stats: {
        patAcc:    pct(patHits, rowCount),
        oeAcc:     pct(oeHits, rowCount),
        bothAcc:   pct(bothHits, rowCount),
        m1Acc:     pct(match1, rowCount),
        m2Acc:     pct(match2, rowCount),
        m3Acc:     pct(match3, rowCount),
        patHits, oeHits, bothHits, match1, match2, match3,
      },
      rows,
    }
  } finally {
    running.value = false
  }
}

function pct(n, d) {
  return d === 0 ? 0 : Number(((n / d) * 100).toFixed(1))
}

// Pagination for the detail table
const PAGE_SIZE = 30
const page = ref(1)
const pagedRows = computed(() => {
  if (!results.value?.rows) return []
  const reversed = [...results.value.rows].reverse()
  const start = (page.value - 1) * PAGE_SIZE
  return reversed.slice(start, start + PAGE_SIZE)
})
const totalPages = computed(() => Math.ceil((results.value?.rows?.length ?? 0) / PAGE_SIZE))

// Stat cards config
const transitionModal = ref(null)

function openTransitionModal(row) {
  if (!canShowTransition(row)) return
  transitionModal.value = row
}

function closeTransitionModal() {
  transitionModal.value = null
}

function transitionTopHit(pos) {
  if (!pos || pos.topDigit == null || !transitionModal.value?.hasNext) return false
  const next = transitionModal.value?.nextDigits?.[pos.key]
  return next === pos.topDigit
}

const statCards = computed(() => {
  if (!results.value?.stats) return []
  const s = results.value.stats
  return [
    { label: '上下形态命中', value: `${s.patAcc}%`, sub: `${s.patHits}/${results.value.testCount} 期`, baseline: '理论 12.5%', color: '#fbbf24' },
    { label: '奇偶比命中',   value: `${s.oeAcc}%`,  sub: `${s.oeHits}/${results.value.testCount} 期`,  baseline: '理论 25%',   color: '#22d3ee' },
    { label: '形态+奇偶双中', value: `${s.bothAcc}%`, sub: `${s.bothHits}/${results.value.testCount} 期`, baseline: '理论 3.1%', color: '#a78bfa' },
    { label: '至少 1 位准', value: `${s.m1Acc}%`,  sub: `${s.match1}/${results.value.testCount} 期`,  baseline: '',           color: '#fb923c' },
    { label: '至少 2 位准', value: `${s.m2Acc}%`,  sub: `${s.match2}/${results.value.testCount} 期`,  baseline: '',           color: '#4ade80' },
    { label: '号码完全命中', value: `${s.m3Acc}%`, sub: `${s.match3}/${results.value.testCount} 期`,  baseline: '理论 0.2%',  color: '#f87171' },
  ]
})
</script>

<template>
  <div class="bt-wrap">
    <div class="bt-header">
      <span class="bt-title">🔬 历史回测 · 准确率验证</span>
      <span class="bt-sub">用历史数据验证预测模型的实际命中率</span>
    </div>

    <!-- Controls -->
    <div class="controls">
      <div class="split-info">
        <span class="split-label">数据划分</span>
        <span class="split-desc">前 <b>⅔</b> 期作为训练集，后 <b>⅓</b> 期作为测试集（共 <b>{{ draws.length }}</b> 期）</span>
      </div>
      <button class="run-btn" :disabled="running || !draws.length" @click="runBacktest">
        <span v-if="running" class="spin-icon">⟳</span>
        {{ running ? '计算中…' : '开始回测' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="results?.error" class="bt-error">{{ results.error }}</div>

    <!-- Results -->
    <template v-if="results && !results.error">
      <div class="bt-meta">
        训练 <b>{{ results.trainCount }}</b> 期（{{ results.trainPeriod }}）
        → 测试 <b>{{ results.testCount }}</b> 期（{{ results.testPeriod }}）
      </div>

      <!-- Stat cards -->
      <div class="stat-grid">
        <div
          v-for="s in statCards"
          :key="s.label"
          class="s-card"
          :style="{ '--c': s.color }"
        >
          <div class="s-val">{{ s.value }}</div>
          <div class="s-label">{{ s.label }}</div>
          <div class="s-sub">{{ s.sub }}</div>
          <div v-if="s.baseline" class="s-baseline">{{ s.baseline }}</div>
        </div>
      </div>

      <!-- Detail table -->
      <div class="table-header">
        <span class="tbl-title">逐期详情</span>
        <div class="pager" v-if="totalPages > 1">
          <button class="pg-btn" :disabled="page === 1" @click="page--">‹</button>
          <span class="pg-info">{{ page }} / {{ totalPages }}</span>
          <button class="pg-btn" :disabled="page === totalPages" @click="page++">›</button>
        </div>
      </div>

      <div class="tbl-wrap">
        <table class="bt-table">
          <thead>
            <tr>
              <th>期号</th>
              <th>日期</th>
              <th>实际号码</th>
              <th>和值</th>
              <th>跨度</th>
              <th>形态</th>
              <th>奇偶比</th>
              <th>推荐号 ①</th>
              <th>推荐号 ②</th>
              <th>最多位匹配</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in pagedRows"
              :key="row.issue"
              class="bt-row"
            >
              <td class="mono">{{ row.issue }}</td>
              <td class="mono dt">{{ row.date }}</td>
              <td>
                <span class="ball-row">
                  <span v-for="(d, i) in row.actual" :key="i" class="mini-ball">{{ d }}</span>
                  <button
                    v-if="canShowTransition(row)"
                    type="button"
                    class="trans-btn"
                    title="位置转移概率推测"
                    @click="openTransitionModal(row)"
                  >↗</button>
                </span>
              </td>
              <td class="mono sum-val">{{ row.actualSum }}</td>
              <td class="mono sum-val">{{ row.actualSpan }}</td>
              <td>
                <span :class="['tag', row.patHit ? 'hit' : 'miss']">
                  {{ row.actualPattern }}<span class="pred-hint">(预测：{{ row.predPattern }})</span>
                </span>
              </td>
              <td>
                <span :class="['tag', 'oe', row.oeHit ? 'hit' : 'miss']">
                  {{ row.actualOE }}<span class="pred-hint">(预测：{{ row.predOE }})</span>
                </span>
              </td>
              <td>
                <span class="rec-digits">
                  <span
                    v-for="(d, i) in row.recs[0]"
                    :key="i"
                    :class="['rd', d === row.actual[i] ? 'rd-hit' : '']"
                  >{{ d }}</span>
                </span>
              </td>
              <td>
                <span class="rec-digits" v-if="row.recs[1]">
                  <span
                    v-for="(d, i) in row.recs[1]"
                    :key="i"
                    :class="['rd', d === row.actual[i] ? 'rd-hit' : '']"
                  >{{ d }}</span>
                </span>
              </td>
              <td>
                <span :class="['match-badge', `m${row.maxMatch}`]">{{ row.maxMatch }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- 转移概率弹窗 -->
    <Teleport to="body">
      <div
        v-if="transitionModal"
        class="trans-overlay"
        @click.self="closeTransitionModal"
      >
        <div class="trans-dialog" role="dialog" aria-labelledby="trans-dialog-title">
          <div class="trans-dialog-head">
            <div>
              <h3 id="trans-dialog-title" class="trans-dialog-title">
                位置转移概率推测
              </h3>
              <p class="trans-dialog-sub">
                第 <b>{{ transitionModal.issue }}</b> 期（{{ transitionModal.date }}）
                · 基于本期开奖推算下期（转移统计 + 遗漏加权，截至本期）
              </p>
            </div>
            <button type="button" class="trans-close" @click="closeTransitionModal">×</button>
          </div>

          <div class="trans-prev">
            <span class="trans-prev-label">本期开奖</span>
            <span class="mono">{{ transitionModal.issue }}</span>
            <span class="mono dim">{{ transitionModal.date }}</span>
            <span class="ball-row">
              <span
                v-for="(d, i) in transitionModal.actual"
                :key="i"
                class="mini-ball cur"
              >{{ d }}</span>
            </span>
          </div>

          <div class="trans-actual">
            <span class="trans-prev-label">下期实际</span>
            <template v-if="transitionModal.hasNext && transitionModal.nextDigits">
              <span class="mono">{{ transitionModal.nextIssue }}</span>
              <span class="mono dim">{{ transitionModal.nextDate }}</span>
              <span class="ball-row">
                <span
                  v-for="(d, i) in transitionModal.nextDigits"
                  :key="i"
                  class="mini-ball actual"
                >{{ d }}</span>
              </span>
            </template>
            <span v-else class="trans-pending">暂无下期数据（可查看推测概率）</span>
          </div>

          <div class="trans-pos-row">
          <div
            v-for="pos in transitionModal.transition"
            :key="pos.key"
            class="trans-pos-block"
          >
            <div class="trans-pos-head">
              <span class="trans-pos-label" :style="{ color: pos.color }">{{ pos.label }}</span>
              <span class="trans-pos-from">
                本期 <b :style="{ color: pos.color }">{{ pos.fromDigit }}</b>
                → 转移样本 {{ pos.sampleSize }} 次
              </span>
              <span
                v-if="pos.sampleSize > 0"
                :class="[
                  'trans-pred-tag',
                  transitionModal.hasNext
                    ? (transitionTopHit(pos) ? 'hit' : 'miss')
                    : 'pending',
                ]"
              >
                推测 Top1：<b>{{ pos.topDigit }}</b>
                <template v-if="transitionModal.hasNext">
                  {{ transitionTopHit(pos) ? '✓ 命中' : '✗ 未中' }}
                </template>
              </span>
              <span v-else class="trans-pred-tag na">无历史样本</span>
            </div>

            <div v-if="pos.sampleSize > 0" class="trans-grid">
              <div
                v-for="d in DIGITS"
                :key="d"
                class="trans-cell"
                :class="{
                  'is-actual': transitionModal.hasNext && d === transitionModal.nextDigits?.[pos.key],
                  'is-top': d === pos.topDigit,
                }"
              >
                <span class="trans-digit">{{ d }}</span>
                <div class="trans-bar-track">
                  <div
                    class="trans-bar-fill"
                    :style="{
                      width: transitionBarWidth(pos.percents[d], pos.percents),
                      background: pos.color,
                    }"
                  />
                </div>
                <span class="trans-pct" :title="`转移占比 ${formatTransitionPct(pos.rawPercents[d])}%`">
                  {{ formatTransitionPct(pos.percents[d]) }}%
                </span>
              </div>
            </div>
            <div v-else class="trans-empty-pos">
              历史中 {{ pos.label }} 未出现过 {{ pos.fromDigit }}，无法统计转移
            </div>
          </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.bt-wrap {
  width: 100%;
}

.bt-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.bt-title {
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
}

.bt-sub {
  font-size: 13px;
  color: #64748b;
}

/* Controls */
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 14px 20px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid #334155;
  border-radius: 12px;
}

.split-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.split-label {
  font-size: 12px;
  color: #64748b;
  letter-spacing: 0.4px;
  white-space: nowrap;
}

.split-desc {
  font-size: 13px;
  color: #94a3b8;
}
.split-desc b { color: #fbbf24; }

.run-btn {
  padding: 9px 28px;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #0f172a;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}
.run-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spin-icon {
  display: inline-block;
  animation: spin 0.6s linear infinite;
  font-size: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Error */
.bt-error {
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  font-size: 13px;
  margin-bottom: 16px;
}

/* Meta */
.bt-meta {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 14px;
}
.bt-meta b { color: #94a3b8; }

/* Stat cards */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.s-card {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-top: 2.5px solid var(--c);
  border-radius: 10px;
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.s-val {
  font-size: 28px;
  font-weight: 800;
  color: var(--c);
  line-height: 1.1;
}

.s-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

.s-sub {
  font-size: 11px;
  color: #64748b;
}

.s-baseline {
  font-size: 10px;
  color: #475569;
  margin-top: 2px;
}

/* Table */
.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tbl-title {
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
}

.pager {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pg-btn {
  padding: 3px 10px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
}
.pg-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.pg-btn:hover:not(:disabled) { border-color: #fbbf24; color: #fbbf24; }

.pg-info { font-size: 12px; color: #64748b; }

.tbl-wrap {
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid #1e293b;
}

.bt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.bt-table thead th {
  background: #0f172a;
  color: #64748b;
  padding: 9px 10px;
  text-align: center;
  white-space: nowrap;
  font-weight: 600;
  letter-spacing: 0.3px;
  border-bottom: 1px solid #1e293b;
}

.bt-row td {
  padding: 7px 10px;
  text-align: center;
  border-bottom: 1px solid #0f172a;
  background: rgba(15, 23, 42, 0.5);
  vertical-align: middle;
}


.mono { font-family: monospace; font-size: 12px; color: #94a3b8; }
.sum-val { color: #fbbf24; font-weight: 600; }
.dt   { font-size: 11px; }
.dim  { color: #64748b; font-size: 11px; }

.ball-row { display: flex; justify-content: center; align-items: center; gap: 3px; }

.trans-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 4px;
  padding: 0;
  border: 1px solid #334155;
  border-radius: 4px;
  background: rgba(30, 41, 59, 0.8);
  color: #94a3b8;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.trans-btn:hover {
  border-color: #fbbf24;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
}

.trans-overlay {
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

.trans-dialog {
  width: min(1020px, 100%);
  max-height: min(90vh, 720px);
  overflow-y: auto;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 18px 20px 20px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
}

.trans-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.trans-dialog-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: #f8fafc;
}

.trans-dialog-sub {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}
.trans-dialog-sub b { color: #94a3b8; }

.trans-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.trans-close:hover { color: #f8fafc; background: rgba(248, 113, 113, 0.2); }

.trans-prev,
.trans-actual {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: rgba(30, 41, 59, 0.45);
  border-radius: 8px;
  font-size: 12px;
}

.trans-prev-label {
  color: #64748b;
  font-weight: 600;
  min-width: 56px;
}

.mini-ball.cur {
  background: linear-gradient(145deg, #64748b, #475569);
  color: #f1f5f9;
}
.mini-ball.actual {
  box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.45);
}

.trans-pos-row {
  display: flex;
  align-items: stretch;
  gap: 12px;
  margin-top: 14px;
}

.trans-pos-block {
  flex: 1;
  min-width: 0;
  padding: 12px 10px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid #1e293b;
  border-radius: 10px;
}

.trans-pos-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 12px;
}

.trans-pos-label {
  font-weight: 700;
  font-size: 13px;
}

.trans-pos-from {
  color: #94a3b8;
}
.trans-pos-from b { font-family: monospace; font-size: 14px; }

.trans-pred-tag {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.trans-pred-tag.hit { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.trans-pred-tag.miss { background: rgba(248, 113, 113, 0.12); color: #f87171; }
.trans-pred-tag.pending { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }
.trans-pred-tag.na { background: rgba(148, 163, 184, 0.1); color: #64748b; }

.trans-pending {
  font-size: 12px;
  color: #64748b;
}

.trans-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 5px;
}

@media (max-width: 720px) {
  .trans-pos-row {
    flex-direction: column;
  }
}

.trans-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 4px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid transparent;
}
.trans-cell.is-actual {
  border-color: #4ade80;
  background: rgba(74, 222, 128, 0.08);
}
.trans-cell.is-top:not(.is-actual) {
  border-color: rgba(251, 191, 36, 0.5);
}

.trans-digit {
  font-family: monospace;
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
}

.trans-bar-track {
  width: 100%;
  height: 4px;
  background: #1e293b;
  border-radius: 2px;
  overflow: hidden;
}

.trans-bar-fill {
  height: 100%;
  border-radius: 2px;
  min-width: 1px;
  transition: width 0.2s;
}

.trans-pct {
  font-size: 10px;
  color: #64748b;
  font-family: monospace;
}
.trans-cell.is-actual .trans-pct,
.trans-cell.is-top .trans-pct {
  color: #94a3b8;
  font-weight: 600;
}

.trans-empty-pos {
  font-size: 12px;
  color: #64748b;
  padding: 8px 0;
}

.mini-ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fbbf24, #f59e0b);
  color: #1c1917;
  font-weight: 700;
  font-size: 11px;
}

.tag {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
}
.tag.hit  { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.pred-hint { margin-left: 3px; font-size: 10px; opacity: 0.7; }
.tag.miss { background: rgba(148, 163, 184, 0.1);  color: #64748b; }
.tag.oe.hit  { background: rgba(34, 211, 238, 0.15); color: #22d3ee; }
.tag.oe.miss { background: rgba(148, 163, 184, 0.1);  color: #64748b; }

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px; height: 20px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
}
.badge-hit  { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
.badge-miss { background: rgba(248, 113, 113, 0.15); color: #f87171; }

.rec-digits { display: flex; justify-content: center; gap: 3px; }
.rd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px; height: 20px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.05);
  color: #64748b;
}
.rd.rd-hit {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
  font-weight: 800;
}

.match-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px; height: 22px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}
.m0 { background: rgba(248, 113, 113, 0.15); color: #f87171; }
.m1 { background: rgba(251, 146, 60, 0.2);   color: #fb923c; }
.m2 { background: rgba(251, 191, 36, 0.2);   color: #fbbf24; }
.m3 { background: rgba(74, 222, 128, 0.25);  color: #4ade80; }
</style>
