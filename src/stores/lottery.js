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

    /**
     * Pattern-based prediction:
     * 1) predict top 上/下 pattern via multi-window inverse-frequency cooling + omission boost
     * 2) under that pattern, enumerate every (d1,d2,d3) combo and score by
     *    cooling × 0.55 + sum-target-fit × 0.30 + sum-gap × 0.15
     * 3) return top-2 number combos (same pattern, different digit choices)
     */
    nextPrediction(state) {
      if (!state.draws.length) return null
      const n = state.draws.length
      const PATTERN_LABELS = ['上上上', '上上下', '上下上', '上下下', '下上上', '下上下', '下下上', '下下下']

      const WINDOWS = [
        { days: 8,  weight: 0.32 },
        { days: 16, weight: 0.25 },
        { days: 24, weight: 0.18 },
        { days: 32, weight: 0.12 },
        { days: 48, weight: 0.08 },
        { days: 9999, weight: 0.05 },
      ]

      const patternIndex = (draw) =>
        draw.digits.reduce((acc, d) => acc * 2 + (d >= 5 ? 1 : 0), 0)

      function windowCounts(days) {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - days)
        cutoff.setHours(0, 0, 0, 0)
        const counts = new Array(8).fill(0)
        let total = 0
        for (const draw of state.draws) {
          const d = new Date(draw.kjdate?.replace(/-/g, '/') ?? '')
          if (isNaN(d.getTime())) continue
          if (days < 9999 && d < cutoff) continue
          counts[patternIndex(draw)]++
          total++
        }
        return { counts, total }
      }

      const patternGaps = new Array(8).fill(0)
      for (let i = 0; i < 8; i++) {
        let gap = 0
        for (let j = state.draws.length - 1; j >= 0; j--) {
          if (patternIndex(state.draws[j]) === i) break
          gap++
        }
        patternGaps[i] = gap
      }
      const maxGap = Math.max(...patternGaps, 1)
      const OMI_WEIGHT = 0.6

      const patternScores = new Array(8).fill(0)
      for (const w of WINDOWS) {
        const { counts, total } = windowCounts(w.days)
        if (total === 0) continue
        const avg = total / 8
        const raws = counts.map((c, i) => {
          const base = Math.max(0.05, 2 * avg - c)
          const omiBoost = 1 + OMI_WEIGHT * (patternGaps[i] / maxGap)
          return base * omiBoost
        })
        const sumRaw = raws.reduce((a, b) => a + b, 0)
        const pcts = raws.map((r) => (r / sumRaw) * 100)
        pcts.forEach((p, i) => { patternScores[i] += p * w.weight })
      }
      const totalScore = patternScores.reduce((a, b) => a + b, 0)
      const patternProb = patternScores.map((s) => (s / totalScore) * 100)

      // ----- ODD/EVEN RATIO PROBABILITY (4 categories) -----
      const ODDEVEN_LABELS = ['3:0', '2:1', '1:2', '0:3']
      const oeCategoryOf = (draw) =>
        3 - draw.digits.filter((d) => d % 2 === 1).length
      const oeCategoryOfDigits = (digits) =>
        3 - digits.filter((d) => d % 2 === 1).length

      const oeGaps = new Array(4).fill(0)
      for (let i = 0; i < 4; i++) {
        let gap = 0
        for (let j = state.draws.length - 1; j >= 0; j--) {
          if (oeCategoryOf(state.draws[j]) === i) break
          gap++
        }
        oeGaps[i] = gap
      }
      const maxOeGap = Math.max(...oeGaps, 1)

      const oeScores = new Array(4).fill(0)
      for (const w of WINDOWS) {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - w.days)
        cutoff.setHours(0, 0, 0, 0)
        const counts = new Array(4).fill(0)
        let total = 0
        for (const draw of state.draws) {
          const d = new Date(draw.kjdate?.replace(/-/g, '/') ?? '')
          if (isNaN(d.getTime())) continue
          if (w.days < 9999 && d < cutoff) continue
          counts[oeCategoryOf(draw)]++
          total++
        }
        if (total === 0) continue
        const avg = total / 4
        const raws = counts.map((c, i) => {
          const base = Math.max(0.05, 2 * avg - c)
          const omiBoost = 1 + OMI_WEIGHT * (oeGaps[i] / maxOeGap)
          return base * omiBoost
        })
        const sumRaw = raws.reduce((a, b) => a + b, 0)
        const pcts = raws.map((r) => (r / sumRaw) * 100)
        pcts.forEach((p, i) => { oeScores[i] += p * w.weight })
      }
      const totalOeScore = oeScores.reduce((a, b) => a + b, 0)
      const oddEvenProb = oeScores.map((s) => (s / totalOeScore) * 100)
      const oeRanked = oddEvenProb
        .map((prob, idx) => ({ idx, prob, label: ODDEVEN_LABELS[idx] }))
        .sort((a, b) => b.prob - a.prob)

      const RECENT = Math.min(30, n)
      const recentDraws = state.draws.slice(n - RECENT)

      const posStats = [0, 1, 2].map((pos) => {
        const stats = Array.from({ length: 10 }, (_, d) => ({
          d, freq: 0, recentFreq: 0, gap: 0, streak: 0,
        }))
        for (const draw of state.draws) stats[draw.digits[pos]].freq++
        for (const draw of recentDraws) stats[draw.digits[pos]].recentFreq++
        for (let d = 0; d < 10; d++) {
          let gap = 0
          for (let i = n - 1; i >= 0; i--) {
            if (state.draws[i].digits[pos] === d) break
            gap++
          }
          stats[d].gap = gap
          let streak = 0
          for (let i = n - 1; i >= 0; i--) {
            if (state.draws[i].digits[pos] === d) streak++
            else break
          }
          stats[d].streak = streak
        }
        return stats
      })

      function scoredDigits(pos, isUp) {
        const stats = posStats[pos]
        const range = isUp ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]
        const candidates = stats.filter((s) => range.includes(s.d))
        const maxLocalGap   = Math.max(...candidates.map((s) => s.gap), 1)
        const maxRecentFreq = Math.max(...candidates.map((s) => s.recentFreq), 1)
        return candidates
          .map((s) => ({
            ...s,
            score: (0.55 * (s.gap / maxLocalGap) + 0.45 * (1 - s.recentFreq / maxRecentFreq)) * Math.pow(0.5, s.streak),
          }))
          .sort((a, b) => b.score - a.score)
      }

      const sumWindow = Math.min(30, n)
      const sumDraws = state.draws.slice(n - sumWindow)
      const recentSumAvg = sumDraws.reduce((s, dw) => s + dw.sum, 0) / sumDraws.length

      const sumGap = new Array(28).fill(0)
      for (let s = 0; s <= 27; s++) {
        let gap = 0
        for (let i = n - 1; i >= 0; i--) {
          if (state.draws[i].sum === s) break
          gap++
        }
        sumGap[s] = gap
      }
      const maxSumGap = Math.max(...sumGap, 1)

      const ranked = patternProb
        .map((prob, idx) => ({ idx, prob, label: PATTERN_LABELS[idx] }))
        .sort((a, b) => b.prob - a.prob)

      const topPattern = ranked[0]
      const flags = [
        (topPattern.idx >> 2) & 1,
        (topPattern.idx >> 1) & 1,
        topPattern.idx & 1,
      ]

      const posCandidates = [0, 1, 2].map((pos) => scoredDigits(pos, flags[pos] === 0))
      const maxPosScore = Math.max(...posCandidates.flat().map((c) => c.score), 0.001)

      const combos = []
      for (const a of posCandidates[0]) {
        for (const b of posCandidates[1]) {
          for (const c of posCandidates[2]) {
            const digits = [a.d, b.d, c.d]
            const sum = a.d + b.d + c.d
            const coolFit = (a.score + b.score + c.score) / (3 * maxPosScore)
            const sumDev = Math.abs(sum - recentSumAvg)
            const sumFit = Math.max(0, 1 - sumDev / 13.5)
            const sumGapFit = sumGap[sum] / maxSumGap
            const oeCat = oeCategoryOfDigits(digits)
            combos.push({
              digits,
              sum,
              sumGap: sumGap[sum],
              oeCat,
              score: 0.55 * coolFit + 0.30 * sumFit + 0.15 * sumGapFit,
            })
          }
        }
      }
      combos.sort((a, b) => b.score - a.score)

      // Bucket combos by odd-even category, each bucket sorted desc by score.
      const combosByOe = [[], [], [], []]
      for (const c of combos) combosByOe[c.oeCat].push(c)

      // Pick first combo from #1 odd-even category, second from #2 — both
      // already filtered to the top up/down pattern.
      const topCombos = []
      const usedOe = []
      for (const oe of oeRanked) {
        if (topCombos.length >= 2) break
        const list = combosByOe[oe.idx]
        if (list && list.length) {
          topCombos.push({ ...list[0], oeLabel: oe.label, oeProb: oe.prob })
          usedOe.push(oe)
        }
      }
      // Fallback: if for some reason fewer than 2 picked, fill from overall top.
      while (topCombos.length < 2 && combos.length) {
        const next = combos.find(
          (c) => !topCombos.some((t) => t.digits.join() === c.digits.join()),
        )
        if (!next) break
        topCombos.push({
          ...next,
          oeLabel: ODDEVEN_LABELS[next.oeCat],
          oeProb: oddEvenProb[next.oeCat],
        })
      }

      const recommendations = topCombos.map((combo, rank) => ({
        rank: rank + 1,
        pattern: topPattern.label,
        patternIdx: topPattern.idx,
        probability: topPattern.prob,
        digits: combo.digits,
        sum: combo.sum,
        sumTarget: Number(recentSumAvg.toFixed(1)),
        sumDev: Number((combo.sum - recentSumAvg).toFixed(1)),
        sumGap: combo.sumGap,
        score: Number((combo.score * 100).toFixed(1)),
        flags,
        oddEvenRatio: combo.oeLabel,
        oddEvenProb: Number(combo.oeProb.toFixed(1)),
      }))

      return {
        recommendations,
        topPattern: topPattern.label,
        topPatternProb: Number(topPattern.prob.toFixed(1)),
        patternProb,
        patternLabels: PATTERN_LABELS,
        oddEvenProb,
        oddEvenLabels: ODDEVEN_LABELS,
        topOddEven: oeRanked[0]?.label,
        topOddEvenProb: Number((oeRanked[0]?.prob ?? 0).toFixed(1)),
        recentSumAvg: Number(recentSumAvg.toFixed(1)),
        basePeriods: n,
      }
    },

    /** Frequency of each 3-digit combination 000–999 */
    combinationFrequency(state) {
      const freq = new Array(1000).fill(0)
      for (const draw of state.draws) {
        const num = draw.digits[0] * 100 + draw.digits[1] * 10 + draw.digits[2]
        freq[num]++
      }
      return freq
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
