/** 与 SumTrendChart 一致的 y 轴均值参考线（粉色虚线 + 左侧数值标签） */
export function avgMarkLineEntry(values, precision = 1) {
  if (!values?.length) return null
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const val = Number(avg.toFixed(precision))
  return {
    yAxis: val,
    lineStyle: { color: '#f472b6', type: 'dashed', width: 1.5 },
    label: {
      show: true,
      position: 'start',
      distance: 6,
      formatter: String(val),
      color: '#ffffff',
      fontSize: 11,
      fontWeight: 700,
      padding: [2, 6],
      borderRadius: 4,
      backgroundColor: '#f472b6',
    },
  }
}

export function avgMarkLine(values) {
  const entry = avgMarkLineEntry(values)
  if (!entry) return undefined
  return {
    silent: true,
    symbol: ['none', 'none'],
    data: [entry],
  }
}
