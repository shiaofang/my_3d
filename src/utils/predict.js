/**
 * Pure prediction engine — identical logic to the Pinia store's nextPrediction
 * getter, but uses the date of the LAST draw in `draws` as the reference date
 * instead of `new Date()`. This makes it safe for historical backtesting.
 *
 * Pattern prediction uses a 3-way ensemble:
 *   1. Frequency + gap (cold-number, multi-window) — original method
 *   2. Per-position binary prediction (百/十/个 each predicted independently)
 *   3. First-order Markov transition (what tends to follow the last pattern)
 */

/** 形态从左到右：百位 → 十位 → 个位（例：338 = 3上·3上·8下 = 上上下） */
export const PATTERN_LABELS = [
  '上上上', '上上下', '上下上', '上下下',
  '下上上', '下上下', '下下上', '下下下',
]
export const OE_LABELS = ['3:0', '2:1', '1:2', '0:3']

const WINDOWS = [
  { days: 8,    weight: 0.32 },
  { days: 16,   weight: 0.25 },
  { days: 24,   weight: 0.18 },
  { days: 32,   weight: 0.12 },
  { days: 48,   weight: 0.08 },
  { days: 9999, weight: 0.05 },
]
const WINDOWS_TOTAL_WEIGHT = WINDOWS.reduce((s, w) => s + w.weight, 0)
const OMI_WEIGHT = 0.6

// ── Category helpers ──────────────────────────────────────────────────────────

/** 百→十→个 逐位编码；0–4=上，5–9=下 */
export function patternIdxOf(draw) {
  return draw.digits.reduce((acc, d) => acc * 2 + (d >= 5 ? 1 : 0), 0)
}

export function patternLabelOfDigits(digits) {
  return PATTERN_LABELS[patternIdxOf({ digits })]
}

export function oeCatOf(draw) {
  return 3 - draw.digits.filter((d) => d % 2 === 1).length
}

export function oeCatOfDigits(digits) {
  return 3 - digits.filter((d) => d % 2 === 1).length
}

// ── Core window counting ──────────────────────────────────────────────────────

function windowCounts(draws, days, numCats, categoryFn, refDate) {
  const cutoff = new Date(refDate)
  cutoff.setDate(cutoff.getDate() - days)
  cutoff.setHours(0, 0, 0, 0)
  const counts = new Array(numCats).fill(0)
  let total = 0
  for (const draw of draws) {
    const d = new Date(draw.kjdate?.replace(/-/g, '/') ?? '')
    if (isNaN(d.getTime())) continue
    if (days < 9999 && d < cutoff) continue
    counts[categoryFn(draw)]++
    total++
  }
  return { counts, total }
}

function gapOf(draws, categoryFn, cat) {
  let gap = 0
  for (let j = draws.length - 1; j >= 0; j--) {
    if (categoryFn(draws[j]) === cat) break
    gap++
  }
  return gap
}

// ── Method 1: Multi-window frequency + gap (original) ────────────────────────

function computeProb(draws, numCats, categoryFn, gapsFn, refDate) {
  const gaps = Array.from({ length: numCats }, (_, i) => gapsFn(draws, i))
  const maxGap = Math.max(...gaps, 1)

  const scores = new Array(numCats).fill(0)
  for (const w of WINDOWS) {
    const { counts, total } = windowCounts(draws, w.days, numCats, categoryFn, refDate)
    if (total === 0) continue
    const avg = total / numCats
    const raws = counts.map((c, i) => {
      const base = Math.max(0.05, 2 * avg - c)
      return base * (1 + OMI_WEIGHT * (gaps[i] / maxGap))
    })
    const sumRaw = raws.reduce((a, b) => a + b, 0)
    raws.forEach((r, i) => { scores[i] += (r / sumRaw) * 100 * w.weight })
  }
  const total = scores.reduce((a, b) => a + b, 0)
  return scores.map((s) => (total > 0 ? (s / total) * 100 : 100 / numCats))
}

// ── Method 2: Per-position binary prediction ──────────────────────────────────
//
// Treats each digit position independently: P(position p is 上) is estimated
// using the same cold-number window logic, but on a 2-category (上/下) basis.
// The 8-pattern probability is then the product of the three position probs,
// which automatically captures if e.g. 百位 is "due 上" and 个位 is "due 下".

