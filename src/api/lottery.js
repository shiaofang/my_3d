import axios from 'axios'

const BASE_URL = import.meta.env.DEV
  ? '/api/sd/getTbList'
  : 'https://tb.tuganjue.com/api/sd/getTbList'

export async function fetchLotteryList({
  page = 1,
  limit = 300,
  orderby = 'asc',
  startIssue = 0,
  endIssue = 0,
  week = 'all',
} = {}) {
  const { data } = await axios.get(BASE_URL, {
    params: {
      action: 'kjfb',
      page,
      limit,
      orderby,
      start_issue: startIssue,
      end_issue: endIssue,
      week,
    },
  })

  if (data.code !== 0) {
    throw new Error(data.msg || '请求失败')
  }

  return data.data?.data ?? []
}
