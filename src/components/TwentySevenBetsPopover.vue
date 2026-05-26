<script setup>
import { computed, ref, watch } from 'vue'
import { getNumberType } from '../utils/parser.js'

const MAX_PICKS_PER_POS = 3

const props = defineProps({
  anchor: { type: Object, default: null },
  pattern: { type: String, default: '' },
  positionPicks: { type: Array, default: () => [] },
  patternFlags: { type: Array, default: () => [] },
  combos: { type: Array, default: () => [] },
  actual: { type: Array, default: null },
  /** above：锚点上方（回测表格）；below：锚点下方（顶部推荐区） */
  placement: { type: String, default: 'above' },
})

defineEmits(['mouseenter', 'mouseleave'])

const rootEl = ref(null)
defineExpose({ rootEl })

const SUM_MIN = 0
const SUM_MAX = 27

const showZu3 = ref(true)
const showZu6 = ref(true)
const sumMin = ref(SUM_MIN)
const sumMax = ref(SUM_MAX)
const selectedPicks = ref([[], [], []])

function comboSum(rec) {
  return rec[0] + rec[1] + rec[2]
}

function onSumMinInput(e) {
  const v = Number(e.target.value)
  sumMin.value = Math.min(v, sumMax.value)
}

function onSumMaxInput(e) {
  const v = Number(e.target.value)
  sumMax.value = Math.max(v, sumMin.value)
}

const sumRangeTrackStyle = computed(() => {
  const span = SUM_MAX - SUM_MIN || 1
  const left = ((sumMin.value - SUM_MIN) / span) * 100
  const right = ((SUM_MAX - sumMax.value) / span) * 100
  return { left: `${left}%`, right: `${right}%` }
})

function digitsForPos(pi) {
  const flag = props.patternFlags[pi]
  return flag === '上' ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]
}

function initSelectedPicks() {
  if (props.positionPicks.length === 3) {
    selectedPicks.value = props.positionPicks.map((picks) => [...picks])
    return
  }
  selectedPicks.value = [[], [], []]
}

watch(() => props.positionPicks, initSelectedPicks, { immediate: true, deep: true })

function isDigitSelected(pi, digit) {
  return selectedPicks.value[pi]?.includes(digit) ?? false
}

function isDigitDisabled(pi, digit) {
  return !isDigitSelected(pi, digit)
    && (selectedPicks.value[pi]?.length ?? 0) >= MAX_PICKS_PER_POS
}

function toggleDigit(pi, digit) {
  const picks = [...selectedPicks.value[pi]]
  const idx = picks.indexOf(digit)
  if (idx >= 0) {
    picks.splice(idx, 1)
  } else if (picks.length < MAX_PICKS_PER_POS) {
    picks.push(digit)
    picks.sort((a, b) => a - b)
  }
  selectedPicks.value = selectedPicks.value.map((row, i) => (i === pi ? picks : row))
}

const popoverStyle = computed(() => {
  if (!props.anchor) return {}
  const gap = 10
  const { anchor, placement } = props
  if (placement === 'below') {
    return {
      position: 'fixed',
      top: `${anchor.bottom + gap}px`,
      left: `${anchor.right}px`,
      transform: 'translate(-100%, 0)',
      zIndex: 10000,
    }
  }
  return {
    position: 'fixed',
    top: `${anchor.top - gap}px`,
    left: `${anchor.right}px`,
    transform: 'translate(-100%, -100%)',
    zIndex: 10000,
  }
})

const activeCombos = computed(() => {
  if (selectedPicks.value.length !== 3) return []
  if (selectedPicks.value.some((picks) => !picks.length)) return []
  const combos = []
  for (const a of selectedPicks.value[0]) {
    for (const b of selectedPicks.value[1]) {
      for (const c of selectedPicks.value[2]) {
        combos.push([a, b, c])
      }
    }
  }
  return combos
})

const filteredRecs = computed(() => {
  const lo = Math.min(sumMin.value, sumMax.value)
  const hi = Math.max(sumMin.value, sumMax.value)
  return activeCombos.value.filter((rec) => {
    const s = comboSum(rec)
    if (s < lo || s > hi) return false
    const t = getNumberType(rec)
    if (t === '组三') return showZu3.value
    if (t === '组六') return showZu6.value
    return false
  })
})

