/**
 * 深色主题「漏白扫描器」（零依赖 CDP）
 *
 * 深色主题最常见的缺陷不是"颜色不好看"，而是某个控件漏用了 token，
 * 在深色页面上留下一块白底 —— 这类问题 DOM 断言很难覆盖，
 * 逐个页面肉眼找又容易漏。
 *
 * 这里的做法：把主题强制切成 dark，然后遍历页面上所有元素，
 * 报告"背景明显偏亮 + 面积够大"的盒子。白底元素在深色主题里
 * 几乎不可能是设计本意，命中即是缺陷（少数如 `.hero` 渐变横幅、
 * 彩色徽标属于已知例外，用白名单排除）。
 *
 * 用法：node scripts/dark_leak_scan.mjs [路由1,路由2,...]
 *   默认扫描：/home,/vocab,/grammar,/listen,/game,/stats,/error-book,/ai,/profile,
 *            /quiz/vocab/1,/lesson/1,/listen/1/EASY
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9334
const BASE = 'http://127.0.0.1:5173'

const ROUTES = (process.argv[2] || [
  '/home',
  '/vocab',
  '/grammar',
  '/listen',
  '/game',
  '/stats',
  '/error-book',
  '/ai',
  '/profile',
  '/quiz/vocab/1',
  '/lesson/1',
  '/listen/1/EASY'
].join(',')).split(',')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id != null) {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
      } else if (msg.method) {
        ;(this.events.get(msg.method) || []).forEach((fn) => fn(msg.params))
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时: ${method}`))
        }
      }, 30000)
    })
  }
  once(method) {
    return new Promise((resolve) => {
      const fn = (p) => {
        this.events.set(method, (this.events.get(method) || []).filter((f) => f !== fn))
        resolve(p)
      }
      const list = this.events.get(method) || []
      list.push(fn)
      this.events.set(method, list)
    })
  }
  async eval(fnBody) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${fnBody} })()`,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails) {
      throw new Error('页面执行异常: ' + (r.exceptionDetails.exception?.description || ''))
    }
    return r.result.value
  }
  async goto(url, waitMs = 1500) {
    // 见 theme_check.mjs 的同名方法：hash 路由下只改 hash 不会重新加载文档，
    // 加一个变化的 query 参数强制整页加载，否则内联的主题脚本不会重跑。
    this._nav = (this._nav || 0) + 1
    const [head, hash] = url.split('#')
    const real = `${head}${head.includes('?') ? '&' : '?'}_nav=${this._nav}${hash ? '#' + hash : ''}`
    const loaded = this.once('Page.loadEventFired')
    await this.send('Page.navigate', { url: real })
    await Promise.race([loaded, sleep(8000)])
    await sleep(waitMs)
  }
}

const SCAN = `
  const out = []
  const all = document.querySelectorAll('body *')
  for (const el of all) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const bg = cs.backgroundColor
    const m = bg.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s]+([\\d.]+))?/)
    if (!m) continue
    const [r, g, b] = [+m[1], +m[2], +m[3]]
    const a = m[4] === undefined ? 1 : +m[4]
    if (a < 0.5) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 14 || rect.height < 10) continue
    if (rect.width * rect.height < 320) continue
    // 相对亮度（0=黑 1=白）
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    if (L < 0.45) continue
    // 已知例外：白色是设计本意的地方
    if (el.closest('.hero, .level-badge, .avatar, .side-brand-logo, .judge-ico, .review-ico, .side-badge')) continue
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 70),
      bg,
      area: Math.round(rect.width * rect.height),
      lum: +L.toFixed(3),
      text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 30)
    })
  }
  // 同一块白底可能父子都命中，按面积降序、去重相近的
  out.sort((a, b) => b.area - a.area)
  const seen = []
  for (const o of out) {
    if (seen.some((s) => s.cls === o.cls && s.text === o.text)) continue
    seen.push(o)
    if (seen.length >= 12) break
  }
  return { theme: document.documentElement.dataset.theme, leaks: seen, total: out.length }
`

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'eq-leak-'))
  console.log('启动 Chrome（headless）…\n')
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1440,900',
      '--hide-scrollbars',
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  let target = null
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250)
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    } catch (e) {}
  }
  if (!target) {
    chrome.kill()
    throw new Error('Chrome 调试端口未就绪')
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  })

  let totalLeaks = 0
  try {
    // 登录 + 强制深色（后台需换用管理员账号，见脚本头部的 EQ_USER / EQ_PASS）
    const USER = process.env.EQ_USER || 'student'
    const PASS = process.env.EQ_PASS || (process.env.EQ_PASS || '')
    await cdp.goto(`${BASE}/#/login`, 600)
    await cdp.eval(`
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '${USER}', password: '${PASS}' })
      })
      const j = await r.json()
      const d = j.data || j
      localStorage.setItem('eq_token', d.token)
      localStorage.setItem('eq_user', JSON.stringify({
        userId: d.userId, username: d.username, nickname: d.nickname,
        role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
      }))
      localStorage.setItem('eq_theme', 'dark')
      return { code: j.code, role: d.role }
    `)

    for (const route of ROUTES) {
      await cdp.goto(`${BASE}/#${route}`, 1800)
      const res = await cdp.eval(SCAN)
      const okRoute = await cdp.eval(`return location.hash`)
      console.log(`── ${route}   (实际 hash: ${okRoute}, data-theme: ${res.theme})`)
      if (res.theme !== 'dark') {
        console.log('   ⚠ 主题不是 dark，跳过')
        continue
      }
      if (!res.leaks.length) {
        console.log('   ✓ 未发现漏白')
      } else {
        totalLeaks += res.leaks.length
        for (const l of res.leaks) {
          console.log(
            `   ⚠ ${l.bg}  L=${l.lum}  ${l.area}px²  <${l.tag} class="${l.cls}">  "${l.text}"`
          )
        }
      }
      console.log()
    }
  } finally {
    try {
      ws.close()
    } catch (e) {}
    chrome.kill()
    await sleep(400)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch (e) {}
  }

  console.log('='.repeat(60))
  console.log(totalLeaks ? `共发现 ${totalLeaks} 处疑似漏白，请逐个确认` : '✓ 所有页面均无漏白')
  if (totalLeaks) process.exitCode = 1
}

main().catch((e) => {
  console.error('脚本异常:', e.message)
  process.exitCode = 1
})