function computePositionBitProb(draws, pos, refDate) {
  const bitOf = (draw) => (draw.digits[pos] < 5 ? 0 : 1) // 0=上, 1=下
  const gaps = [0, 1].map((bit) => gapOf(draws, bitOf, bit))
  const maxGap = Math.max(...gaps, 1)

  let scoreUp = 0
  let totalWeight = 0
  for (const w of WINDOWS) {
    const { counts, total } = windowCounts(draws, w.days, 2, bitOf, refDate)
    if (total === 0) continue
    const avg = total / 2
    const rawUp   = Math.max(0.05, 2 * avg - counts[0]) * (1 + OMI_WEIGHT * (gaps[0] / maxGap))
    const rawDown = Math.max(0.05, 2 * avg - counts[1]) * (1 + OMI_WEIGHT * (gaps[1] / maxGap))
    scoreUp += (rawUp / (rawUp + rawDown)) * w.weight
    totalWeight += w.weight
  }
  return totalWeight > 0 ? scoreUp / totalWeight : 0.5
}

function perPositionPatternProb(draws, refDate) {
  const upProb = [0, 1, 2].map((pos) => computePositionBitProb(draws, pos, refDate))
  // Assemble 8 pattern probs from independent position probs (sums to 1 exactly)
  return Array.from({ length: 8 }, (_, i) => {
    const bits = [(i >> 2) & 1, (i >> 1) & 1, i & 1] // 0=上, 1=下
    return bits.reduce((p, bit, pos) => p * (bit === 0 ? upProb[pos] : 1 - upProb[pos]), 1)
  })
}

// ── Method 3: First-order Markov transition ───────────────────────────────────
//
// Counts how many times each pattern followed the last observed pattern.
// Uses the most recent 800 draws so the matrix reflects current tendencies.

function markovPatternProb(draws) {
  const n = draws.length
  const lastPat = patternIdxOf(draws[n - 1])
  const slice = draws.slice(Math.max(0, n - 800))
  const counts = new Array(8).fill(0)
  let total = 0
  for (let i = 1; i < slice.length; i++) {
    if (patternIdxOf(slice[i - 1]) === lastPat) {
      counts[patternIdxOf(slice[i])]++
      total++
    }
  }
  if (total < 8) return new Array(8).fill(1 / 8)
  // Laplace smoothing keeps zero-count patterns from being impossible
  return counts.map((c) => (c + 0.5) / (total + 4))
}

// ── Method 4: Second-order Markov with backoff ────────────────────────────────
//
// Conditions on the last TWO patterns. If that state has too few observations,
// falls back to first-order via linear interpolation.

function markov2PatternProb(draws) {
  const n = draws.length
  if (n < 3) return new Array(8).fill(1 / 8)
  const lastPat = patternIdxOf(draws[n - 1])
  const prevPat = patternIdxOf(draws[n - 2])

  const slice = draws.slice(Math.max(0, n - 1200))
  const counts = new Array(8).fill(0)
  let total = 0
  for (let i = 2; i < slice.length; i++) {
    if (patternIdxOf(slice[i - 1]) === lastPat && patternIdxOf(slice[i - 2]) === prevPat) {
      counts[patternIdxOf(slice[i])]++
      total++
    }
  }
  const order1 = markovPatternProb(draws)
  if (total < 5) return order1
  // Witten-Bell style interpolation: more samples → trust 2nd-order more
  const lambda = Math.min(0.7, total / 30)
  const order2 = counts.map((c) => (c + 0.5) / (total + 4))
  return order2.map((p, i) => lambda * p + (1 - lambda) * order1[i])
}

// ── Method 5: Sum-conditional pattern prior ──────────────────────────────────
//
// Bayesian marginalization:
//   P(pattern) = Σ_s P(pattern | sum=s) · P(sum=s | recent)
//
// P(pattern | sum=s) is learned from the full history; P(sum=s | recent) is
// estimated as a Gaussian around the recent sum mean. This captures the strong
// structural link between sum range and which positions tend to be 上/下.

