/**
 * 以「生产构建产物」方式托管 frontend/dist，并把 /api 反代到后端 8090。
 *
 * 为什么需要它：vite dev server（5173）会实时编译源码，**验证不了 dist 产物**。
 * 而 dist 里的 CSS 是打包合并后的，样式顺序/去重可能与 dev 不同
 * （本项目听力关卡锁定态就依赖 `.mode-btn.easy:disabled` 的源码顺序），
 * 所以「dev 正常」不等于「构建版正常」，必须拿 dist 真机渲染一遍。
 *
 * 用法：
 *   node scripts/serve_dist.mjs                 # 默认 http://127.0.0.1:5174
 *   node scripts/serve_dist.mjs --port 5180
 *
 * 零依赖（只用 node 内置模块），不需要 npm install。
 */

import { createServer, request as httpRequest } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

// 本文件在 <repo>/scripts/ 下，dist 在 <repo>/frontend/dist
const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'frontend', 'dist'))
const BACKEND = { host: '127.0.0.1', port: 8090 }

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const PORT = Number(arg('port', 5174))
const HOST = String(arg('host', '127.0.0.1'))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)

  // 1) /api 反代到后端（等价于 vite dev 的 proxy 配置）
  if (url.pathname.startsWith('/api')) {
    const proxyReq = httpRequest(
      {
        host: BACKEND.host,
        port: BACKEND.port,
        path: url.pathname + url.search,
        method: req.method,
        headers: { ...req.headers, host: `${BACKEND.host}:${BACKEND.port}` }
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )
    proxyReq.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`proxy error: ${e.message}（后端 8090 是否在跑？）`)
    })
    req.pipe(proxyReq)
    return
  }

  // 2) 静态文件；找不到就回 index.html（hash 路由，前端自己会解析 #/xxx）
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = normalize(join(ROOT, rel))
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }

  const send = (p) => {
    const ext = extname(p).toLowerCase()
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store'
    })
    createReadStream(p).pipe(res)
  }

  try {
    if (statSync(file).isFile()) return send(file)
  } catch {
    /* 落到 index.html */
  }
  try {
    return send(join(ROOT, 'index.html'))
  } catch {
    res.writeHead(404).end('not found')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[serve_dist] http://${HOST}:${PORT}  root=${ROOT}  /api -> ${BACKEND.host}:${BACKEND.port}`)
})
