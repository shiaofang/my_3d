import { computed, ref, watch } from 'vue'

/** 图表底部范围条：短日期标签，避免缩略图期号叠在一起 */
export function shortChartDate(dateStr) {
  if (!dateStr) return ''
  const s = String(dateStr).trim()
  const m = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (m) {
    return `${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  if (s.length >= 10) return s.slice(5, 10).replace(/\//g, '-')
  return s
}

export function createIssueDateMap(issues, dates) {
  const map = new Map()
  for (let i = 0; i < issues.length; i++) {
    if (dates[i]) map.set(String(issues[i]), dates[i])
  }
  return map
}

export function defaultZoomStart(issueCount) {
  return issueCount ? Math.max(0, 100 - (80 / issueCount) * 100) : 0
}

export function indicesFromZoom(len, start = 0, end = 100) {
  if (!len) return { startIdx: 0, endIdx: 0 }
  const toIdx = (pct) => Math.min(len - 1, Math.max(0, Math.round((pct / 100) * (len - 1))))
  const startIdx = toIdx(start)
  const endIdx = Math.max(startIdx, toIdx(end))
  return { startIdx, endIdx }
}

export function rangeLabelsFromIndices(issues, dates, startIdx, endIdx) {
  const issueToDate = createIssueDateMap(issues, dates)
  const fmt = (i) => {
    const iss = issues[i]
    const date = dates[i] || issueToDate.get(String(iss))
    return date ? shortChartDate(date) : String(iss ?? '')
  }
  return { start: fmt(startIdx), end: fmt(endIdx) }
}

/**
 * 底部范围条日期：固定在图表左右两侧，不随滑块手柄移动，避免被手柄遮挡
 */
export function useZoomRangeLabels(getIssues, getDates, getCount) {
  const zoomStart = ref(defaultZoomStart(getCount()))
  const zoomEnd = ref(100)

  watch(
    () => getCount(),
    (n) => {
      zoomStart.value = defaultZoomStart(n)
      zoomEnd.value = 100
    },
  )

  const rangeLabels = computed(() => {
    const issues = getIssues()
    const dates = getDates()
    const { startIdx, endIdx } = indicesFromZoom(issues.length, zoomStart.value, zoomEnd.value)
    return rangeLabelsFromIndices(issues, dates, startIdx, endIdx)
  })

  function onDataZoom(e) {
    const p = e?.batch?.[0] ?? e
    if (p?.start != null) zoomStart.value = p.start
    if (p?.end != null) zoomEnd.value = p.end
  }

  return { zoomStart, zoomEnd, rangeLabels, onDataZoom }
}

/**
 * @param {{ start?: number, end?: number, issues?: string[], dates?: string[], xAxisIndex?: number | number[], color?: string, fillerColor?: string }} opts
 */
export function sliderDataZoom(opts = {}) {
  const {
    start = 0,
    end = 100,
    xAxisIndex,
    color = '#60a5fa',
    fillerColor = 'rgba(96, 165, 250, 0.15)',
    insetLeft = 8,
    insetRight = 52,
  } = opts

  return {
    type: 'slider',
    ...(xAxisIndex != null ? { xAxisIndex } : {}),
    start,
    end,
    left: insetLeft,
    right: insetRight,
    height: 24,
    bottom: 10,
    borderColor: '#475569',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    fillerColor,
    handleSize: '80%',
    handleStyle: { color, borderColor: '#e2e8f0', borderWidth: 1 },
    moveHandleSize: 6,
    showDataShadow: false,
    showDetail: true,
    labelFormatter: () => '',
    textStyle: {
      color: '#f1f5f9',
      fontSize: 11,
      fontWeight: 600,
    },
    detailFormatter: (value, valueStr) => String(valueStr ?? value),
  }
}

/** inside + slider，默认展示近 80 期 */
export function chartDataZoomPair({
  issueCount,
  start,
  end = 100,
  xAxisIndex,
  color,
  fillerColor,
  insetLeft,
  insetRight,
}) {
  const zoomStart = start ?? defaultZoomStart(issueCount)
  const sliderOpts = { start: zoomStart, end, xAxisIndex, color, fillerColor, insetLeft, insetRight }
  return [
    {
      type: 'inside',
      start: zoomStart,
      end,
      ...(xAxisIndex != null ? { xAxisIndex } : {}),
    },
    sliderDataZoom(sliderOpts),
  ]
}