function sumConditionalPatternProb(draws) {
  const sumPatCount = Array.from({ length: 28 }, () => new Array(8).fill(0))
  const sumCount = new Array(28).fill(0)
  for (const draw of draws) {
    const s = draw.sum
    if (s < 0 || s > 27) continue
    sumPatCount[s][patternIdxOf(draw)]++
    sumCount[s]++
  }

  // Recent sum distribution: Gaussian around the mean of the last 30 draws
  const n = draws.length
  const recent = draws.slice(Math.max(0, n - 30))
  const mean = recent.reduce((a, d) => a + d.sum, 0) / recent.length
  const variance = recent.reduce((a, d) => a + (d.sum - mean) ** 2, 0) / recent.length
  const std = Math.max(3, Math.sqrt(variance))

  const sumProb = new Array(28).fill(0)
  let z = 0
  for (let s = 0; s <= 27; s++) {
    sumProb[s] = Math.exp(-0.5 * ((s - mean) / std) ** 2)
    z += sumProb[s]
  }
  for (let s = 0; s <= 27; s++) sumProb[s] /= z

  // Marginalize
  const result = new Array(8).fill(0)
  for (let s = 0; s <= 27; s++) {
    if (sumCount[s] === 0) continue
    for (let p = 0; p < 8; p++) {
      result[p] += (sumPatCount[s][p] / sumCount[s]) * sumProb[s]
    }
  }
  // Normalize (defensive — should already sum to ~1)
  const total = result.reduce((a, b) => a + b, 0)
  return total > 0 ? result.map((p) => p / total) : new Array(8).fill(1 / 8)
}

// ── Recent-streak penalty ────────────────────────────────────────────────────
//
// Slightly down-weights patterns that just appeared. Pattern A occurring at
// t-1 is weakly anti-correlated with A occurring at t (gambler's fallacy
// holds on average for symmetric processes).

function recentStreakPenalty(draws) {
  const n = draws.length
  const penalty = new Array(8).fill(1)
  const decay = [0.85, 0.93, 0.97]
  for (let k = 0; k < decay.length && k < n; k++) {
    penalty[patternIdxOf(draws[n - 1 - k])] *= decay[k]
  }
  return penalty
}

// ── 8 / 16 天窗口预测（与上下形态、奇偶比图表一致）────────────────────────────

import {
  buildCombinationFrequency,
  comboAppearCount,
  comboCountBandFromFreq,
  isComboCountInBand,
  comboCountBandFit,
} from './combinationFrequency.js'
import { getNumberType } from './parser.js'
import { predictTypeProbabilities } from './numberTypePattern.js'

const CHART_OMI_WEIGHT = 0.6
/** 每位数字出现次数占历史总期数的 1/4～3/4（排除极冷极热） */
const FREQ_BAND_MIN = 0.25
const FREQ_BAND_MAX = 0.75

const W_PATTERN = 0.40
const W_OE = 0.27
const W_SUM = 0.23
const W_TYPE = 0.10

/** 低于此期数时，允许推荐从未出现过的组合（样本太少时几乎无法命中「出现过」约束） */
const MIN_DRAWS_FOR_APPEAR_FILTER = 120

/** 按组三/组六预测概率得到 0–1 的形态契合度（排除豹子） */
function typeFitScore(digits, typePred) {
  const t = getNumberType(digits)
  if (t === '豹子') return 0
  const zu3 = typePred.pcts[0] / 100
  const zu6 = typePred.pcts[1] / 100
  return t === '组三' ? zu3 : zu6
}

/** 强信号时收窄候选形态；否则组三+组六均可 */
function allowedNumberTypes(typePred) {
  const [zu3, zu6] = typePred.pcts
  if (typePred.signal === 'after-zu3' || typePred.signal === 'pattern-broken') {
    return new Set(['组六'])
  }
  if (
    (typePred.signal === 'cycle-peak' || typePred.signal === 'overdue-mild') &&
    zu3 >= zu6
  ) {
    return new Set(['组三'])
  }
  if (zu3 >= zu6 + 12) return new Set(['组三'])
  if (zu6 >= zu3 + 20) return new Set(['组六'])
  return new Set(['组三', '组六'])
}

function passesTypeFilter(digits, allowed) {
  const t = getNumberType(digits)
  if (t === '豹子') return false
  return allowed.has(t)
}

