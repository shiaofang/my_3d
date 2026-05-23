import axios from 'axios'

const BASE_URL = import.meta.env.DEV
  ? '/api/sd/getTbList'
  : 'https://tb.tuganjue.com/api/sd/getTbList'

const PAGE_SIZE = 300

async function fetchPage({ page, limit, orderby, startIssue, endIssue, week }) {
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
  if (data.code !== 0) throw new Error(data.msg || '请求失败')
  return data.data?.data ?? []
}

/**
 * Fetch the latest `limit` draws in chronological order (oldest → newest).
 * Uses `orderby=desc` + multi-page to support any limit.
 */
export async function fetchLotteryList({
  limit = 300,
  startIssue = 0,
  endIssue = 0,
  week = 'all',
} = {}) {
  const pages = Math.ceil(limit / PAGE_SIZE)
  const requests = Array.from({ length: pages }, (_, i) =>
    fetchPage({
      page: i + 1,
      limit: PAGE_SIZE,
      orderby: 'desc',
      startIssue,
      endIssue,
      week,
    }),
  )
  const results = await Promise.all(requests)
  return results.flat().slice(0, limit).reverse()
}
