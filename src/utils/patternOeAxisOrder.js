import {
  patternIdxOf,
  oeSequenceIdxOf,
  cappedOmiBoost,
  getPatternProbDistribution,
  getOeSequenceProbDistribution,
} from './predict.js'

/** 3 位 Gray 码：相邻刻度仅差一位，走势更平滑 */
export const GRAY_CODE_ORDER = [0, 1, 3, 2, 6, 7, 5, 4]

/** 按下/奇个数分层（0→3 个），层内保持 Gray 邻近 */
export const POPCOUNT_ORDER = [0, 1, 2, 4, 3, 5, 6, 7]

export const ORDER_MODES = [
  { id: 'aligned', label: '共现对齐（推荐）' },
  { id: 'gray', label: 'Gray 码（同序）' },
  { id: 'binary', label: '原始编码' },
  { id: 'popcount', label: '下/奇个数' },
]

export function rankMap(order) {
  return new Map(order.map((idx, rank) => [idx, rank]))
}

export function idxToRank(idx, order) {
  return rankMap(order).get(idx) ?? idx
}

/** digits 顺序：百、十、个（与 PATTERN_LABELS / OE_SEQUENCE_LABELS 左→右一致） */
const POSITION_NAMES = ['百', '十', '个']

function perPositionFromDigits(draw) {
  return POSITION_NAMES.map((name, i) => {
    const d = draw.digits[i]
    const patBit = d >= 5 ? 1 : 0
    const oeBit = d % 2 === 1 ? 1 : 0
    return {
      name,
      pat: patBit ? '下' : '上',
      oe: oeBit ? '奇' : '偶',
      patBit,
      oeBit,
    }
  })
}

/** 百→十→个：各位上下形态与奇偶排序是否同向（同为 0 或同为 1） */
export function positionAgreement(draw) {
  return perPositionFromDigits(draw).map(({ name, pat, oe, patBit, oeBit }) => ({
    name,
    pat,
    oe,
    agree: patBit === oeBit,
  }))
}

/** 百→十→个：上下与奇偶在几位上结构不一致 */
export function structuralHamming(draw) {
  return perPositionFromDigits(draw).filter((p) => p.patBit !== p.oeBit).length
}

/** 8×8 共现矩阵 */
export function buildPatOeJoint(draws) {
  const joint = Array.from({ length: 8 }, () => new Array(8).fill(0))
  for (const draw of draws) {
    joint[patternIdxOf(draw)][oeSequenceIdxOf(draw)]++
  }
  return joint
}

/** 形态轴固定时，按共现权重排列奇偶轴，使高共现组合在图上更接近 */
export function oeOrderAlignedToPat(patOrder, joint) {
  const ranks = rankMap(patOrder)
  return [...Array(8).keys()].sort((a, b) => {
    let sa = 0
    let sb = 0
    for (let p = 0; p < 8; p++) {
      sa += joint[p][a] * ranks.get(p)
      sb += joint[p][b] * ranks.get(p)
    }
    return sa - sb
  })
}

/** 对共现矩阵行列迭代重排（类似热力图 seriation） */
export function seriatePatOeJoint(joint, iterations = 30) {
  let rowOrder = [...Array(8).keys()]
  let colOrder = [...Array(8).keys()]
  for (let t = 0; t < iterations; t++) {
    colOrder = [...Array(8).keys()].sort((a, b) => {
      let sa = 0
      let sb = 0
      for (const r of rowOrder) {
        sa += joint[r][a] * rowOrder.indexOf(r)
        sb += joint[r][b] * rowOrder.indexOf(r)
      }
      return sa - sb
    })
    rowOrder = [...Array(8).keys()].sort((a, b) => {
      let sa = 0
      let sb = 0
      for (const c of colOrder) {
        sa += joint[a][c] * colOrder.indexOf(c)
        sb += joint[b][c] * colOrder.indexOf(c)
      }
      return sa - sb
    })
  }
  return { patOrder: rowOrder, oeOrder: colOrder }
}