/** 单窗口内各类别预测概率（%），逻辑同 UpDownChart / OddEvenChart */
function windowCategoryPredictedPct(draws, days, numCats, categoryFn, gapsFn, refDate) {
  const { counts, total } = windowCounts(draws, days, numCats, categoryFn, refDate)
  if (total === 0) {
    return { probs: new Array(numCats).fill(100 / numCats), total: 0 }
  }
  const gaps = Array.from({ length: numCats }, (_, i) => gapsFn(draws, i))
  const maxGap = Math.max(...gaps, 1)
  const avg = total / numCats
  const raws = counts.map((c, i) => {
    const base = Math.max(0.05, 2 * avg - c)
    return base * (1 + CHART_OMI_WEIGHT * (gaps[i] / maxGap))
  })
  const sumRaw = raws.reduce((a, b) => a + b, 0)
  return {
    probs: raws.map((r) => (sumRaw > 0 ? (r / sumRaw) * 100 : 100 / numCats)),
    total,
  }
}

function topFromWindowProbs(probs, labels) {
  let bestI = 0
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[bestI]) bestI = i
  }
  return { i: bestI, p: probs[bestI], label: labels[bestI] }
}

/** 近 8 天 vs 近 16 天：取峰值概率更高的窗口及其最优类别 */
function pickBestWindowCategory(draws, numCats, categoryFn, gapsFn, refDate, labels) {
  const w8 = windowCategoryPredictedPct(draws, 8, numCats, categoryFn, gapsFn, refDate)
  const w16 = windowCategoryPredictedPct(draws, 16, numCats, categoryFn, gapsFn, refDate)
  const top8 = topFromWindowProbs(w8.probs, labels)
  const top16 = topFromWindowProbs(w16.probs, labels)
  if (top8.p >= top16.p) return { ...top8, window: 8, windowProbs: w8.probs }
  return { ...top16, window: 16, windowProbs: w16.probs }
}

/** 和值均值回归：近 8/16 期相对均线的偏离，选偏离更大窗口并预测向均线回归 */
function sumMeanReversionTarget(draws) {
  const n = draws.length
  const maLen = Math.min(30, n)
  const maSlice = draws.slice(n - maLen)
  const sumMA = maSlice.reduce((s, d) => s + d.sum, 0) / maSlice.length

  function windowSkew(periods) {
    const slice = draws.slice(Math.max(0, n - periods))
    if (!slice.length) return { skew: 0, direction: 0, periods }
    let below = 0
    for (const d of slice) {
      if (d.sum < sumMA) below++
    }
    const belowRatio = below / slice.length
    const skew = Math.abs(belowRatio - 0.5)
    let direction = 0
    if (belowRatio >= 0.6) direction = 1
    else if (belowRatio <= 0.4) direction = -1
    return { skew, direction, periods, belowRatio }
  }

  const s8 = windowSkew(8)
  const s16 = windowSkew(16)
  const chosen = s8.skew >= s16.skew ? s8 : s16
  const offset = chosen.skew > 0.1 ? 2 : 1
  let targetSum = sumMA
  if (chosen.direction === 1) targetSum = sumMA + offset
  else if (chosen.direction === -1) targetSum = sumMA - offset
  targetSum = Math.max(0, Math.min(27, Math.round(targetSum)))

  return {
    targetSum,
    sumMA,
    window: chosen.periods,
    direction: chosen.direction,
    belowRatio: chosen.belowRatio,
  }
}

/** 出现频次在总期数 1/4～3/4 之间的数字（排除极冷极热） */
function digitsInFreqBand(draws, pos, isUp, band = { min: FREQ_BAND_MIN, max: FREQ_BAND_MAX }) {
  const range = isUp ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]
  const n = draws.length
  const all = range.map((d) => {
    let freq = 0
    let gap = 0
    for (const draw of draws) if (draw.digits[pos] === d) freq++
    for (let i = n - 1; i >= 0; i--) {
      if (draws[i].digits[pos] === d) break
      gap++
    }
    const ratio = freq / n
    const inBand = ratio >= band.min && ratio <= band.max
    const midDist = Math.abs(ratio - 0.5)
    return { d, freq, ratio, gap, inBand, midDist }
  })

  const inBand = all.filter((x) => x.inBand)
  if (inBand.length) {
    return inBand.sort((a, b) => a.midDist - b.midDist || b.gap - a.gap)
  }
  return all.sort((a, b) => a.midDist - b.midDist || b.gap - a.gap).slice(0, 5)
}

