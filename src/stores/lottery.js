import { defineStore } from 'pinia'
import { fetchLotteryList } from '../api/lottery'
import { parseWinnum, calcSum, calcSpan, getNumberType } from '../utils/parser'

const POSITIONS = ['百位', '十位', '个位']

function enrichDraw(raw) {
  const digits = parseWinnum(raw.winnum)
  const sum = raw.kjfb?.hz ?? calcSum(digits)
  return {
    ...raw,
    digits,
    sum,
    span: raw.kjfb?.kd ?? calcSpan(digits),
    type: getNumberType(digits),
    positions: Object.fromEntries(POSITIONS.map((name, i) => [name, digits[i]])),
  }
}

export const useLotteryStore = defineStore('lottery', {
  state: () => ({
    draws: [],
    loading: false,
    error: null,
    limit: 300,
  }),

  getters: {
    /** Chronological order (oldest → newest) */
    chronDraws: (state) => state.draws,

    /** Latest first for table display */
    latestDraws: (state) => [...state.draws].reverse(),

    latestDraw: (state) => state.draws[state.draws.length - 1] ?? null,

    /** Frequency of each digit 0-9 across all positions */
    digitFrequency(state) {
      const freq = Array.from({ length: 10 }, () => 0)
      for (const draw of state.draws) {
        for (const d of draw.digits) freq[d]++
      }
      return freq
    },

    /** Frequency by position: { 百位: [0..9 counts], ... } */
    positionFrequency(state) {
      const result = POSITIONS.map(() => Array.from({ length: 10 }, () => 0))
      for (const draw of state.draws) {
        draw.digits.forEach((d, i) => {
          result[i][d]++
        })
      }
      return Object.fromEntries(POSITIONS.map((name, i) => [name, result[i]]))
    },

    /** Sum trend series */
    sumSeries: (state) =>
      state.draws.map((d) => ({ issue: d.issue, sum: d.sum, date: d.kjdate })),

    /** Type distribution */
    typeStats(state) {
      const stats = { 豹子: 0, 组三: 0, 组六: 0 }
      for (const draw of state.draws) stats[draw.type]++
      return stats
    },

    /** Omission matrix for trend chart: position × digit → current gap */
    omissionMatrix(state) {
      const matrix = POSITIONS.map(() => Array.from({ length: 10 }, () => 0))
      for (let pos = 0; pos < 3; pos++) {
        for (let digit = 0; digit < 10; digit++) {
          let gap = 0
          for (let i = state.draws.length - 1; i >= 0; i--) {
            if (state.draws[i].digits[pos] === digit) break
            gap++
          }
          matrix[pos][digit] = gap
        }
      }
      return Object.fromEntries(POSITIONS.map((name, i) => [name, matrix[i]]))
    },
  },

  actions: {
    async loadData(limit = this.limit) {
      this.loading = true
      this.error = null
      try {
        const raw = await fetchLotteryList({ limit })
        this.draws = raw.map(enrichDraw)
        this.limit = limit
      } catch (err) {
        this.error = err.message || '加载数据失败'
      } finally {
        this.loading = false
      }
    },
  },
})
