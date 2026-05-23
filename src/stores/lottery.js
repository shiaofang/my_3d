import { defineStore } from 'pinia'
import { fetchLotteryList, fetchLatestBatch, fetchOlderRecords, PAGE_SIZE } from '../api/lottery'
import { readCache, writeCache, mergeRecords } from '../utils/lotteryCache'
import { parseWinnum, calcSum, calcSpan, getNumberType } from '../utils/parser'
import { buildPrediction, PATTERN_LABELS, OE_LABELS } from '../utils/predict.js'
import { buildCombinationFrequency } from '../utils/combinationFrequency.js'

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
    /** Full chronological cache (enriched), used for limit slicing without re-fetch */
    fullCache: [],
    loading: false,
    syncing: false,
    error: null,
    limit: 50,
  }),

  getters: {
    chronDraws: (state) => state.draws,
    latestDraws: (state) => [...state.draws].reverse(),
    latestDraw: (state) => state.draws[state.draws.length - 1] ?? null,

    digitFrequency(state) {
      const freq = Array.from({ length: 10 }, () => 0)
      for (const draw of state.draws) {
        for (const d of draw.digits) freq[d]++
      }
      return freq
    },

    positionFrequency(state) {
      const result = POSITIONS.map(() => Array.from({ length: 10 }, () => 0))
      for (const draw of state.draws) {
        draw.digits.forEach((d, i) => {
          result[i][d]++
        })
      }
      return Object.fromEntries(POSITIONS.map((name, i) => [name, result[i]]))
    },

    sumSeries: (state) =>
      state.draws.map((d) => ({ issue: d.issue, sum: d.sum, date: d.kjdate })),

    typeStats(state) {
      const stats = { 豹子: 0, 组三: 0, 组六: 0 }
      for (const draw of state.draws) stats[draw.type]++
      return stats
    },

    /** 下期推荐（首选规则见 utils/predict.js） */
    nextPrediction(state) {
      const pred = buildPrediction(state.draws)
      if (!pred) return null
      return {
        ...pred,
        patternLabels: PATTERN_LABELS,
        oddEvenLabels: OE_LABELS,
      }
    },

    /** Frequency of each 3-digit combination 000–999 */
    combinationFrequency(state) {
      return buildCombinationFrequency(state.draws)
    },

  },

  actions: {
    applyLimit(limit) {
      this.draws = this.fullCache.slice(-limit)
      this.limit = limit
    },

    setFromRaw(rawRecords, limit) {
      this.fullCache = rawRecords.map(enrichDraw)
      this.applyLimit(limit)
    },

    async loadData(limit = this.limit, { refresh = false } = {}) {
      this.error = null
      const cached = await readCache()
      let rawRecords = cached?.records ?? []

      if (rawRecords.length) {
        this.setFromRaw(rawRecords, limit)
        this.loading = false
      } else {
        this.loading = true
      }

      this.syncing = true
      try {
        if (refresh && rawRecords.length) {
          rawRecords = mergeRecords(rawRecords, await fetchLatestBatch(PAGE_SIZE))
          await writeCache(rawRecords)
          this.setFromRaw(rawRecords, limit)
        } else if (refresh) {
          rawRecords = await fetchLotteryList({ limit })
          await writeCache(rawRecords)
          this.setFromRaw(rawRecords, limit)
        } else if (rawRecords.length >= limit) {
          rawRecords = mergeRecords(rawRecords, await fetchLatestBatch(PAGE_SIZE))
          await writeCache(rawRecords)
          this.setFromRaw(rawRecords, limit)
        } else if (rawRecords.length > 0) {
          const need = limit - rawRecords.length
          const [latest, older] = await Promise.all([
            fetchLatestBatch(PAGE_SIZE),
            fetchOlderRecords({ alreadyHave: rawRecords.length, need }),
          ])
          rawRecords = mergeRecords(mergeRecords(rawRecords, latest), older)
          await writeCache(rawRecords)
          this.setFromRaw(rawRecords, limit)
        } else {
          rawRecords = await fetchLotteryList({ limit })
          await writeCache(rawRecords)
          this.setFromRaw(rawRecords, limit)
        }
      } catch (err) {
        if (!this.draws.length) {
          this.error = err.message || '加载数据失败'
        }
      } finally {
        this.loading = false
        this.syncing = false
      }
    },
  },
})