/** 按奇偶比约束缩小每位候选（3:0 只用奇数，0:3 只用偶数） */
function parityFilter(candidates, parity) {
  if (parity === 'odd') return candidates.filter((x) => x.d % 2 === 1)
  if (parity === 'even') return candidates.filter((x) => x.d % 2 === 0)
  return candidates
}

function allDigitsInRange(draws, pos, isUp) {
  const range = isUp ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]
  const n = draws.length
  return range.map((d) => {
    let freq = 0
    let gap = 0
    for (const draw of draws) if (draw.digits[pos] === d) freq++
    for (let i = n - 1; i >= 0; i--) {
      if (draws[i].digits[pos] === d) break
      gap++
    }
    const ratio = freq / n
    return { d, freq, ratio, gap, inBand: true, midDist: Math.abs(ratio - 0.5) }
  })
}

function posCandidatesForOe(draws, flags, oeIdx, band) {
  const parityByPos =
    oeIdx === 0
      ? ['odd', 'odd', 'odd']
      : oeIdx === 3
        ? ['even', 'even', 'even']
        : [null, null, null]

  return [0, 1, 2].map((pos) => {
    const isUp = flags[pos] === 0
    const base = digitsInFreqBand(draws, pos, isUp, band)
    const parity = parityByPos[pos]
    if (!parity) return base
    const filtered = parityFilter(base, parity)
    if (filtered.length) return filtered
    return parityFilter(allDigitsInRange(draws, pos, isUp), parity)
  })
}

function matchesOeCategory(digits, oeIdx) {
  return oeCatOfDigits(digits) === oeIdx
}

/** flags[pos]：0=上 1=下，顺序为 [百位, 十位, 个位] */
function patternFlagsFromIdx(idx) {
  return [(idx >> 2) & 1, (idx >> 1) & 1, idx & 1]
}

function scoreCombo(a, b, c, patternPick, oePick, sumTarget, comboFreq, countBand, typePred) {
  const digits = [a.d, b.d, c.d]
  const sum = a.d + b.d + c.d
  const sumFit = Math.max(0, 1 - Math.abs(sum - sumTarget.targetSum) / 13.5)
  const digitFit =
    (1 - a.midDist / 0.25 + 1 - b.midDist / 0.25 + 1 - c.midDist / 0.25) / 3
  const countFit = comboCountBandFit(comboFreq, digits, countBand)
  const gapFit = (a.gap + b.gap + c.gap) / 3
  const tFit = typeFitScore(digits, typePred)
  const score =
    W_PATTERN * patternPick.p / 100 +
    W_OE * oePick.p / 100 +
    W_SUM * (0.65 * sumFit + 0.35 * Math.min(1, digitFit)) +
    W_TYPE * tFit +
    countFit * 0.12 +
    gapFit * 0.001
  return { sum, score, sumFit, countFit, numberType: getNumberType(digits) }
}

function scoreHistorical(digits, patternPick, oePick, sumTarget, comboFreq, countBand, typePred) {
  const sum = digits[0] + digits[1] + digits[2]
  const sumFit = Math.max(0, 1 - Math.abs(sum - sumTarget.targetSum) / 13.5)
  const countFit = comboCountBandFit(comboFreq, digits, countBand)
  const tFit = typeFitScore(digits, typePred)
  const score =
    W_PATTERN * patternPick.p / 100 +
    W_OE * oePick.p / 100 +
    W_SUM * sumFit +
    W_TYPE * tFit +
    countFit * 0.12
  return { sum, score, countFit, numberType: getNumberType(digits) }
}

/**
 * 在「组合出现次数处于 3D 图中间 1/3～2/3」的历史开奖里选号
 * （与 Combination3DChart 次数滑块同一套区间）
 */
function searchFromHistoricalDraws(
  draws,
  patternPick,
  oePick,
  sumTarget,
  comboFreq,
  countBand,
  requireCountBand,
  typePred,
  allowedTypes,
) {
  const flags = patternFlagsFromIdx(patternPick.i)
  const seen = new Set()
  let best = null
  let bestScore = -1

  for (let i = draws.length - 1; i >= 0; i--) {
    const draw = draws[i]
    const digits = draw.digits
    const key = digits.join()
    if (seen.has(key)) continue
    seen.add(key)

    if (patternIdxOf(draw) !== patternPick.i) continue
    if (oeCatOf(draw) !== oePick.i) continue
    if (!passesTypeFilter(digits, allowedTypes)) continue
    if (requireCountBand && !isComboCountInBand(comboFreq, digits, countBand)) continue

    const { sum, score, numberType } = scoreHistorical(
      digits, patternPick, oePick, sumTarget, comboFreq, countBand, typePred,
    )
    if (score > bestScore) {
      bestScore = score
      best = {
        digits: [...digits],
        sum,
        score,
        flags,
        numberType,
        comboCount: comboAppearCount(comboFreq, digits),
        fromHistory: true,
      }
    }
  }
  return best
}

