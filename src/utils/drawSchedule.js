/** 福彩3D 每日开奖时间（北京时间） */
export const DRAW_HOUR = 21
export const DRAW_MINUTE = 15
/** 福彩3D 每日销售截止时间（北京时间，官方一般为开奖前约 55 分钟） */
export const SALES_CUTOFF_HOUR = 20
export const SALES_CUTOFF_MINUTE = 20
export const DRAW_TIMEZONE = 'Asia/Shanghai'

function beijingParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: DRAW_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** 将北京时间转为 UTC 毫秒时间戳（中国无夏令时，固定 UTC+8） */
function beijingToUtcMs({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  return Date.UTC(year, month - 1, day, hour - 8, minute, second)
}

/** 获取下一次开奖的 UTC 毫秒时间戳 */
export function getNextDrawTimestamp(now = Date.now()) {
  const bj = beijingParts(new Date(now))
  const drawSeconds = DRAW_HOUR * 3600 + DRAW_MINUTE * 60
  const nowSeconds = bj.hour * 3600 + bj.minute * 60 + bj.second

  if (nowSeconds < drawSeconds) {
    return beijingToUtcMs({ ...bj, hour: DRAW_HOUR, minute: DRAW_MINUTE, second: 0 })
  }

  const tomorrow = new Date(Date.UTC(bj.year, bj.month - 1, bj.day + 1))
  const next = beijingParts(tomorrow)
  return beijingToUtcMs({ ...next, hour: DRAW_HOUR, minute: DRAW_MINUTE, second: 0 })
}

/** 当日销售截止的 UTC 毫秒时间戳 */
export function getTodaySalesCutoffTimestamp(now = Date.now()) {
  const bj = beijingParts(new Date(now))
  return beijingToUtcMs({
    ...bj,
    hour: SALES_CUTOFF_HOUR,
    minute: SALES_CUTOFF_MINUTE,
    second: 0,
  })
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function formatDrawDateTime(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: DRAW_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}
