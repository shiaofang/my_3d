/** Strip HTML tags from winnum and return digit array */
export function parseWinnum(winnum) {
  const cleaned = String(winnum).replace(/<[^>]+>/g, '').trim()
  return cleaned.split(/\s+/).map(Number).filter((n) => !Number.isNaN(n))
}

/** Plain text display for winnum */
export function formatWinnum(winnum) {
  return parseWinnum(winnum).join(' ')
}

/** Detect duplicate digits (组三) */
export function getNumberType(digits) {
  const unique = new Set(digits).size
  if (unique === 1) return '豹子'
  if (unique === 2) return '组三'
  return '组六'
}

/** Sum of three digits */
export function calcSum(digits) {
  return digits.reduce((a, b) => a + b, 0)
}

/** Span (max - min) */
export function calcSpan(digits) {
  return Math.max(...digits) - Math.min(...digits)
}
