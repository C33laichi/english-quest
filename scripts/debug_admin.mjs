/** 最小复现：管理员登录 -> 访问后台，逐步打印 localStorage 与 hash */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9344
const BASE = 'http://127.0.0.1:5173'
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-dbg-'))

let msgId = 0
const pending = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function send(ws, method, params = {}) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error('timeout ' + method))), 20000)
  })
}

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-proxy-server', 'about:blank'
], { stdio: 'ignore' })

let ok = false
for (let i = 0; i < 40; i++) {
  try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)); ok = true; break } catch (e) { await sleep(500) }
}
if (!ok) throw new Error('chrome 未就绪')

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  }
}
await send(ws, 'Runtime.enable')
await send(ws, 'Page.enable')

async function ev(expr, awaitPromise = false) {
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true })
  return r.result.value
}

async function dump(tag) {
  const s = await ev(`JSON.stringify({ hash: location.hash, token: localStorage.getItem('eq_token'), user: localStorage.getItem('eq_user') })`)
  console.log(`--- ${tag} ---`)
  console.log(s)
}

await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
await sleep(2500)
await dump('1) 打开登录页后')

const r = await ev(`
  (async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: (process.env.EQ_ADMIN_PASS || '') })
    });
    const b = await r.json();
    if (b.code !== 200) return 'FAIL:' + b.msg;
    const d = b.data;
    localStorage.setItem('eq_token', d.token);
    localStorage.setItem('eq_user', JSON.stringify({
      id: d.userId, username: d.username, nickname: d.nickname,
      role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
    }));
    return 'OK:' + d.role + ' user=' + localStorage.getItem('eq_user');
  })()
`, true)
console.log('2) 管理员登录结果:', r)

await dump('3) 设置登录态后')

await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/admin/dashboard` })
await sleep(3500)
await dump('4) 跳转后台后')

const text = await ev('document.body.innerText')
console.log('5) 页面文本:', (text || '').replace(/\s+/g, ' ').slice(0, 300))

ws.close()
chrome.kill()
process.exit(0)