export function resolveAxisOrders(draws, mode = 'aligned') {
  const joint = buildPatOeJoint(draws)
  switch (mode) {
    case 'binary':
      return { patOrder: [...Array(8).keys()], oeOrder: [...Array(8).keys()], joint }
    case 'gray':
      return { patOrder: GRAY_CODE_ORDER, oeOrder: GRAY_CODE_ORDER, joint }
    case 'popcount':
      return { patOrder: POPCOUNT_ORDER, oeOrder: POPCOUNT_ORDER, joint }
    case 'aligned':
    default: {
      const patOrder = GRAY_CODE_ORDER
      return { patOrder, oeOrder: oeOrderAlignedToPat(patOrder, joint), joint }
    }
  }
}

/** 图上两线是否同层（Y 轴档位相同） */
export function chartIntersectionAt(draw, patOrder, oeOrder) {
  const pr = idxToRank(patternIdxOf(draw), patOrder)
  const or = idxToRank(oeSequenceIdxOf(draw), oeOrder)
  return pr === or
}

export function rankGapAt(draw, patOrder, oeOrder) {
  const pr = idxToRank(patternIdxOf(draw), patOrder)
  const or = idxToRank(oeSequenceIdxOf(draw), oeOrder)
  return Math.abs(pr - or)
}

/** 同层 (p,o) 组合：形态 idx p 与奇偶 idx o 映射到同一 Y 档位 */
export function sameRankPairs(patOrder, oeOrder) {
  const pairs = []
  for (let p = 0; p < 8; p++) {
    for (let o = 0; o < 8; o++) {
      if (idxToRank(p, patOrder) === idxToRank(o, oeOrder)) pairs.push([p, o])
    }
  }
  return pairs
}

function theoreticalIntersectPct(patOrder, oeOrder) {
  return (sameRankPairs(patOrder, oeOrder).length / 64) * 100
}

function jointIntersectPct(joint, pairs) {
  const total = joint.flat().reduce((a, b) => a + b, 0)
  if (!total) return 0
  let hit = 0
  for (const [p, o] of pairs) hit += joint[p][o]
  return (hit / total) * 100
}

function gapTransitionIntersectPct(gapTransitions, gap) {
  const g = Math.min(gap, 7)
  const row = gapTransitions[g]
  if (!row?.total) return null
  return ((row.hit + 1) / (row.total + 8)) * 100
}

function blendIntersectProb({ jointPct, gapPct, omiPct, marginalPct }, baseline) {
  const parts = []
  const weights = []
  if (jointPct != null) {
    parts.push(jointPct)
    weights.push(0.38)
  }
  if (gapPct != null) {
    parts.push(gapPct)
    weights.push(0.32)
  }
  if (marginalPct != null) {
    parts.push(marginalPct)
    weights.push(0.2)
  }
  parts.push(omiPct ?? baseline)
  weights.push(marginalPct != null ? 0.1 : 0.3)
  const wSum = weights.reduce((a, b) => a + b, 0)
  let v = 0
  for (let i = 0; i < parts.length; i++) v += parts[i] * (weights[i] / wSum)
  return Math.max(2, Math.min(55, v))
}

function marginalIntersectPct(patProbs, oeProbs, pairs) {
  let sum = 0
  for (const [p, o] of pairs) sum += (patProbs[p] / 100) * (oeProbs[o] / 100)
  return sum * 100
}

function refDateFromDraws(draws) {
  const last = draws[draws.length - 1]
  return new Date(last?.kjdate?.replace(/-/g, '/') ?? Date.now())
}

/**
 * 逐期「下期两线同层」预测概率（%），index i 表示对第 i 期的预测（仅用 i 之前历史）
 */
