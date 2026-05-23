<script setup>
import { computed, ref } from 'vue'

defineProps({
  draws: { type: Array, default: () => [] },
})

const TYPE_OPTIONS = ['不限', '豹子', '组三', '组六']
const ODDEVEN_OPTIONS = ['不限', '3:0', '2:1', '1:2', '0:3']
const PATTERN_OPTIONS = [
  '不限',
  '上上上', '上上下', '上下上', '上下下',
  '下上上', '下上下', '下下上', '下下下',
]
const SUM_MIN = 0
const SUM_MAX = 27

const selectedType = ref('不限')
const selectedOddEven = ref('不限')
const selectedPattern = ref('不限')
const sumMin = ref(SUM_MIN)
const sumMax = ref(SUM_MAX)

const TYPE_CLASS = {
  豹子: 'type-leopard',
  组三: 'type-pair',
  组六: 'type-normal',
}

function oddEvenRatio(digits) {
  let odd = 0
  for (const d of digits) if (d % 2 === 1) odd++
  return `${odd}:${3 - odd}`
}

function upDownPattern(digits) {
  return digits.map((d) => (d >= 5 ? '下' : '上')).join('')
}

function getType(digits) {
  const unique = new Set(digits).size
  if (unique === 1) return '豹子'
  if (unique === 2) return '组三'
  return '组六'
}

const filteredNumbers = computed(() => {
  const lo = Math.min(sumMin.value, sumMax.value)
  const hi = Math.max(sumMin.value, sumMax.value)
  const list = []
  for (let n = 0; n < 1000; n++) {
    const a = Math.floor(n / 100)
    const b = Math.floor(n / 10) % 10
    const c = n % 10
    const digits = [a, b, c]
    const sum = a + b + c
    if (sum < lo || sum > hi) continue
    const type = getType(digits)
    if (selectedType.value !== '不限' && type !== selectedType.value) continue
    if (selectedOddEven.value !== '不限' && oddEvenRatio(digits) !== selectedOddEven.value) continue
    if (selectedPattern.value !== '不限' && upDownPattern(digits) !== selectedPattern.value) continue
    list.push({
      key: n,
      label: String(n).padStart(3, '0'),
      digits,
      sum,
      type,
    })
  }
  return list
})

function resetFilters() {
  selectedType.value = '不限'
  selectedOddEven.value = '不限'
  selectedPattern.value = '不限'
  sumMin.value = SUM_MIN
  sumMax.value = SUM_MAX
}

function clampMin(v) {
  let n = Number(v)
  if (Number.isNaN(n)) n = SUM_MIN
  n = Math.max(SUM_MIN, Math.min(SUM_MAX, n))
  sumMin.value = n
  if (sumMax.value < n) sumMax.value = n
}

function clampMax(v) {
  let n = Number(v)
  if (Number.isNaN(n)) n = SUM_MAX
  n = Math.max(SUM_MIN, Math.min(SUM_MAX, n))
  sumMax.value = n
  if (sumMin.value > n) sumMin.value = n
}
</script>

<template>
  <div class="filter-panel">
    <div class="filters">
      <div class="filter-row">
        <span class="filter-label">形态</span>
        <div class="chip-group">
          <button
            v-for="opt in TYPE_OPTIONS"
            :key="opt"
            class="chip"
            :class="{ active: selectedType === opt }"
            @click="selectedType = opt"
          >
            {{ opt }}
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">奇偶比</span>
        <div class="chip-group">
          <button
            v-for="opt in ODDEVEN_OPTIONS"
            :key="opt"
            class="chip"
            :class="{ active: selectedOddEven === opt }"
            @click="selectedOddEven = opt"
          >
            {{ opt }}
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">上下形态</span>
        <div class="chip-group">
          <button
            v-for="opt in PATTERN_OPTIONS"
            :key="opt"
            class="chip"
            :class="{ active: selectedPattern === opt }"
            @click="selectedPattern = opt"
          >
            {{ opt }}
          </button>
        </div>
      </div>

      <div class="filter-row">
        <span class="filter-label">和值范围</span>
        <div class="sum-range">
          <input
            type="number"
            class="sum-input"
            :min="SUM_MIN"
            :max="SUM_MAX"
            :value="sumMin"
            @input="clampMin($event.target.value)"
          />
          <span class="dash">—</span>
          <input
            type="number"
            class="sum-input"
            :min="SUM_MIN"
            :max="SUM_MAX"
            :value="sumMax"
            @input="clampMax($event.target.value)"
          />
          <span class="hint">(0–27)</span>
        </div>
        <button class="btn-reset" @click="resetFilters">重置</button>
      </div>
    </div>

    <div class="result-box">
      <div class="result-header">
        <span class="result-count">
          命中 <b>{{ filteredNumbers.length }}</b> 注 / 共 1000 注
        </span>
        <span class="result-tip" v-if="filteredNumbers.length">按号码升序 · 可滚动查看</span>
      </div>

      <div v-if="filteredNumbers.length" class="result-grid">
        <div v-for="item in filteredNumbers" :key="item.key" class="result-item">
          <div class="item-nums">
            <span v-for="(n, i) in item.digits" :key="i" class="ball">{{ n }}</span>
          </div>
          <div class="item-meta">
            <span class="meta-sum">和{{ item.sum }}</span>
            <span class="type-tag" :class="TYPE_CLASS[item.type]">{{ item.type }}</span>
          </div>
        </div>
      </div>

      <div v-else class="result-empty">未匹配到符合条件的号码</div>
    </div>
  </div>
</template>

<style scoped>
.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
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
  min-width: 64px;
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

.sum-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sum-input {
  width: 64px;
  padding: 6px 10px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-h);
  font-size: 14px;
  text-align: center;
  font-family: var(--mono);
}

.sum-input:focus {
  outline: none;
  border-color: #fbbf24;
}

.dash {
  color: var(--text);
}

.hint {
  font-size: 12px;
  color: #64748b;
}

.btn-reset {
  margin-left: auto;
  padding: 6px 14px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-reset:hover {
  border-color: #f87171;
  color: #f87171;
}

.result-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.3);
  padding: 16px;
  min-height: 280px;
  max-height: 560px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(251, 191, 36, 0.4) transparent;
}

.result-box::-webkit-scrollbar {
  width: 8px;
}

.result-box::-webkit-scrollbar-track {
  background: transparent;
  margin: 6px 0;
}

.result-box::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(251, 191, 36, 0.5), rgba(245, 158, 11, 0.5));
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.result-box::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(251, 191, 36, 0.8), rgba(245, 158, 11, 0.8));
  background-clip: padding-box;
  border: 2px solid transparent;
}

.result-box::-webkit-scrollbar-button {
  display: none;
  height: 0;
  width: 0;
}

.result-box::-webkit-scrollbar-corner {
  background: transparent;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text);
}

.result-count b {
  color: #fbbf24;
  font-size: 16px;
  margin: 0 4px;
}

.result-tip {
  font-size: 12px;
  color: #64748b;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.result-item {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.15s;
}

.result-item:hover {
  border-color: rgba(251, 191, 36, 0.4);
  transform: translateY(-1px);
}

.item-nums {
  display: flex;
  gap: 6px;
}

.ball {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fbbf24, #f59e0b);
  color: #1c1917;
  font-weight: 700;
  font-size: 15px;
  box-shadow: 0 2px 6px rgba(251, 191, 36, 0.35);
}

.item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.meta-sum {
  color: var(--text);
  font-family: var(--mono);
}

.type-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
}

.type-leopard {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.type-pair {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.type-normal {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}

.result-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 240px;
  color: #64748b;
  font-size: 14px;
}
</style>
