import axios from 'axios'

const BASE_URL = import.meta.env.DEV
  ? '/api/sd/getTbList'
  : 'https://tb.tuganjue.com/api/sd/getTbList'

export const PAGE_SIZE = 300

export async function fetchPage({ page, limit, orderby, startIssue, endIssue, week }) {
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

/** Fetch the newest batch (chronological). */
export async function fetchLatestBatch(limit = PAGE_SIZE) {
  const batch = await fetchPage({ page: 1, limit, orderby: 'desc' })
  return batch.reverse()
}

/** Fetch older records beyond what is already cached. */
export async function fetchOlderRecords({ alreadyHave, need }) {
  if (need <= 0) return []
  const startPage = Math.ceil(alreadyHave / PAGE_SIZE) + 1
  const pages = Math.ceil(need / PAGE_SIZE)
  const requests = Array.from({ length: pages }, (_, i) =>
    fetchPage({
      page: startPage + i,
      limit: PAGE_SIZE,
      orderby: 'desc',
    }),
  )
  const results = await Promise.all(requests)
  return results.flat().slice(0, need).reverse()
}
