export const TRANSITION_POSITIONS = [
  { key: 0, label: '百位', color: '#fbbf24' },
  { key: 1, label: '十位', color: '#22d3ee' },
  { key: 2, label: '个位', color: '#a78bfa' },
]

const OMI_WEIGHT = 0.6
const EPS = 0.05
const THEOR_PCT = 10

export function formatTransitionPct(value) {
  return Number(value).toFixed(2)
}

/** 概率条宽度：按该位置最高概率等比缩放（与图表纵轴一致） */
export function transitionBarWidth(pct, percents) {
  const max = Math.max(...percents, THEOR_PCT, 0.01)
  return `${Math.min(100, (pct / max) * 100)}%`
}

/** 各数字在该位置的当前遗漏期数 */
export function computeOmissions(draws, pos) {
  const gaps = new Array(10).fill(0)
  if (!draws.length) return gaps
  for (let d = 0; d < 10; d++) {
    let gap = 0
    for (let j = draws.length - 1; j >= 0; j--) {
      if (draws[j]?.digits?.[pos] === d) break
      gap++
    }
    gaps[d] = gap
  }
  return gaps
}

/**
 * 转移概率 + 遗漏加权（与 TransitionPanel 一致）
 */
export function computeTransitionProbs(draws, pos, fromDigit) {
  const counts = new Array(10).fill(0)
  let sampleSize = 0

  for (let i = 0; i < draws.length - 1; i++) {
    const cur = draws[i]?.digits?.[pos]
    if (cur !== fromDigit) continue
    const nxt = draws[i + 1]?.digits?.[pos]
    if (typeof nxt !== 'number') continue
    counts[nxt]++
    sampleSize++
  }

  if (!sampleSize) {
    return {
      counts,
      sampleSize: 0,
      rawPercents: new Array(10).fill(0),
      percents: new Array(10).fill(0),
      omissions: computeOmissions(draws, pos),
      topDigit: null,
    }
  }

  const rawPercents = counts.map((c) => (c / sampleSize) * 100)
  const omissions = computeOmissions(draws, pos)
  const maxOmi = Math.max(...omissions, 1)
  const raws = counts.map((c, i) => {
    const base = Math.max(EPS, c)
    const omiBoost = 1 + OMI_WEIGHT * (omissions[i] / maxOmi)
    return base * omiBoost
  })
  const sumRaw = raws.reduce((a, b) => a + b, 0)
  const percents = raws.map((r) => (sumRaw > 0 ? (r / sumRaw) * 100 : 0))
  const topDigit = percents.reduce((best, p, i) => {
    if (p > percents[best] + 1e-9) return i
    if (Math.abs(p - percents[best]) < 1e-9 && counts[i] > counts[best]) return i
    return best
  }, 0)

  return { counts, sampleSize, rawPercents, percents, omissions, topDigit }
}

/** 根据本期三位号码，计算各位置下一期 0–9 的综合概率 */
export function computeAllPositionTransitions(draws, currentDigits) {
  if (!currentDigits || currentDigits.length !== 3) return null
  return TRANSITION_POSITIONS.map((pos) => ({
    ...pos,
    fromDigit: currentDigits[pos.key],
    ...computeTransitionProbs(draws, pos.key, currentDigits[pos.key]),
  }))
}

/** 在完整历史中定位某期，截取截至该期（含）的样本 */
export function sliceDrawsThroughIssue(draws, issue) {
  const idx = draws.findIndex((d) => String(d.issue) === String(issue))
  return idx >= 0 ? draws.slice(0, idx + 1) : draws
}
