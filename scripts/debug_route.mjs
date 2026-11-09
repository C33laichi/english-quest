/**
 * 调试：登录后导航到某路由，打印 hash 变化与页面内容，排查被重定向的原因。
 * 用法：node scripts/debug_route.mjs --path /profile
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9361
const BASE = 'http://127.0.0.1:5173'

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  return process.argv[i + 1]
}
const ROUTE = arg('path', '/profile')

let msgId = 0
const pending = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function send(ws, method, params = {}) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('CDP 超时 ' + method)) }
    }, 30000)
  })
}

const udd = mkdtempSync(join(tmpdir(), 'eq-dbg-'))

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
    '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', 'about:blank'
  ])
  await sleep(2500)
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const target = list.find((t) => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  const logs = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push('console: ' + (m.params.args || []).map((a) => a.value ?? a.description).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('EXC: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text))
    }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    }
  }
  const ev = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result?.value
  }
  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')

  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2000)
  const login = await ev(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'student', password: (process.env.EQ_PASS || '') })
      });
      const b = await r.json();
      if (b.code !== 200) return 'FAIL ' + b.msg;
      const d = b.data;
      localStorage.setItem('eq_token', d.token);
      localStorage.setItem('eq_user', JSON.stringify({ userId: d.userId, username: d.username, nickname: d.nickname, role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays }));
      localStorage.setItem('eq_theme', 'light');
      return 'OK role=' + d.role;
    })()
  `)
  console.log('登录:', login)

  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#${ROUTE}` })
  for (const t of [800, 1600, 2600, 3600]) {
    await sleep(t === 800 ? 800 : t - (t === 1600 ? 800 : t === 2600 ? 1600 : 2600))
    const s = await ev(`JSON.stringify({ hash: location.hash, href: location.href,
        n: document.querySelectorAll('.mini-stat').length,
        cls: [...document.querySelectorAll('.mini-stat')].map(e => e.className).join(' ; '),
        head: (document.body.innerText || '').slice(0, 120).replace(/\\n/g, ' | ') })`)
    console.log(`  t=${t}ms`, s)
  }
  console.log('日志:', logs.length ? logs : '（无）')
  ws.close()
  chrome.kill()
}
main().catch((e) => { console.error(e); process.exit(1) })
