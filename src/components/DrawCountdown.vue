<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  formatCountdown,
  formatDrawDateTime,
  getNextDrawTimestamp,
  getTodaySalesCutoffTimestamp,
} from '../utils/drawSchedule'

const props = defineProps({
  nextIssue: { type: [String, Number], default: null },
})

const now = ref(Date.now())
let timer = null

const nextDrawTs = computed(() => getNextDrawTimestamp(now.value))
const remaining = computed(() => Math.max(0, nextDrawTs.value - now.value))
const countdown = computed(() => formatCountdown(remaining.value))
const drawDateTime = computed(() => formatDrawDateTime(nextDrawTs.value))
const isDrawing = computed(() => remaining.value === 0)

const salesCutoffTs = computed(() => getTodaySalesCutoffTimestamp(now.value))
const salesRemaining = computed(() => salesCutoffTs.value - now.value)
const isSalesClosed = computed(() => salesRemaining.value <= 0)
const salesCountdown = computed(() => formatCountdown(salesRemaining.value))
const salesDateTime = computed(() => formatDrawDateTime(salesCutoffTs.value))

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="countdown-bar" role="status" aria-live="polite">
    <div class="countdown-inner">
      <span class="countdown-icon">⏱</span>
      <span class="countdown-label">距下次开奖</span>
      <span v-if="nextIssue" class="countdown-issue">第 {{ nextIssue }} 期</span>
      <span class="countdown-sep">·</span>
      <span v-if="isDrawing" class="countdown-time drawing">正在开奖</span>
      <span v-else class="countdown-time">{{ countdown }}</span>
      <span class="countdown-sep">·</span>
      <span class="countdown-datetime">{{ drawDateTime }}</span>

      <span class="countdown-divider" aria-hidden="true" />

      <span class="countdown-label">购买截止</span>
      <span v-if="isSalesClosed" class="countdown-time closed">已截止</span>
      <span v-else class="countdown-time sales">{{ salesCountdown }}</span>
      <span class="countdown-sep">·</span>
      <span class="countdown-datetime">{{ salesDateTime }}</span>
    </div>
  </div>
</template>

<style scoped>
.countdown-bar {
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.08) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(251, 191, 36, 0.08) 100%);
  border-bottom: 1px solid rgba(251, 191, 36, 0.15);
  padding: 6px 24px;
}

.countdown-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  line-height: 1.4;
}

.countdown-icon {
  font-size: 14px;
  line-height: 1;
}

.countdown-label,
.countdown-datetime {
  color: #94a3b8;
}

.countdown-issue {
  color: #e2e8f0;
  font-weight: 600;
}

.countdown-sep {
  color: #475569;
}

.countdown-time {
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 1px;
  min-width: 88px;
  text-align: center;
}

.countdown-time.drawing,
.countdown-time.closed {
  font-size: 15px;
  min-width: auto;
}

.countdown-time.drawing {
  animation: pulse 1.2s ease-in-out infinite;
}

.countdown-time.closed {
  color: #94a3b8;
  font-weight: 600;
}

.countdown-time.sales {
  color: #22d3ee;
  min-width: 88px;
}

.countdown-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(148, 163, 184, 0.35);
  flex-shrink: 0;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

@media (max-width: 600px) {
  .countdown-bar {
    padding: 6px 16px;
  }

  .countdown-inner {
    gap: 6px;
    font-size: 12px;
  }

  .countdown-time {
    font-size: 16px;
    min-width: 76px;
  }

  .countdown-divider,
  .countdown-sep,
  .countdown-datetime {
    display: none;
  }
}
</style>
