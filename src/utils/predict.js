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

/** 百→十→个 逐位奇偶排序（8 种，编码与 patternIdxOf 一致：偶=0，奇=1） */
export const OE_SEQUENCE_LABELS = [
  '偶偶偶', '偶偶奇', '偶奇偶', '偶奇奇',
  '奇偶偶', '奇偶奇', '奇奇偶', '奇奇奇',
]

export function oeSequenceIdxOf(draw) {
  return draw.digits.reduce((acc, d) => acc * 2 + (d % 2 === 1 ? 1 : 0), 0)
}

/** 如 [2,5,8] → 「偶奇偶」 */
export function oddEvenSequenceOf(digits) {
  return OE_SEQUENCE_LABELS[oeSequenceIdxOf({ digits })]
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

/** 遗漏加成封顶：相对理论期望期数，避免「越久未出越押它」的赌徒谬误陷阱 */
export function cappedOmiBoost(gap, numCats = 8) {
  const expectedGap = Math.max(numCats - 1, 1)
  const soft = Math.min(gap / expectedGap, 2.5)
  return 1 + OMI_WEIGHT * (soft / 2.5)
}

function categoryRawScore(count, avg, gap, numCats) {
  const base = Math.max(0.05, 2 * avg - count)
  return base * cappedOmiBoost(gap, numCats)
}

// ── Method 1: Multi-window frequency + gap (original) ────────────────────────

function computeProb(draws, numCats, categoryFn, gapsFn, refDate) {
  const gaps = Array.from({ length: numCats }, (_, i) => gapsFn(draws, i))

  const scores = new Array(numCats).fill(0)
  for (const w of WINDOWS) {
    const { counts, total } = windowCounts(draws, w.days, numCats, categoryFn, refDate)
    if (total === 0) continue
    const avg = total / numCats
    const raws = counts.map((c, i) => categoryRawScore(c, avg, gaps[i], numCats))
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

  let scoreUp = 0
  let totalWeight = 0
  for (const w of WINDOWS) {
    const { counts, total } = windowCounts(draws, w.days, 2, bitOf, refDate)
    if (total === 0) continue
    const avg = total / 2
    const rawUp = categoryRawScore(counts[0], avg, gaps[0], 2)
    const rawDown = categoryRawScore(counts[1], avg, gaps[1], 2)
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

function computePositionOddProb(draws, pos, refDate) {
  const oddOf = (draw) => (draw.digits[pos] % 2 === 1 ? 1 : 0)
  const gaps = [0, 1].map((bit) => gapOf(draws, oddOf, bit))

  let scoreOdd = 0
  let totalWeight = 0
  for (const w of WINDOWS) {
    const { counts, total } = windowCounts(draws, w.days, 2, oddOf, refDate)
    if (total === 0) continue
    const avg = total / 2
    const rawOdd = categoryRawScore(counts[1], avg, gaps[1], 2)
    const rawEven = categoryRawScore(counts[0], avg, gaps[0], 2)
    scoreOdd += (rawOdd / (rawOdd + rawEven)) * w.weight
    totalWeight += w.weight
  }
  return totalWeight > 0 ? scoreOdd / totalWeight : 0.5
}

/** 三位独立奇偶 → 四种奇偶比概率（与 oeCatOf 编码一致） */
function perPositionOeProb(draws, refDate) {
  const oddProb = [0, 1, 2].map((pos) => computePositionOddProb(draws, pos, refDate))
  const result = new Array(4).fill(0)
  for (let mask = 0; mask < 8; mask++) {
    const bits = [(mask >> 2) & 1, (mask >> 1) & 1, mask & 1]
    const oddCount = bits.reduce((s, b) => s + b, 0)
    const cat = 3 - oddCount
    let prod = 1
    for (let pos = 0; pos < 3; pos++) {
      prod *= bits[pos] ? oddProb[pos] : 1 - oddProb[pos]
    }
    result[cat] += prod
  }
  return result
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

function markovOeProb(draws) {
  const n = draws.length
  const last = oeCatOf(draws[n - 1])
  const slice = draws.slice(Math.max(0, n - 800))
  const counts = new Array(4).fill(0)
  let total = 0
  for (let i = 1; i < slice.length; i++) {
    if (oeCatOf(slice[i - 1]) === last) {
      counts[oeCatOf(slice[i])]++
      total++
    }
  }
  if (total < 4) return new Array(4).fill(0.25)
  return counts.map((c) => (c + 0.5) / (total + 2))
}

function markov2OeProb(draws) {
  const n = draws.length
  if (n < 3) return new Array(4).fill(0.25)
  const last = oeCatOf(draws[n - 1])
  const prev = oeCatOf(draws[n - 2])
  const slice = draws.slice(Math.max(0, n - 1200))
  const counts = new Array(4).fill(0)
  let total = 0
  for (let i = 2; i < slice.length; i++) {
    if (oeCatOf(slice[i - 1]) === last && oeCatOf(slice[i - 2]) === prev) {
      counts[oeCatOf(slice[i])]++
      total++
    }
  }
  const order1 = markovOeProb(draws)
  if (total < 5) return order1
  const lambda = Math.min(0.7, total / 30)
  const order2 = counts.map((c) => (c + 0.5) / (total + 2))
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

// ── 形态集成预测（多窗口频率 + 逐位 + 马尔可夫 + 和值条件 + 图表窗口）────────

const PATTERN_ENSEMBLE = {
  freqGap: 0.30,
  position: 0.22,
  markov: 0.23,
  sumCond: 0.15,
  chartWindow: 0.10,
}
/** 向均匀先验回拉，抑制单一形态长期霸榜（理论各 12.5%） */
const PATTERN_UNIFORM_BLEND = 0.12

function normalizePct(arr) {
  const sum = arr.reduce((a, b) => a + b, 0)
  if (sum <= 0) return arr.map(() => 100 / arr.length)
  return arr.map((v) => (v / sum) * 100)
}

function ensemblePatternProb(draws, refDate) {
  const pFreq = computeProb(draws, 8, patternIdxOf, (d, i) => gapOf(d, patternIdxOf, i), refDate)
  const pPos = perPositionPatternProb(draws, refDate).map((x) => x * 100)
  const pMarkov = markov2PatternProb(draws).map((x) => x * 100)
  const pSum = sumConditionalPatternProb(draws).map((x) => x * 100)
  const w8 = windowCategoryPredictedPct(draws, 8, 8, patternIdxOf, (d, i) => gapOf(d, patternIdxOf, i), refDate)
  const penalty = recentStreakPenalty(draws)
  const uniform = 100 / 8
  const w = PATTERN_ENSEMBLE
  const blended = Array.from({ length: 8 }, (_, i) => {
    let v =
      w.freqGap * pFreq[i] +
      w.position * pPos[i] +
      w.markov * pMarkov[i] +
      w.sumCond * pSum[i] +
      w.chartWindow * w8.probs[i]
    v *= penalty[i]
    v = (1 - PATTERN_UNIFORM_BLEND) * v + PATTERN_UNIFORM_BLEND * uniform
    return v
  })
  return normalizePct(blended)
}

function pickPatternCategory(draws, refDate) {
  const probs = ensemblePatternProb(draws, refDate)
  const top = topFromWindowProbs(probs, PATTERN_LABELS)
  const topK = topKFromProbs(probs, PATTERN_LABELS, 1)
  const w8 = windowCategoryPredictedPct(draws, 8, 8, patternIdxOf, (d, i) => gapOf(d, patternIdxOf, i), refDate)
  const w16 = windowCategoryPredictedPct(draws, 16, 8, patternIdxOf, (d, i) => gapOf(d, patternIdxOf, i), refDate)
  const top8 = topFromWindowProbs(w8.probs, PATTERN_LABELS)
  const top16 = topFromWindowProbs(w16.probs, PATTERN_LABELS)
  const window = top8.p >= top16.p ? 8 : 16
  return { ...top, window, windowProbs: probs, topK }
}

// ── 奇偶比集成预测（抑制过度押注 3:0 / 0:3）──────────────────────────────────

/** 三位独立奇偶的理论分布：3:0 / 0:3 各 12.5%，2:1 / 1:2 各 37.5% */
export const OE_THEORETICAL_PRIOR = [12.5, 37.5, 37.5, 12.5]

const OE_ENSEMBLE = {
  freqGap: 0.20,
  empirical: 0.30,
  position: 0.20,
  markov: 0.20,
  chartWindow: 0.10,
}
const OE_THEORETICAL_BLEND = 0.22

function empiricalOeProb(draws, refDate) {
  const { counts, total } = windowCounts(draws, 48, 4, oeCatOf, refDate)
  if (total === 0) return [...OE_THEORETICAL_PRIOR]
  return counts.map((c) => ((c + 1) / (total + 4)) * 100)
}

function recentStreakPenaltyOE(draws) {
  const n = draws.length
  const penalty = new Array(4).fill(1)
  const decay = [0.85, 0.93, 0.97]
  for (let k = 0; k < decay.length && k < n; k++) {
    penalty[oeCatOf(draws[n - 1 - k])] *= decay[k]
  }
  return penalty
}

function ensembleOeProb(draws, refDate) {
  const pFreq = computeProb(draws, 4, oeCatOf, (d, i) => gapOf(d, oeCatOf, i), refDate)
  const pEmp = empiricalOeProb(draws, refDate)
  const pPos = perPositionOeProb(draws, refDate).map((x) => x * 100)
  const pMarkov = markov2OeProb(draws).map((x) => x * 100)
  const w8 = windowCategoryPredictedPct(draws, 8, 4, oeCatOf, (d, i) => gapOf(d, oeCatOf, i), refDate)
  const penalty = recentStreakPenaltyOE(draws)
  const w = OE_ENSEMBLE
  const blended = Array.from({ length: 4 }, (_, i) => {
    let v =
      w.freqGap * pFreq[i] +
      w.empirical * pEmp[i] +
      w.position * pPos[i] +
      w.markov * pMarkov[i] +
      w.chartWindow * w8.probs[i]
    v *= penalty[i]
    v = (1 - OE_THEORETICAL_BLEND) * v + OE_THEORETICAL_BLEND * OE_THEORETICAL_PRIOR[i]
    return v
  })
  return normalizePct(blended)
}

function pickOeCategory(draws, refDate) {
  const probs = ensembleOeProb(draws, refDate)
  const top = topFromWindowProbs(probs, OE_LABELS)
  const w8 = windowCategoryPredictedPct(draws, 8, 4, oeCatOf, (d, i) => gapOf(d, oeCatOf, i), refDate)
  const w16 = windowCategoryPredictedPct(draws, 16, 4, oeCatOf, (d, i) => gapOf(d, oeCatOf, i), refDate)
  const top8 = topFromWindowProbs(w8.probs, OE_LABELS)
  const top16 = topFromWindowProbs(w16.probs, OE_LABELS)
  const window = top8.p >= top16.p ? 8 : 16
  return { ...top, window, windowProbs: probs }
}

// ── 奇偶排序集成预测（8 种，百→十→个）────────────────────────────────────────

function perPositionOeSequenceProb(draws, refDate) {
  const oddProb = [0, 1, 2].map((pos) => computePositionOddProb(draws, pos, refDate))
  return Array.from({ length: 8 }, (_, i) => {
    const bits = [(i >> 2) & 1, (i >> 1) & 1, i & 1]
    return bits.reduce((p, bit, pos) => p * (bit === 1 ? oddProb[pos] : 1 - oddProb[pos]), 1)
  })
}

function markovOeSequenceProb(draws) {
  const n = draws.length
  const last = oeSequenceIdxOf(draws[n - 1])
  const slice = draws.slice(Math.max(0, n - 800))
  const counts = new Array(8).fill(0)
  let total = 0
  for (let i = 1; i < slice.length; i++) {
    if (oeSequenceIdxOf(slice[i - 1]) === last) {
      counts[oeSequenceIdxOf(slice[i])]++
      total++
    }
  }
  if (total < 8) return new Array(8).fill(1 / 8)
  return counts.map((c) => (c + 0.5) / (total + 4))
}

function markov2OeSequenceProb(draws) {
  const n = draws.length
  if (n < 3) return new Array(8).fill(1 / 8)
  const last = oeSequenceIdxOf(draws[n - 1])
  const prev = oeSequenceIdxOf(draws[n - 2])
  const slice = draws.slice(Math.max(0, n - 1200))
  const counts = new Array(8).fill(0)
  let total = 0
  for (let i = 2; i < slice.length; i++) {
    if (oeSequenceIdxOf(slice[i - 1]) === last && oeSequenceIdxOf(slice[i - 2]) === prev) {
      counts[oeSequenceIdxOf(slice[i])]++
      total++
    }
  }
  const order1 = markovOeSequenceProb(draws)
  if (total < 5) return order1
  const lambda = Math.min(0.7, total / 30)
  const order2 = counts.map((c) => (c + 0.5) / (total + 4))
  return order2.map((p, i) => lambda * p + (1 - lambda) * order1[i])
}

function sumConditionalOeSequenceProb(draws) {
  const sumSeqCount = Array.from({ length: 28 }, () => new Array(8).fill(0))
  const sumCount = new Array(28).fill(0)
  for (const draw of draws) {
    const s = draw.sum
    if (s < 0 || s > 27) continue
    sumSeqCount[s][oeSequenceIdxOf(draw)]++
    sumCount[s]++
  }

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

  const result = new Array(8).fill(0)
  for (let s = 0; s <= 27; s++) {
    if (sumCount[s] === 0) continue
    for (let p = 0; p < 8; p++) {
      result[p] += (sumSeqCount[s][p] / sumCount[s]) * sumProb[s]
    }
  }
  const total = result.reduce((a, b) => a + b, 0)
  return total > 0 ? result.map((p) => p / total) : new Array(8).fill(1 / 8)
}

function recentStreakPenaltyOESeq(draws) {
  const n = draws.length
  const penalty = new Array(8).fill(1)
  const decay = [0.85, 0.93, 0.97]
  for (let k = 0; k < decay.length && k < n; k++) {
    penalty[oeSequenceIdxOf(draws[n - 1 - k])] *= decay[k]
  }
  return penalty
}

const OE_SEQ_ENSEMBLE = { ...PATTERN_ENSEMBLE }

function ensembleOeSequenceProb(draws, refDate) {
  const pFreq = computeProb(draws, 8, oeSequenceIdxOf, (d, i) => gapOf(d, oeSequenceIdxOf, i), refDate)
  const pPos = perPositionOeSequenceProb(draws, refDate).map((x) => x * 100)
  const pMarkov = markov2OeSequenceProb(draws).map((x) => x * 100)
  const pSum = sumConditionalOeSequenceProb(draws).map((x) => x * 100)
  const w8 = windowCategoryPredictedPct(draws, 8, 8, oeSequenceIdxOf, (d, i) => gapOf(d, oeSequenceIdxOf, i), refDate)
  const penalty = recentStreakPenaltyOESeq(draws)
  const uniform = 100 / 8
  const w = OE_SEQ_ENSEMBLE
  const blended = Array.from({ length: 8 }, (_, i) => {
    let v =
      w.freqGap * pFreq[i] +
      w.position * pPos[i] +
      w.markov * pMarkov[i] +
      w.sumCond * pSum[i] +
      w.chartWindow * w8.probs[i]
    v *= penalty[i]
    v = (1 - PATTERN_UNIFORM_BLEND) * v + PATTERN_UNIFORM_BLEND * uniform
    return v
  })
  return normalizePct(blended)
}

function pickOeSequenceCategory(draws, refDate) {
  const probs = ensembleOeSequenceProb(draws, refDate)
  const top = topFromWindowProbs(probs, OE_SEQUENCE_LABELS)
  const w8 = windowCategoryPredictedPct(draws, 8, 8, oeSequenceIdxOf, (d, i) => gapOf(d, oeSequenceIdxOf, i), refDate)
  const w16 = windowCategoryPredictedPct(draws, 16, 8, oeSequenceIdxOf, (d, i) => gapOf(d, oeSequenceIdxOf, i), refDate)
  const top8 = topFromWindowProbs(w8.probs, OE_SEQUENCE_LABELS)
  const top16 = topFromWindowProbs(w16.probs, OE_SEQUENCE_LABELS)
  const window = top8.p >= top16.p ? 8 : 16
  return { ...top, window, windowProbs: probs }
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
const W_OE = 0.28
const W_SUM = 0.26
const W_TYPE = 0.06

/** 推荐号仅含组六（排除组三、豹子） */
const RECOMMEND_NUMBER_TYPES = new Set(['组六'])

/** 回测/悬浮展示时收集的全部匹配组数上限 */
const ALL_MATCHES_COLLECT = 500
export const ALL_MATCHES_DISPLAY_CAP = 200

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
  const avg = total / numCats
  const raws = counts.map((c, i) => categoryRawScore(c, avg, gaps[i], numCats))
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

/** 按概率取前 k 个类别 */
export function topKFromProbs(probs, labels, k = 2) {
  return probs
    .map((p, i) => ({ i, p, label: labels[i] }))
    .sort((a, b) => b.p - a.p)
    .slice(0, k)
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

/**
 * 和值走势：均线、均值回归目标、近端斜率、连续涨跌 → 推荐号评分与软筛选
 * （与和值走势图均线 + 近段高低点走向一致）
 */
export function buildSumTrendTarget(draws) {
  const base = sumMeanReversionTarget(draws)
  const n = draws.length
  const maLen = Math.min(30, n)
  const maSlice = draws.slice(Math.max(0, n - maLen))
  const sums = maSlice.map((d) => d.sum)
  const variance = sums.reduce((a, s) => a + (s - base.sumMA) ** 2, 0) / sums.length
  const std = Math.max(2, Math.sqrt(variance))

  const last8 = draws.slice(Math.max(0, n - 8)).map((d) => d.sum)
  let trendSlope = 0
  if (last8.length >= 3) {
    const m = last8.length
    const meanX = (m - 1) / 2
    const meanY = last8.reduce((a, b) => a + b, 0) / m
    let num = 0
    let den = 0
    last8.forEach((y, x) => {
      num += (x - meanX) * (y - meanY)
      den += (x - meanX) ** 2
    })
    trendSlope = den > 0 ? num / den : 0
  }

  let streak = 0
  let streakDir = 0
  for (let i = n - 1; i >= 1; i--) {
    const diff = draws[i].sum - draws[i - 1].sum
    if (diff === 0) break
    const dir = diff > 0 ? 1 : -1
    if (streakDir === 0) streakDir = dir
    if (dir !== streakDir) break
    streak++
  }

  let targetSum = base.targetSum
  if (Math.abs(trendSlope) >= 0.35) {
    targetSum = Math.round(
      Math.max(0, Math.min(27, targetSum + Math.sign(trendSlope) * Math.min(2, Math.abs(trendSlope) * 2))),
    )
  }
  if (streak >= 2 && streakDir !== 0) {
    targetSum = Math.round(Math.max(0, Math.min(27, targetSum + streakDir)))
  }

  const bandMin = Math.max(0, Math.round(targetSum - std))
  const bandMax = Math.min(27, Math.round(targetSum + std))
  const softMin = Math.max(0, bandMin - 2)
  const softMax = Math.min(27, bandMax + 2)

  let trendLabel = '围绕均线'
  if (trendSlope >= 0.5) trendLabel = '近期走高'
  else if (trendSlope <= -0.5) trendLabel = '近期走低'
  if (base.direction === 1 && streakDir <= 0) trendLabel = '偏低反弹'
  else if (base.direction === -1 && streakDir >= 0) trendLabel = '偏高回落'

  return {
    ...base,
    targetSum,
    std,
    bandMin,
    bandMax,
    softMin,
    softMax,
    trendSlope,
    streak,
    streakDir,
    trendLabel,
  }
}

/** 0–1：号码和值与走势目标的一致度 */
function sumTrendFit(sum, sumTarget) {
  const dist = Math.abs(sum - sumTarget.targetSum)
  const gaussian = Math.exp(-0.5 * (dist / Math.max(sumTarget.std, 2)) ** 2)
  const revert = Math.max(0, 1 - dist / 13.5)

  let bandFit = 1
  if (sum < sumTarget.softMin || sum > sumTarget.softMax) {
    const over = sum < sumTarget.softMin
      ? sumTarget.softMin - sum
      : sum - sumTarget.softMax
    bandFit = Math.max(0.15, 1 - over / 6)
  } else if (sum < sumTarget.bandMin || sum > sumTarget.bandMax) {
    bandFit = 0.75
  }

  let trendAlign = 0.55
  const slope = sumTarget.trendSlope ?? 0
  if (slope >= 0.35) {
    trendAlign = sum >= sumTarget.sumMA ? 0.85 : 0.45
  } else if (slope <= -0.35) {
    trendAlign = sum <= sumTarget.sumMA ? 0.85 : 0.45
  } else if (sumTarget.direction === 1) {
    trendAlign = sum >= sumTarget.sumMA ? 0.8 : 0.5
  } else if (sumTarget.direction === -1) {
    trendAlign = sum <= sumTarget.sumMA ? 0.8 : 0.5
  } else {
    trendAlign = gaussian
  }

  return Math.min(1, (0.45 * gaussian + 0.35 * revert + 0.2 * trendAlign) * bandFit)
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

function parityByPosFromOeRatio(oeIdx) {
  if (oeIdx === 0) return ['odd', 'odd', 'odd']
  if (oeIdx === 3) return ['even', 'even', 'even']
  return [null, null, null]
}

/** 形态 + 奇偶比 约束每位候选数字 */
function posCandidates(draws, flags, oePick, band) {
  const ratioParity = parityByPosFromOeRatio(oePick.i)

  return [0, 1, 2].map((pos) => {
    const isUp = flags[pos] === 0
    const base = digitsInFreqBand(draws, pos, isUp, band)
    const fullRange = () => allDigitsInRange(draws, pos, isUp)

    let list = base
    if (ratioParity[pos]) {
      const withRatio = parityFilter(list, ratioParity[pos])
      if (withRatio.length) list = withRatio
    }
    return list.length ? list : fullRange()
  })
}

function matchesOeCategory(digits, oeIdx) {
  return oeCatOfDigits(digits) === oeIdx
}

function passesRecommendTypeFilter(digits) {
  return RECOMMEND_NUMBER_TYPES.has(getNumberType(digits))
}

/** flags[pos]：0=上 1=下，顺序为 [百位, 十位, 个位] */
function patternFlagsFromIdx(idx) {
  return [(idx >> 2) & 1, (idx >> 1) & 1, idx & 1]
}

/** 每位从对应「上(0–4)/下(5–9)」行选取的号码个数，笛卡尔积为 3³=27 注 */
export const PICKS_PER_POSITION = 3
export const TWENTY_SEVEN_BET_COUNT = PICKS_PER_POSITION ** 3

/**
 * 按预测上下形态：百/十/个位各在对应上或下行选 3 个号，展开为 27 注（直选复式）
 * 上=0–4，下=5–9；选号参考遗漏与频次中间段
 */
export function buildTwentySevenBets(draws, patternPick, oePick) {
  const flags = patternFlagsFromIdx(patternPick.i)
  const band = { min: FREQ_BAND_MIN, max: FREQ_BAND_MAX }
  const posLists = posCandidates(draws, flags, oePick, band)

  const positionPicks = posLists.map((list, pos) => {
    const isUp = flags[pos] === 0
    const range = isUp ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]
    const sorted = [...list].sort((a, b) => a.midDist - b.midDist || b.gap - a.gap || a.d - b.d)
    const picked = []
    for (const x of sorted) {
      if (picked.length >= PICKS_PER_POSITION) break
      if (!picked.includes(x.d)) picked.push(x.d)
    }
    for (const d of range) {
      if (picked.length >= PICKS_PER_POSITION) break
      if (!picked.includes(d)) picked.push(d)
    }
    return picked.slice(0, PICKS_PER_POSITION).sort((a, b) => a - b)
  })

  const combos = []
  for (const a of positionPicks[0]) {
    for (const b of positionPicks[1]) {
      for (const c of positionPicks[2]) {
        combos.push([a, b, c])
      }
    }
  }

  return {
    pattern: patternPick.label,
    patternFlags: flags.map((f) => (f === 0 ? '上' : '下')),
    positionLabels: ['百位', '十位', '个位'],
    positionPicks,
    combos,
    count: combos.length,
  }
}

function scoreCombo(a, b, c, patternPick, oePick, sumTarget, comboFreq, countBand, typePred) {
  const digits = [a.d, b.d, c.d]
  const sum = a.d + b.d + c.d
  const sumFit = sumTrendFit(sum, sumTarget)
  const digitFit =
    (1 - a.midDist / 0.25 + 1 - b.midDist / 0.25 + 1 - c.midDist / 0.25) / 3
  const countFit = comboCountBandFit(comboFreq, digits, countBand)
  const gapFit = (a.gap + b.gap + c.gap) / 3
  const tFit = typeFitScore(digits, typePred)
  const score =
    W_PATTERN * patternPick.p / 100 +
    W_OE * oePick.p / 100 +
    W_SUM * (0.7 * sumFit + 0.3 * Math.min(1, digitFit)) +
    W_TYPE * tFit +
    countFit * 0.12 +
    gapFit * 0.001
  return { sum, score, sumFit, countFit, numberType: getNumberType(digits) }
}

function scoreHistorical(digits, patternPick, oePick, sumTarget, comboFreq, countBand, typePred) {
  const sum = digits[0] + digits[1] + digits[2]
  const sumFit = sumTrendFit(sum, sumTarget)
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

/** 优先保留和值落在走势软区间内的候选 */
function rankBySumTrend(candidates, sumTarget, maxCount) {
  const all = [...candidates.values()]
  const inSoft = all.filter((c) => c.sum >= sumTarget.softMin && c.sum <= sumTarget.softMax)
  const pool = inSoft.length >= maxCount ? inSoft : all
  return pool.sort((a, b) => b.score - a.score).slice(0, maxCount)
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
    if (!passesRecommendTypeFilter(digits)) continue
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
/** 每期对外展示的推荐号码组数（形态 + 奇偶比综合筛选，改此常量即可） */
export const RECOMMENDATION_COUNT = 6

function patternTopK(patternPick) {
  return patternPick.topK ?? [{ i: patternPick.i, p: patternPick.p, label: patternPick.label }]
}

function effectivePatternPick(patternPick, digits) {
  const idx = patternIdxOf({ digits })
  const entry = patternTopK(patternPick).find((t) => t.i === idx)
  if (entry) return { ...patternPick, i: entry.i, p: entry.p, label: entry.label }
  return patternPick
}

function upsertComboCandidate(map, entry) {
  const key = entry.digits.join('')
  const prev = map.get(key)
  if (!prev || entry.score > prev.score) map.set(key, entry)
}

function historyPriority(c) {
  return (c.fromHistory || (c.comboCount ?? 0) > 0) ? 1 : 0
}

function compareCandidatePriority(a, b) {
  const hp = historyPriority(b) - historyPriority(a)
  if (hp !== 0) return hp
  return b.score - a.score
}

function finalizePredictionGroups(ranked, limit) {
  const sorted = [...ranked].sort(compareCandidatePriority)
  const sliced = limit ? sorted.slice(0, limit) : sorted
  const scoreSum = sliced.reduce((s, x) => s + x.score, 0) || 1
  return sliced.map((item, idx) => ({
    rank: idx + 1,
    digits: item.digits,
    label: item.digits.join(''),
    sum: item.sum,
    score: Number((item.score * 100).toFixed(1)),
    probability: Number(((item.score / scoreSum) * 100).toFixed(1)),
    numberType: item.numberType,
    fromHistory: !!(item.fromHistory || (item.comboCount ?? 0) > 0),
    comboCount: item.comboCount ?? 0,
  }))
}

/** 收集评分最高的若干组号码，opts 可放宽历史出现、数字频次等约束 */
function searchTopCombos(
  draws,
  patternPick,
  oePick,
  sumTarget,
  comboFreq,
  countBand,
  typePred,
  maxCount = MAX_PREDICTION_GROUPS,
  opts = {},
) {
  const digitBand = opts.digitBand ?? { min: FREQ_BAND_MIN, max: FREQ_BAND_MAX }
  const candidates = new Map()
  const histSeen = new Set()

  for (const pat of patternTopK(patternPick)) {
    const subPick = { ...patternPick, i: pat.i, p: pat.p, label: pat.label }
    const flags = patternFlagsFromIdx(pat.i)
    const posCands = posCandidates(draws, flags, oePick, digitBand)

    for (const a of posCands[0]) {
      for (const b of posCands[1]) {
        for (const c of posCands[2]) {
          const digits = [a.d, b.d, c.d]
          if (patternIdxOf({ digits }) !== pat.i) continue
          if (!matchesOeCategory(digits, oePick.i)) continue
          if (!passesRecommendTypeFilter(digits)) continue
          const appearCount = comboAppearCount(comboFreq, digits)
          const { sum, score, numberType } = scoreCombo(
            a, b, c, subPick, oePick, sumTarget, comboFreq, countBand, typePred,
          )
          if (sum > 27) continue
          upsertComboCandidate(candidates, {
            digits,
            sum,
            score,
            flags,
            numberType,
            comboCount: appearCount,
            fromHistory: appearCount > 0,
          })
        }
      }
    }

    for (let i = draws.length - 1; i >= 0; i--) {
      const draw = draws[i]
      const digits = draw.digits
      const key = digits.join('')
      if (histSeen.has(key)) continue
      if (patternIdxOf(draw) !== pat.i) continue
      if (oeCatOf(draw) !== oePick.i) continue
      if (!passesRecommendTypeFilter(digits)) continue
      histSeen.add(key)
      const { sum, score, numberType } = scoreHistorical(
        digits, subPick, oePick, sumTarget, comboFreq, countBand, typePred,
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
  }

  return finalizePredictionGroups(rankBySumTrend(candidates, sumTarget, maxCount), maxCount)
}

/** 多轮放宽约束，凑满 RECOMMENDATION_COUNT 组推荐号 */
function ensurePredictionGroups(
  draws,
  patternPick,
  oePick,
  sumTarget,
  comboFreq,
  countBand,
  typePred,
) {
  const target = RECOMMENDATION_COUNT
  const defaultBand = { min: FREQ_BAND_MIN, max: FREQ_BAND_MAX }
  const seen = new Set()
  const raw = []

  function absorb(batch) {
    for (const g of batch) {
      if (seen.has(g.label)) continue
      seen.add(g.label)
      raw.push({
        digits: g.digits,
        sum: g.sum,
        score: g.score / 100,
        numberType: g.numberType,
        fromHistory: g.fromHistory,
        comboCount: g.comboCount ?? 0,
      })
    }
  }

  absorb(searchTopCombos(
    draws, patternPick, oePick, sumTarget, comboFreq,
    { min: 0, max: 99999 }, typePred, ALL_MATCHES_COLLECT,
    { digitBand: { min: 0, max: 1 } },
  ))

  if (raw.length < target) {
    const digitBands = [
      { min: FREQ_BAND_MIN, max: FREQ_BAND_MAX },
      { min: 0, max: 1 },
    ]
    for (const digitBand of digitBands) {
      while (raw.length < target) {
        const best = searchBestCombo(
          draws, patternPick, oePick, sumTarget, digitBand,
          comboFreq, { min: 0, max: 99999 }, false, typePred, seen,
        )
        if (!best) break
        const key = best.digits.join('')
        seen.add(key)
        const appearCount = comboAppearCount(comboFreq, best.digits)
        raw.push({
          digits: best.digits,
          sum: best.sum,
          score: best.score,
          numberType: best.numberType,
          fromHistory: appearCount > 0,
          comboCount: appearCount,
        })
      }
      if (raw.length >= target) break
    }
  }

  const all = finalizePredictionGroups(raw, ALL_MATCHES_DISPLAY_CAP)
  return all.length >= target ? all : finalizePredictionGroups(raw, target)
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
  excludeKeys = null,
) {
  const flags = patternFlagsFromIdx(patternPick.i)
  const posCands = posCandidates(draws, flags, oePick, digitBand)

  let best = null
  let bestScore = -1
  for (const a of posCands[0]) {
    for (const b of posCands[1]) {
      for (const c of posCands[2]) {
        const digits = [a.d, b.d, c.d]
        if (excludeKeys?.has(digits.join(''))) continue
        if (patternIdxOf({ digits }) !== patternPick.i) continue
        if (!matchesOeCategory(digits, oePick.i)) continue
        if (!passesRecommendTypeFilter(digits)) continue
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

  const hist = searchFromHistoricalDraws(
    draws, patternPick, oePick, sumTarget, comboFreq, countBand, true, typePred,
  )
  if (hist) return { ...hist, countBand }

  const histRelaxed = searchFromHistoricalDraws(
    draws, patternPick, oePick, sumTarget, comboFreq, countBand, false, typePred,
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
        comboFreq, countBand, requireCountBand, typePred,
      )
      if (best) return { ...best, countBand }
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
 * 推荐号：仅组六 · 匹配预测上下形态 · 匹配预测奇偶比 · 和值走势
 * 形态从左到右：百位→十位→个位
 */
export function buildPrediction(draws) {
  if (draws.length < 20) return null
  const n = draws.length
  const lastDraw = draws[n - 1]
  const refDate = new Date(lastDraw.kjdate?.replace(/-/g, '/') ?? new Date())

  const patternPick = pickPatternCategory(draws, refDate)
  const oePick = pickOeCategory(draws, refDate)
  const sumTarget = buildSumTrendTarget(draws)
  const flags = patternFlagsFromIdx(patternPick.i)
  const typePred = predictTypeProbabilities(draws, undefined, refDate)
  const topType = '组六'
  const topTypeProb = Number(typePred.pcts[1].toFixed(1))

  const sumGapArr = Array.from({ length: 28 }, (_, s) => gapOf(draws, (draw) => draw.sum, s))

  const comboFreq = buildCombinationFrequency(draws)
  const countBand = comboCountBandFromFreq(comboFreq)

  let predictionGroups = ensurePredictionGroups(
    draws, patternPick, oePick, sumTarget, comboFreq, countBand, typePred,
  )
  if (!predictionGroups.length) {
    const fallback = buildPrimaryRecommendation(draws, patternPick, oePick, sumTarget, typePred)
      ?? searchBestCombo(
        draws, patternPick, oePick, sumTarget, { min: 0, max: 1 },
        comboFreq, countBand, false, typePred,
      )
    if (!fallback) return null
    const key = fallback.digits.join('')
    predictionGroups = [{
      rank: 1,
      digits: fallback.digits,
      label: key,
      sum: fallback.sum,
      score: Number(((fallback.score ?? 0) * 100).toFixed(1)),
      probability: 100,
      numberType: fallback.numberType,
      fromHistory: !!fallback.fromHistory,
    }]
  }

  function comboToRecommendation(item, rank) {
    const digits = item.digits
    const patIdx = patternIdxOf({ digits })
    const effPat = effectivePatternPick(patternPick, digits)
    const numberType = item.numberType ?? getNumberType(digits)
    return {
      rank,
      digits,
      sum: item.sum,
      pattern: effPat.label,
      patternIdx: patIdx,
      probability: Number(effPat.p.toFixed(1)),
      oddEvenRatio: oePick.label,
      oddEvenProb: Number(oePick.p.toFixed(1)),
      sumTarget: sumTarget.targetSum,
      sumTrendLabel: sumTarget.trendLabel,
      sumBand: `${sumTarget.bandMin}–${sumTarget.bandMax}`,
      sumDev: Number((item.sum - sumTarget.targetSum).toFixed(1)),
      sumGap: sumGapArr[item.sum],
      score: item.score,
      flags: patternFlagsFromIdx(patIdx),
      patternWindow: patternPick.window,
      oeWindow: oePick.window,
      sumWindow: sumTarget.window,
      comboCount: item.comboCount ?? comboAppearCount(comboFreq, digits),
      comboCountRange: `${countBand.filterMin}–${countBand.filterMax}`,
      fromHistory: !!item.fromHistory,
      numberType,
      numberTypeProb: topTypeProb,
    }
  }

  const recommendations = predictionGroups
    .slice(0, RECOMMENDATION_COUNT)
    .map((item, idx) => comboToRecommendation(item, idx + 1))

  const patTop = patternPick.topK ?? topKFromProbs(patternPick.windowProbs, PATTERN_LABELS, 1)
  const twentySevenBets = buildTwentySevenBets(draws, patternPick, oePick)

  return {
    topPattern: patternPick.label,
    topPatternProb: Number(patternPick.p.toFixed(1)),
    topPatterns: patTop.map((t) => ({
      label: t.label,
      prob: Number(t.p.toFixed(1)),
      idx: t.i,
    })),
    topOddEven: oePick.label,
    topOddEvenProb: Number(oePick.p.toFixed(1)),
    topOE: oePick.label,
    topOEProb: Number(oePick.p.toFixed(1)),
    topType,
    topTypeProb,
    typeZu3Prob: Number(typePred.pcts[0].toFixed(1)),
    typeZu6Prob: Number(typePred.pcts[1].toFixed(1)),
    typeSignal: typePred.signalLabel,
    patternWindow: patternPick.window,
    oeWindow: oePick.window,
    sumTarget: sumTarget.targetSum,
    sumTrendLabel: sumTarget.trendLabel,
    sumBand: `${sumTarget.bandMin}–${sumTarget.bandMax}`,
    recentSumAvg: Number(sumTarget.sumMA.toFixed(1)),
    comboCountRange: `${countBand.filterMin}–${countBand.filterMax}`,
    basePeriods: n,
    recommendations,
    predictionGroups,
    twentySevenBets,
    flags,
  }
}