const MAX_PREDICTION_GROUPS = 9

function upsertComboCandidate(map, entry) {
  const key = entry.digits.join('')
  const prev = map.get(key)
  if (!prev || entry.score > prev.score) map.set(key, entry)
}

/** 收集评分最高的若干组号码（<10 组），用于「预测组」展示 */
function searchTopCombos(
  draws,
  patternPick,
  oePick,
  sumTarget,
  comboFreq,
  countBand,
  typePred,
  allowedTypes,
  maxCount = MAX_PREDICTION_GROUPS,
) {
  const flags = patternFlagsFromIdx(patternPick.i)
  const digitBand = { min: FREQ_BAND_MIN, max: FREQ_BAND_MAX }
  const posCandidates = posCandidatesForOe(draws, flags, oePick.i, digitBand)
  const candidates = new Map()

  for (const a of posCandidates[0]) {
    for (const b of posCandidates[1]) {
      for (const c of posCandidates[2]) {
        const digits = [a.d, b.d, c.d]
        if (patternIdxOf({ digits }) !== patternPick.i) continue
        if (!matchesOeCategory(digits, oePick.i)) continue
        if (!passesTypeFilter(digits, allowedTypes)) continue
        if (
          comboAppearCount(comboFreq, digits) === 0 &&
          draws.length >= MIN_DRAWS_FOR_APPEAR_FILTER
        ) continue
        const { sum, score, numberType } = scoreCombo(
          a, b, c, patternPick, oePick, sumTarget, comboFreq, countBand, typePred,
        )
        if (sum > 27) continue
        upsertComboCandidate(candidates, {
          digits,
          sum,
          score,
          flags,
          numberType,
          comboCount: comboAppearCount(comboFreq, digits),
        })
      }
    }
  }

  const histSeen = new Set()
  for (let i = draws.length - 1; i >= 0; i--) {
    const draw = draws[i]
    const digits = draw.digits
    const key = digits.join('')
    if (histSeen.has(key)) continue
    histSeen.add(key)
    if (patternIdxOf(draw) !== patternPick.i) continue
    if (oeCatOf(draw) !== oePick.i) continue
    if (!passesTypeFilter(digits, allowedTypes)) continue
    const { sum, score, numberType } = scoreHistorical(
      digits, patternPick, oePick, sumTarget, comboFreq, countBand, typePred,
    )
    upsertComboCandidate(candidates, {
      digits: [...digits],
      sum,
      score,
      flags,
      numberType,
      comboCount: comboAppearCount(comboFreq, digits),
      fromHistory: true,
    })
  }

  const ranked = [...candidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
  const scoreSum = ranked.reduce((s, x) => s + x.score, 0) || 1

  return ranked.map((item, idx) => ({
    rank: idx + 1,
    digits: item.digits,
    label: item.digits.join(''),
    sum: item.sum,
    score: Number((item.score * 100).toFixed(1)),
    probability: Number(((item.score / scoreSum) * 100).toFixed(1)),
    numberType: item.numberType,
    fromHistory: !!item.fromHistory,
  }))
}

function searchBestCombo(
  draws,
  patternPick,
  oePick,
  sumTarget,
  digitBand,
  comboFreq,
  countBand,
  requireCountBand,
  typePred,
  allowedTypes,
) {
  const flags = patternFlagsFromIdx(patternPick.i)
  const posCandidates = posCandidatesForOe(draws, flags, oePick.i, digitBand)

  let best = null
  let bestScore = -1
  for (const a of posCandidates[0]) {
    for (const b of posCandidates[1]) {
      for (const c of posCandidates[2]) {
        const digits = [a.d, b.d, c.d]
        if (patternIdxOf({ digits }) !== patternPick.i) continue
        if (!matchesOeCategory(digits, oePick.i)) continue
        if (!passesTypeFilter(digits, allowedTypes)) continue
        if (
          comboAppearCount(comboFreq, digits) === 0 &&
          draws.length >= MIN_DRAWS_FOR_APPEAR_FILTER
        ) continue
        if (requireCountBand && !isComboCountInBand(comboFreq, digits, countBand)) continue
        const { sum, score, numberType } = scoreCombo(
          a, b, c, patternPick, oePick, sumTarget, comboFreq, countBand, typePred,
        )
        if (sum > 27) continue
        if (score > bestScore) {
          bestScore = score
          best = {
            digits,
            sum,
            score,
            flags,
            numberType,
            comboCount: comboAppearCount(comboFreq, digits),
          }
        }
      }
    }
  }
  return best
}

function buildPrimaryRecommendation(draws, patternPick, oePick, sumTarget, typePred) {
  const comboFreq = buildCombinationFrequency(draws)
  const countBand = comboCountBandFromFreq(comboFreq)
  const strictTypes = allowedNumberTypes(typePred)
  const relaxedTypes = new Set(['组三', '组六'])

  for (const allowedTypes of [strictTypes, relaxedTypes]) {
    const hist = searchFromHistoricalDraws(
      draws, patternPick, oePick, sumTarget, comboFreq, countBand, true,
      typePred, allowedTypes,
    )
    if (hist) return { ...hist, countBand }

    const histRelaxed = searchFromHistoricalDraws(
      draws, patternPick, oePick, sumTarget, comboFreq, countBand, false,
      typePred, allowedTypes,
    )
    if (histRelaxed) return { ...histRelaxed, countBand }

    const digitBands = [
      { min: FREQ_BAND_MIN, max: FREQ_BAND_MAX },
      { min: 0.15, max: 0.85 },
      { min: 0, max: 1 },
    ]
    for (const requireCountBand of [true, false]) {
      for (const digitBand of digitBands) {
        const best = searchBestCombo(
          draws, patternPick, oePick, sumTarget, digitBand,
          comboFreq, countBand, requireCountBand, typePred, allowedTypes,
        )
        if (best) return { ...best, countBand }
      }
    }
  }
  return null
}

// ── Digit scoring ─────────────────────────────────────────────────────────────

function scoredDigitsFor(draws, pos, isUp, RECENT) {
  const range = isUp ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]
  const n = draws.length
  const recentDraws = draws.slice(Math.max(0, n - RECENT))

  return range.map((d) => {
    let freq = 0, recentFreq = 0, gap = 0, streak = 0
    for (const draw of draws) if (draw.digits[pos] === d) freq++
    for (const draw of recentDraws) if (draw.digits[pos] === d) recentFreq++
    for (let i = n - 1; i >= 0; i--) {
      if (draws[i].digits[pos] === d) break
      gap++
    }
    for (let i = n - 1; i >= 0; i--) {
      if (draws[i].digits[pos] === d) streak++
      else break
    }
    return { d, freq, recentFreq, gap, streak }
  })
}

