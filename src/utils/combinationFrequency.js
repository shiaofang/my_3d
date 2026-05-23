/** 000–999 组合出现次数（与 Combination3DChart / store 一致） */
export function buildCombinationFrequency(draws) {
  const freq = new Array(1000).fill(0)
  for (const draw of draws) {
    const num = draw.digits[0] * 100 + draw.digits[1] * 10 + draw.digits[2]
    freq[num]++
  }
  return freq
}

export function comboNumFromDigits(digits) {
  return digits[0] * 100 + digits[1] * 10 + digits[2]
}

export function comboAppearCount(freq, digits) {
  return freq[comboNumFromDigits(digits)] ?? 0
}

/**
 * 3D 图「次数范围」：在 [最低次数, 最高次数] 之间取中间 1/3～2/3
 * 最低次数只统计「出现过」的组合（忽略 0 次），与界面「低 1 · 高 18」一致
 * 例：低 1、高 18 → 约 6～13 次
 */
export function comboCountBandFromFreq(freq) {
  const nonZero = freq.filter((c) => c > 0)
  const min = nonZero.length ? Math.min(...nonZero) : 0
  const max = Math.max(...freq, 1)
  const span = max - min
  return {
    dataMin: min,
    dataMax: max,
    filterMin: min + Math.floor(span / 3),
    filterMax: min + Math.ceil((2 * span) / 3),
  }
}

export function isComboCountInBand(freq, digits, band) {
  const count = comboAppearCount(freq, digits)
  return count >= band.filterMin && count <= band.filterMax
}

/** 组合次数越接近次数区间中段得分越高 */
export function comboCountBandFit(freq, digits, band) {
  const count = comboAppearCount(freq, digits)
  if (!count) return 0
  if (count >= band.filterMin && count <= band.filterMax) return 1
  const mid = (band.filterMin + band.filterMax) / 2
  const half = Math.max((band.filterMax - band.filterMin) / 2, 1)
  return Math.max(0, 1 - Math.abs(count - mid) / half)
}
