import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(__dirname, 'data')
const CACHE_FILE = path.join(CACHE_DIR, 'lottery-cache.json')
/** Copied on each save so `vite build` ships the latest snapshot. */
const PUBLIC_CACHE_FILE = path.join(__dirname, 'public', 'lottery-cache.json')
const API_PATH = '/api/local-lottery'

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function lotteryCacheMiddleware(req, res, next) {
  if (!req.url?.startsWith(API_PATH)) {
    next()
    return
  }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (!fs.existsSync(CACHE_FILE)) {
      res.statusCode = 200
      res.end('null')
      return
    }
    res.end(fs.readFileSync(CACHE_FILE, 'utf8'))
    return
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    readBody(req)
      .then((body) => {
        fs.mkdirSync(CACHE_DIR, { recursive: true })
        const parsed = JSON.parse(body)
        const json = JSON.stringify(parsed, null, 2)
        fs.writeFileSync(CACHE_FILE, json, 'utf8')
        fs.mkdirSync(path.dirname(PUBLIC_CACHE_FILE), { recursive: true })
        fs.writeFileSync(PUBLIC_CACHE_FILE, json, 'utf8')
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: true, count: parsed.count ?? parsed.records?.length ?? 0 }))
      })
      .catch((err) => {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: err.message }))
      })
    return
  }

  res.statusCode = 405
  res.end()
}

function attachMiddleware(server) {
  server.middlewares.use(lotteryCacheMiddleware)
}

/** Persist lottery API data to data/lottery-cache.json (dev / preview only). */
export function lotteryCachePlugin() {
  return {
    name: 'lottery-cache',
    configureServer: attachMiddleware,
    configurePreviewServer: attachMiddleware,
  }
}