// ── Main prediction builder ───────────────────────────────────────────────────

/**
 * Run the full prediction on `draws`.
 * 首选：形态·奇偶比·和值·组三/组六(近24天间断规律) + 组合次数中间段历史号优先
 * 形态从左到右：百位→十位→个位
 */
export function buildPrediction(draws) {
  if (draws.length < 20) return null
  const n = draws.length
  const lastDraw = draws[n - 1]
  const refDate = new Date(lastDraw.kjdate?.replace(/-/g, '/') ?? new Date())

  const patternPick = pickBestWindowCategory(
    draws, 8, patternIdxOf, (d, i) => gapOf(d, patternIdxOf, i), refDate, PATTERN_LABELS,
  )
  const oePick = pickBestWindowCategory(
    draws, 4, oeCatOf, (d, i) => gapOf(d, oeCatOf, i), refDate, OE_LABELS,
  )
  const sumTarget = sumMeanReversionTarget(draws)
  const flags = patternFlagsFromIdx(patternPick.i)
  const typePred = predictTypeProbabilities(draws, undefined, refDate)
  const topType = typePred.pcts[0] >= typePred.pcts[1] ? '组三' : '组六'
  const topTypeProb = Math.max(typePred.pcts[0], typePred.pcts[1])

  const sumGapArr = Array.from({ length: 28 }, (_, s) => gapOf(draws, (draw) => draw.sum, s))

  const comboFreq = buildCombinationFrequency(draws)
  const countBand = comboCountBandFromFreq(comboFreq)

  let primary = buildPrimaryRecommendation(draws, patternPick, oePick, sumTarget, typePred)
  if (!primary) {
    primary = searchBestCombo(
      draws, patternPick, oePick, sumTarget, { min: 0, max: 1 },
      comboFreq, countBand, false, typePred, new Set(['组三', '组六']),
    )
  }
  if (!primary) return null

  const recommendations = []

  function pushRec(rank, combo, oeLabel, oeProb, extra = {}) {
    if (OE_LABELS[oeCatOfDigits(combo.digits)] !== oeLabel) return
    recommendations.push({
      rank,
      digits: combo.digits,
      sum: combo.sum,
      pattern: patternPick.label,
      patternIdx: patternPick.i,
      probability: patternPick.p,
      oddEvenRatio: oeLabel,
      oddEvenProb: oeProb,
      sumTarget: Number(sumTarget.sumMA.toFixed(1)),
      sumDev: Number((combo.sum - sumTarget.sumMA).toFixed(1)),
      sumGap: sumGapArr[combo.sum],
      score: Number((combo.score * 100).toFixed(1)),
      flags: combo.flags,
      ...extra,
    })
  }

  const band = primary.countBand ?? countBand
  const numberType = primary.numberType ?? getNumberType(primary.digits)
  const typeProb = numberType === '组三' ? typePred.pcts[0] : typePred.pcts[1]

  pushRec(1, primary, oePick.label, oePick.p, {
    patternWindow: patternPick.window,
    oeWindow: oePick.window,
    sumWindow: sumTarget.window,
    comboCount: primary.comboCount ?? comboAppearCount(comboFreq, primary.digits),
    comboCountRange: `${band.filterMin}–${band.filterMax}`,
    fromHistory: !!primary.fromHistory,
    numberType,
    numberTypeProb: Number(typeProb.toFixed(1)),
  })

  const groupTypes = allowedNumberTypes(typePred)
  const relaxedGroupTypes = groupTypes.size ? groupTypes : new Set(['组三', '组六'])
  let predictionGroups = searchTopCombos(
    draws, patternPick, oePick, sumTarget, comboFreq, countBand, typePred, relaxedGroupTypes,
  )
  const primaryKey = primary.digits.join('')
  if (!predictionGroups.some((g) => g.label === primaryKey)) {
    const primaryScore = primary.score ?? scoreHistorical(
      primary.digits, patternPick, oePick, sumTarget, comboFreq, countBand, typePred,
    ).score
    predictionGroups = [
      {
        rank: 1,
        digits: primary.digits,
        label: primaryKey,
        sum: primary.sum,
        score: Number((primaryScore * 100).toFixed(1)),
        probability: 0,
        numberType,
        fromHistory: !!primary.fromHistory,
        isPrimary: true,
      },
      ...predictionGroups,
    ].slice(0, MAX_PREDICTION_GROUPS)
    const total = predictionGroups.reduce((s, g) => s + g.score, 0) || 1
    predictionGroups = predictionGroups.map((g, i) => ({
      ...g,
      rank: i + 1,
      probability: Number(((g.score / total) * 100).toFixed(1)),
    }))
  }

  return {
    topPattern: patternPick.label,
    topPatternProb: Number(patternPick.p.toFixed(1)),
    topOddEven: oePick.label,
    topOddEvenProb: Number(oePick.p.toFixed(1)),
    topOE: oePick.label,
    topOEProb: Number(oePick.p.toFixed(1)),
    topType,
    topTypeProb: Number(topTypeProb.toFixed(1)),
    typeZu3Prob: Number(typePred.pcts[0].toFixed(1)),
    typeZu6Prob: Number(typePred.pcts[1].toFixed(1)),
    typeSignal: typePred.signalLabel,
    patternWindow: patternPick.window,
    oeWindow: oePick.window,
    sumTarget: sumTarget.targetSum,
    recentSumAvg: Number(sumTarget.sumMA.toFixed(1)),
    comboCountRange: `${countBand.filterMin}–${countBand.filterMax}`,
    basePeriods: n,
    recommendations,
    predictionGroups,
    flags,
  }
}
