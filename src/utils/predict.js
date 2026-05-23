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

export function patternIdxOf(draw) {
  return draw.digits.reduce((acc, d) => acc * 2 + (d >= 5 ? 1 : 0), 0)
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
 * Returns null if draws are too few to be meaningful.
 */
export function buildPrediction(draws) {
  if (draws.length < 20) return null
  const n = draws.length
  const lastDraw = draws[n - 1]
  const refDate = new Date(lastDraw.kjdate?.replace(/-/g, '/') ?? new Date())

  // ── Pattern: 5-way ensemble ────────────────────────────────────────────────
  // Method 1: frequency + gap (normalized to [0,1])
  const freqGapProb = computeProb(
    draws, 8, patternIdxOf,
    (d, i) => gapOf(d, patternIdxOf, i),
    refDate,
  ).map((p) => p / 100)

  // Method 2: per-position independent binary prediction
  const posProb = perPositionPatternProb(draws, refDate)

  // Method 3: first-order Markov
  const mkv1 = markovPatternProb(draws)

  // Method 4: second-order Markov with backoff
  const mkv2 = markov2PatternProb(draws)

  // Method 5: sum-conditional Bayesian prior
  const sumCond = sumConditionalPatternProb(draws)

  // Anti-streak penalty for the last few patterns seen
  const penalty = recentStreakPenalty(draws)

  // Weighted blend
  const W = { freq: 0.22, pos: 0.24, m1: 0.16, m2: 0.16, sum: 0.22 }
  const blended = freqGapProb.map((_, i) =>
    (W.freq * freqGapProb[i] + W.pos * posProb[i] + W.m1 * mkv1[i] +
     W.m2 * mkv2[i] + W.sum * sumCond[i]) * penalty[i]
  )
  const blendSum = blended.reduce((a, b) => a + b, 0)
  const patternProb = blended.map((b) => b / blendSum)

  const patternRanked = patternProb
    .map((p, i) => ({ i, p, label: PATTERN_LABELS[i] }))
    .sort((a, b) => b.p - a.p)
  const topPattern = patternRanked[0]
  const flags = [
    (topPattern.i >> 2) & 1,
    (topPattern.i >> 1) & 1,
    topPattern.i & 1,
  ]

  // ── OE prob ───────────────────────────────────────────────────────────────
  const oeProb = computeProb(
    draws, 4, oeCatOf,
    (d, i) => gapOf(d, oeCatOf, i),
    refDate,
  )
  const oeRanked = oeProb
    .map((p, i) => ({ i, p, label: OE_LABELS[i] }))
    .sort((a, b) => b.p - a.p)

  // ── Recent sum avg ────────────────────────────────────────────────────────
  const RECENT = Math.min(30, n)
  const sumWindow = draws.slice(n - RECENT)
  const recentSumAvg = sumWindow.reduce((s, d) => s + d.sum, 0) / sumWindow.length

  // ── Sum gaps ──────────────────────────────────────────────────────────────
  const sumGap = Array.from({ length: 28 }, (_, s) => gapOf(draws, (draw) => draw.sum, s))
  const maxSumGap = Math.max(...sumGap, 1)

  // ── Digit candidates per position ─────────────────────────────────────────
  const posCandidates = [0, 1, 2].map((pos) => {
    const list = scoredDigitsFor(draws, pos, flags[pos] === 0, RECENT)
    const maxG = Math.max(...list.map((s) => s.gap), 1)
    const maxR = Math.max(...list.map((s) => s.recentFreq), 1)
    return list
      .map((s) => ({
        ...s,
        score: (0.55 * (s.gap / maxG) + 0.45 * (1 - s.recentFreq / maxR)) * Math.pow(0.5, s.streak),
      }))
      .sort((a, b) => b.score - a.score)
  })
  const maxPosScore = Math.max(...posCandidates.flat().map((c) => c.score), 0.001)

  // ── Enumerate combos ──────────────────────────────────────────────────────
  const combos = []
  for (const a of posCandidates[0]) {
    for (const b of posCandidates[1]) {
      for (const c of posCandidates[2]) {
        const digits = [a.d, b.d, c.d]
        const sum = a.d + b.d + c.d
        if (sum > 27) continue
        const coolFit = (a.score + b.score + c.score) / (3 * maxPosScore)
        const sumFit = Math.max(0, 1 - Math.abs(sum - recentSumAvg) / 13.5)
        const sgFit = sumGap[sum] / maxSumGap
        combos.push({
          digits, sum,
          sumGap: sumGap[sum],
          oeCat: oeCatOfDigits(digits),
          score: 0.55 * coolFit + 0.30 * sumFit + 0.15 * sgFit,
        })
      }
    }
  }
  combos.sort((a, b) => b.score - a.score)

  // Bucket by OE and pick top per OE category in rank order
  const combosByOe = [[], [], [], []]
  for (const c of combos) combosByOe[c.oeCat].push(c)

  const topCombos = []
  for (const oe of oeRanked) {
    if (topCombos.length >= 2) break
    const list = combosByOe[oe.i]
    if (list && list.length) {
      topCombos.push({ ...list[0], oeLabel: oe.label, oeProb: oe.p })
    }
  }
  while (topCombos.length < 2 && combos.length) {
    const next = combos.find((c) => !topCombos.some((t) => t.digits.join() === c.digits.join()))
    if (!next) break
    topCombos.push({ ...next, oeLabel: OE_LABELS[next.oeCat], oeProb: oeProb[next.oeCat] })
  }

  return {
    topPattern: topPattern.label,
    topPatternProb: topPattern.p,
    topOE: oeRanked[0].label,
    topOEProb: oeRanked[0].p,
    recommendations: topCombos,
    flags,
    recentSumAvg,
  }
}
