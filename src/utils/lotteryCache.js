const DB_NAME = 'fc3d-lottery'
const DB_VERSION = 1
const STORE_NAME = 'draws'
const CACHE_KEY = 'main'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

function runTransaction(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        fn(store, resolve, reject)
        tx.oncomplete = () => db.close()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

/** @returns {Promise<{ records: object[], updatedAt: number, count: number } | null>} */
export async function readCache() {
  try {
    return await runTransaction('readonly', (store, resolve, reject) => {
      const req = store.get(CACHE_KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

/** @param {object[]} records raw API records, chronological (oldest → newest) */
export async function writeCache(records) {
  try {
    await runTransaction('readwrite', (store, resolve, reject) => {
      const payload = {
        records,
        updatedAt: Date.now(),
        count: records.length,
        latestIssue: records[records.length - 1]?.issue ?? null,
        oldestIssue: records[0]?.issue ?? null,
      }
      const req = store.put(payload, CACHE_KEY)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    // IndexedDB unavailable (private mode, quota, etc.) — silently skip persistence
  }
}

/** Merge by issue, return chronological order (oldest → newest). */
export function mergeRecords(existing, incoming) {
  const map = new Map()
  for (const r of existing) map.set(String(r.issue), r)
  for (const r of incoming) map.set(String(r.issue), r)
  return [...map.values()].sort((a, b) => Number(a.issue) - Number(b.issue))
}