export function buildIntersectionProbSeries(draws, patOrder, oeOrder) {
  const pairs = sameRankPairs(patOrder, oeOrder)
  const baseline = theoreticalIntersectPct(patOrder, oeOrder)
  const joint = Array.from({ length: 8 }, () => new Array(8).fill(0))
  const gapTransitions = Array.from({ length: 8 }, () => ({ hit: 0, total: 0 }))
  const probs = []
  const actualHits = []
  let intersectGap = 0

  for (let i = 0; i < draws.length; i++) {
    const draw = draws[i]
    const hit = chartIntersectionAt(draw, patOrder, oeOrder)
    actualHits.push(hit)

    if (i === 0) {
      probs.push(Number(baseline.toFixed(1)))
    } else {
      const prevGap = rankGapAt(draws[i - 1], patOrder, oeOrder)
      const jointPct = jointIntersectPct(joint, pairs)
      const gapPct = gapTransitionIntersectPct(gapTransitions, prevGap)
      const omiPct = baseline * cappedOmiBoost(intersectGap, Math.max(pairs.length, 4))
      probs.push(
        Number(
          blendIntersectProb({ jointPct, gapPct, omiPct }, baseline).toFixed(1),
        ),
      )
    }

    if (i >= 1) {
      const prevGap = rankGapAt(draws[i - 1], patOrder, oeOrder)
      const g = Math.min(prevGap, 7)
      gapTransitions[g].total++
      if (hit) gapTransitions[g].hit++
    }

    joint[patternIdxOf(draw)][oeSequenceIdxOf(draw)]++
    intersectGap = hit ? 0 : intersectGap + 1
  }

  return { probs, actualHits, baseline, pairs }
}

/** 基于全部历史的下一期两线同层概率（%） */
export function nextIntersectionProbPct(draws, patOrder, oeOrder, joint) {
  if (!draws.length) return 0
  const pairs = sameRankPairs(patOrder, oeOrder)
  const baseline = theoreticalIntersectPct(patOrder, oeOrder)
  const refDate = refDateFromDraws(draws)
  const patProbs = getPatternProbDistribution(draws, refDate)
  const oeProbs = getOeSequenceProbDistribution(draws, refDate)
  const marginalPct = marginalIntersectPct(patProbs, oeProbs, pairs)
  const jointPct = jointIntersectPct(joint, pairs)

  const gapTransitions = Array.from({ length: 8 }, () => ({ hit: 0, total: 0 }))
  for (let i = 1; i < draws.length; i++) {
    const prevGap = rankGapAt(draws[i - 1], patOrder, oeOrder)
    const g = Math.min(prevGap, 7)
    gapTransitions[g].total++
    if (chartIntersectionAt(draws[i], patOrder, oeOrder)) gapTransitions[g].hit++
  }
  const prevGap = rankGapAt(draws[draws.length - 1], patOrder, oeOrder)
  const gapPct = gapTransitionIntersectPct(gapTransitions, prevGap)

  let intersectGap = 0
  for (let i = draws.length - 1; i >= 0; i--) {
    if (chartIntersectionAt(draws[i], patOrder, oeOrder)) break
    intersectGap++
  }
  const omiPct = baseline * cappedOmiBoost(intersectGap, Math.max(pairs.length, 4))

  return Number(
    blendIntersectProb({ jointPct, gapPct, omiPct, marginalPct }, baseline).toFixed(1),
  )
}

/** 高预测概率区间的历史命中率（简易回测摘要） */
export function intersectionBacktestSummary(probs, actualHits, threshold = 25) {
  let highN = 0
  let highHit = 0
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] >= threshold) {
      highN++
      if (actualHits[i]) highHit++
    }
  }
  return {
    threshold,
    highN,
    hitRate: highN ? ((highHit / highN) * 100).toFixed(1) : null,
  }
}

/** 从共现矩阵提取高共现形态-奇偶对（用于图例说明） */
export function topJointPairs(joint, patLabels, oeLabels, limit = 5) {
  const total = joint.flat().reduce((a, b) => a + b, 0) || 1
  const pairs = []
  for (let p = 0; p < 8; p++) {
    for (let o = 0; o < 8; o++) {
      pairs.push({ pat: patLabels[p], oe: oeLabels[o], pct: (joint[p][o] / total) * 100 })
    }
  }
  return pairs.sort((a, b) => b.pct - a.pct).slice(0, limit)
}
