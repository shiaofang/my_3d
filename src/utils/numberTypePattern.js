/** 组三/组六：多窗口检测「每隔 N 期组六出组三」的间断规律 */

export const ANALYSIS_DAYS = 24
export const WINDOW_DAYS_OPTIONS = [24, 32]
/** 按最近开奖期数再扫一遍（约 1 个月） */
export const WINDOW_DRAW_OPTIONS = [24, 32]

const LABELS = ['组三', '组六']

function cutoffDate(days, refDate = new Date()) {
  const cutoff = new Date(refDate)
  cutoff.setDate(cutoff.getDate() - days)
  cutoff.setHours(0, 0, 0, 0)
  return cutoff
}

/** 近 N 天内非豹子形态序列（时间正序） */
export function buildTypeSequence(draws, days = ANALYSIS_DAYS, refDate = new Date()) {
  const cutoff = cutoffDate(days, refDate)
  const seq = []
  let leopardCount = 0
  for (const draw of draws) {
    const d = new Date(draw.kjdate?.replace(/-/g, '/') ?? '')
    if (isNaN(d.getTime()) || d < cutoff) continue
    if (draw.type === '豹子') {
      leopardCount++
      continue
    }
    if (draw.type === '组三' || draw.type === '组六') seq.push(draw.type)
  }
  return { seq, leopardCount, windowLabel: `近 ${days} 天` }
}

/** 最近 count 期非豹子形态（时间正序） */
export function buildTypeSequenceByCount(draws, count = 32, refDate = new Date()) {
  const cutoff = cutoffDate(9999, refDate)
  const buf = []
  let leopardCount = 0
  for (const draw of draws) {
    const d = new Date(draw.kjdate?.replace(/-/g, '/') ?? '')
    if (isNaN(d.getTime()) || d >= cutoff) {
      if (draw.type === '豹子') leopardCount++
      else if (draw.type === '组三' || draw.type === '组六') buf.push(draw.type)
    }
  }
  const seq = buf.slice(-count)
  return { seq, leopardCount, windowLabel: `近 ${count} 期` }
}

/** 相邻组三之间间隔了多少期组六 */
export function gapsBetweenZu3(seq) {
  const gaps = []
  let zu6Run = 0
  for (const t of seq) {
    if (t === '组三') {
      gaps.push(zu6Run)
      zu6Run = 0
    } else {
      zu6Run++
    }
  }
  return { gaps, trailingZu6: zu6Run }
}

/**
 * 在间隔 3–6 期中找最吻合的「组六→组三」周期
 */
export function detectIntermittentPattern(gaps, windowLabel = '') {
  const usable = gaps.filter((g) => g >= 2 && g <= 8)
  if (usable.length < 2) {
    return {
      active: false,
      interval: null,
      regularity: 0,
      score: 0,
      sampleGaps: usable.length,
      hint: '样本不足，暂无明显组三间隔规律',
      windowLabel,
    }
  }

  let best = null
  for (let interval = 3; interval <= 6; interval++) {
    const hit = usable.filter((g) => Math.abs(g - interval) <= 1).length
    const regularity = hit / usable.length
    const score = regularity * Math.min(1, usable.length / 3.5)
    if (!best || score > best.score) {
      best = { interval, regularity, score, hit, sampleGaps: usable.length }
    }
  }

  const active = best.regularity >= 0.4 && best.score >= 0.22
  const prefix = windowLabel ? `${windowLabel}：` : ''

  let hint
  if (active) {
    hint =
      `${prefix}组三间隔出现，约每 <b>${best.interval}</b> 期组六出 1 次组三` +
      `（${best.hit}/${usable.length} 次吻合，${(best.regularity * 100).toFixed(0)}%）`
  } else {
    const avgGap =
      usable.reduce((s, g) => s + g, 0) / usable.length
    hint =
      `${prefix}组三间隔不稳定（平均约 ${avgGap.toFixed(1)} 期组六），` +
      `未形成清晰的 4–5 期规律`
  }

  return {
    active,
    interval: active ? best.interval : null,
    regularity: best.regularity,
    score: best.score,
    sampleGaps: usable.length,
    hint,
    windowLabel,
  }
}