const emptyHint = computed(() => {
  if (selectedPicks.value.some((picks) => !picks.length)) {
    return '每位至少选 1 个号码'
  }
  if (!showZu3.value && !showZu6.value) return '未勾选任何形态'
  if (sumMin.value > SUM_MIN || sumMax.value < SUM_MAX) {
    if (!filteredRecs.value.length) return '当前和值范围无匹配号码'
  }
  if (!filteredRecs.value.length) return '当前筛选无匹配号码'
  return ''
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="rootEl"
      class="rec-popover"
      :class="{ 'rec-popover--below': placement === 'below' }"
      role="tooltip"
      :style="popoverStyle"
      @mouseenter="$emit('mouseenter')"
      @mouseleave="$emit('mouseleave')"
    >
      <div class="rec-popover-head">
        <div class="rec-popover-title-row">
          <p class="rec-popover-title">
            {{ filteredRecs.length }} 注 · {{ pattern }}
          </p>
          <div class="rec-type-filters">
            <div class="rec-sum-range" title="和值范围">
              <span class="rec-sum-label">和值</span>
              <span class="rec-sum-value">{{ sumMin }}—{{ sumMax }}</span>
              <div class="rec-sum-slider">
                <div class="rec-sum-track" />
                <div class="rec-sum-active" :style="sumRangeTrackStyle" />
                <input
                  type="range"
                  class="rec-sum-thumb rec-sum-thumb-min"
                  :min="SUM_MIN"
                  :max="SUM_MAX"
                  :value="sumMin"
                  @input="onSumMinInput"
                />
                <input
                  type="range"
                  class="rec-sum-thumb rec-sum-thumb-max"
                  :min="SUM_MIN"
                  :max="SUM_MAX"
                  :value="sumMax"
                  @input="onSumMaxInput"
                />
              </div>
            </div>
            <label class="rec-type-filter">
              <input v-model="showZu3" type="checkbox" />
              <span>组三</span>
            </label>
            <label class="rec-type-filter">
              <input v-model="showZu6" type="checkbox" />
              <span>组六</span>
            </label>
          </div>
        </div>
        <div
          v-if="positionPicks.length === 3"
          class="rec-pos-picks"
        >
          <div
            v-for="(posLabel, pi) in ['百', '十', '个']"
            :key="posLabel"
            class="rec-pos-row"
          >
            <span class="rec-pos-name">{{ posLabel }}</span>
            <span class="rec-pos-flag">{{ patternFlags[pi] }}</span>
            <div class="rec-pos-digit-list">
              <label
                v-for="d in digitsForPos(pi)"
                :key="d"
                class="rec-digit-pick"
                :class="{
                  checked: isDigitSelected(pi, d),
                  disabled: isDigitDisabled(pi, d),
                }"
              >
                <input
                  type="checkbox"
                  :checked="isDigitSelected(pi, d)"
                  :disabled="isDigitDisabled(pi, d)"
                  @change="toggleDigit(pi, d)"
                />
                <span>{{ d }}</span>
              </label>
            </div>
            <span class="rec-pos-count">{{ selectedPicks[pi].length }}/{{ MAX_PICKS_PER_POS }}</span>
          </div>
        </div>
      </div>
      <div class="rec-popover-list">
        <div
          v-if="emptyHint"
          class="rec-popover-empty"
        >
          {{ emptyHint }}
        </div>
        <div
          v-for="(rec, ri) in filteredRecs"
          :key="ri"
          class="rec-popover-row"
        >
          <span class="rec-group">
            <span
              v-for="(d, i) in rec"
              :key="i"
              :class="['rd', actual && d === actual[i] ? 'rd-hit' : '']"
            >{{ d }}</span>
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rec-popover {
  position: fixed;
  width: min(880px, calc(100vw - 32px));
  overflow: visible;
  box-sizing: border-box;
  padding: 16px 28px;
  border-radius: 12px;
  border: 1px solid #475569;
  background: rgba(15, 23, 42, 0.98);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  text-align: left;
  pointer-events: auto;
}

.rec-popover::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 12px;
}

.rec-popover--below::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 12px;
}

.rec-popover-head {
  margin-bottom: 14px;
}

.rec-popover-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.rec-popover-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.rec-type-filters {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rec-sum-range {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: rgba(30, 41, 59, 0.6);
}

.rec-sum-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
}

.rec-sum-value {
  font-size: 11px;
  font-weight: 700;
  color: #fbbf24;
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  white-space: nowrap;
}

.rec-sum-slider {
  position: relative;
  width: 120px;
  height: 22px;
  flex-shrink: 0;
}

.rec-sum-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 6px;
  margin-top: -3px;
  border-radius: 3px;
  background: rgba(51, 65, 85, 0.8);
}

.rec-sum-active {
  position: absolute;
  top: 50%;
  height: 6px;
  margin-top: -3px;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.35), rgba(251, 191, 36, 0.85));
  pointer-events: none;
}

.rec-sum-thumb {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 22px;
  margin: 0;
  background: transparent;
  pointer-events: none;
  -webkit-appearance: none;
  appearance: none;
}

.rec-sum-thumb::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f8fafc;
  border: 2px solid #fbbf24;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  cursor: grab;
  pointer-events: auto;
}

.rec-sum-thumb::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f8fafc;
  border: 2px solid #fbbf24;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  cursor: grab;
  pointer-events: auto;
}

.rec-sum-thumb::-webkit-slider-runnable-track {
  background: transparent;
  height: 6px;
}

.rec-sum-thumb::-moz-range-track {
  background: transparent;
  height: 6px;
}

.rec-sum-thumb-max {
  z-index: 2;
}

.rec-sum-thumb-min {
  z-index: 3;
}

.rec-type-filter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: rgba(30, 41, 59, 0.6);
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.rec-type-filter:has(input:checked) {
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
}

.rec-type-filter input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #fbbf24;
  cursor: pointer;
}

.rec-pos-picks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rec-pos-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(251, 191, 36, 0.06);
}

.rec-pos-name {
  font-weight: 700;
  font-size: 12px;
  color: #fbbf24;
  min-width: 16px;
}

.rec-pos-flag {
  font-size: 11px;
  color: #64748b;
  min-width: 14px;
}

.rec-pos-digit-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.rec-digit-pick {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: rgba(30, 41, 59, 0.6);
  font-family: monospace;
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.rec-digit-pick.checked {
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
}

.rec-digit-pick.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.rec-digit-pick input {
  width: 12px;
  height: 12px;
  margin: 0;
  accent-color: #fbbf24;
  cursor: pointer;
}

.rec-digit-pick.disabled input {
  cursor: not-allowed;
}

.rec-pos-count {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
}

.rec-popover-list {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 8px 12px;
  padding: 0 4px;
  box-sizing: border-box;
}

.rec-popover-empty {
  grid-column: 1 / -1;
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: #64748b;
}

.rec-popover-row {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rec-group {
  display: inline-flex;
  gap: 3px;
  padding: 2px 5px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.rd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
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
</style>