/** 在 24 天 / 32 天 / 近 24·32 期中选规律得分最高的窗口 */
export function pickBestPatternWindow(draws, refDate = new Date()) {
  const candidates = []

  for (const days of WINDOW_DAYS_OPTIONS) {
    const { seq, leopardCount, windowLabel } = buildTypeSequence(draws, days, refDate)
    const { gaps, trailingZu6 } = gapsBetweenZu3(seq)
    const pattern = detectIntermittentPattern(gaps, windowLabel)
    candidates.push({ days, seq, leopardCount, gaps, trailingZu6, pattern, windowLabel, score: pattern.score })
  }

  for (const count of WINDOW_DRAW_OPTIONS) {
    const { seq, leopardCount, windowLabel } = buildTypeSequenceByCount(draws, count, refDate)
    const { gaps, trailingZu6 } = gapsBetweenZu3(seq)
    const pattern = detectIntermittentPattern(gaps, windowLabel)
    candidates.push({
      days: null,
      drawCount: count,
      seq,
      leopardCount,
      gaps,
      trailingZu6,
      pattern,
      windowLabel,
      score: pattern.score,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  const fallback = buildTypeSequence(draws, ANALYSIS_DAYS, refDate)
  const fbGaps = gapsBetweenZu3(fallback.seq)

  if (!best || best.score <= 0) {
    return {
      ...fallback,
      ...fbGaps,
      pattern: detectIntermittentPattern(fbGaps.gaps, fallback.windowLabel),
      windowLabel: fallback.windowLabel,
      days: ANALYSIS_DAYS,
      score: 0,
    }
  }

  return {
    seq: best.seq,
    leopardCount: best.leopardCount,
    gaps: best.gaps,
    trailingZu6: best.trailingZu6,
    pattern: best.pattern,
    windowLabel: best.windowLabel,
    days: best.days ?? ANALYSIS_DAYS,
    drawCount: best.drawCount ?? null,
    score: best.score,
  }
}

/** 历史最大连续组三（全量，非豹子） */
export function maxConsecutiveZu3(draws) {
  let max = 0
  let cur = 0
  for (const draw of draws) {
    if (draw.type === '豹子') continue
    if (draw.type === '组三') {
      cur++
      max = Math.max(max, cur)
    } else {
      cur = 0
    }
  }
  return max
}

function predictFromContext(ctx, draws) {
  const { seq, pattern, lastType, trailingZu6, windowLabel } = ctx
  const counts = { 组三: 0, 组六: 0 }
  for (const t of seq) counts[t]++

  const BASE_ZU3 = 27
  const BASE_ZU6 = 73
  const maxZu3Run = maxConsecutiveZu3(draws)

  let zu3Pct = BASE_ZU3
  let signal = 'baseline'
  let signalLabel = '组六偏多，未见清晰间隔规律'
  let detail = pattern.hint.replace(/<[^>]+>/g, '')

  if (lastType === '组三') {
    zu3Pct = 8
    signal = 'after-zu3'
    signalLabel = '上期组三 · 连续组三极少'
    detail = `历史最多连续 ${maxZu3Run} 期组三；${windowLabel}内规律仍以下期组六为主`
  } else if (pattern.active && pattern.interval != null) {
    const n = pattern.interval
    const pos = trailingZu6
    const peakLo = n - 1
    const peakHi = n + 1
    const overdueCap = n * 2

    if (pos >= peakLo && pos <= peakHi) {
      const closeness = 1 - Math.min(1, Math.abs(pos - n) / 2)
      zu3Pct = 55 + closeness * 32
      signal = 'cycle-peak'
      signalLabel = `${windowLabel} · 第 ${pos} 期组六（周期≈${n}）`
      detail = '处于组三高发窗口，明天组三概率高，可高于组六'
    } else if (pos > peakHi && pos <= overdueCap) {
      const span = Math.max(1, overdueCap - peakHi)
      const t = (pos - peakHi) / span
      zu3Pct = 65 - t * 35
      signal = 'overdue-mild'
      signalLabel = `${windowLabel} · 略超周期 ${pos} 期组六（惯常≈${n}）`
      detail = '刚过惯常间隔，组三仍有机会，但概率逐步回落'
    } else if (pos > overdueCap) {
      const excess = pos - overdueCap
      zu3Pct = Math.max(10, 28 - excess * 3.5)
      signal = 'pattern-broken'
      signalLabel = `${windowLabel} · 已 ${pos} 期组六（超周期 2 倍+）`
      detail = `惯常约 ${n} 期出组三，过久未出则规律可能失效，组三概率动态下调`
    } else if (pos <= 1) {
      zu3Pct = 18
      signal = 'cycle-early'
      signalLabel = `${windowLabel} · 周期初段（${pos} 期组六）`
      detail = '刚出组三不久或周期刚开始，组六仍占优'
    } else {
      zu3Pct = 18 + ((pos - 1) / Math.max(1, peakLo - 1)) * 34
      signal = 'cycle-mid'
      signalLabel = `${windowLabel} · 周期 ${pos}/${n} 期组六`
      detail = '向组三高发窗口靠近，组三概率逐步升高'
    }
  } else if (trailingZu6 >= 5) {
    const cap = 10
    if (trailingZu6 > cap) {
      zu3Pct = Math.max(12, 32 - (trailingZu6 - cap) * 2.5)
      signal = 'long-zu6-fade'
      signalLabel = `连续 ${trailingZu6} 期组六`
      detail = '长期未出组三且无清晰间隔规律，组三预期下调'
    } else {
      zu3Pct = Math.min(42, 20 + trailingZu6 * 4)
      signal = 'long-zu6'
      signalLabel = `连续 ${trailingZu6} 期组六`
      detail = '无稳定间隔规律，但组三遗漏偏长'
    }
  } else {
    const ratio = counts['组六'] / Math.max(1, counts['组三'])
    zu3Pct = ratio > 3.2 ? 22 : ratio < 2.2 ? 32 : 27
    signalLabel = `${windowLabel} · 组六/组三约 ${ratio.toFixed(1)}:1`
  }

  zu3Pct = Math.min(82, Math.max(6, zu3Pct))
  return {
    pcts: [zu3Pct, 100 - zu3Pct],
    signal,
    signalLabel,
    detail,
    counts,
    maxZu3Run,
  }
}

/**
 * 下期组三/组六预测（%）
 * 自动在 24 天、32 天、近 24/32 期中选取间断规律最明显的窗口
 */
export function predictTypeProbabilities(draws, _days, refDate = new Date()) {
  const THEOR_ZU3 = (270 / 990) * 100
  const THEOR_ZU6 = (720 / 990) * 100

  const ctx = pickBestPatternWindow(draws, refDate)
  const { seq, leopardCount, pattern, gaps, trailingZu6, windowLabel, days, drawCount } = ctx
  const lastType = seq.length ? seq[seq.length - 1] : null

  if (!seq.length) {
    return {
      pcts: [THEOR_ZU3, THEOR_ZU6],
      signal: 'none',
      signalLabel: '数据不足',
      ...emptyMeta(),
      seq,
      leopardCount,
      counts: { 组三: 0, 组六: 0 },
    }
  }

  const pred = predictFromContext(
    { seq, pattern, lastType, trailingZu6, windowLabel },
    draws,
  )

  return {
    ...pred,
    pattern,
    lastType,
    trailingZu6,
    gaps,
    seq,
    leopardCount,
    days: drawCount ? null : days,
    drawCount,
    windowLabel,
    patternScore: ctx.score,
    theor: [THEOR_ZU3, THEOR_ZU6],
  }
}

function emptyMeta() {
  return {
    pattern: { active: false, interval: null, regularity: 0, hint: '' },
    lastType: null,
    trailingZu6: 0,
    gaps: [],
    maxZu3Run: 0,
    days: ANALYSIS_DAYS,
    windowLabel: '',
    detail: '',
    patternScore: 0,
    theor: [27.3, 72.7],
  }
}

export { LABELS }
