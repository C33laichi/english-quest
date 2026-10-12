/**
 * 抓取「选择题数字键药丸」界面截图，用于验证 1/2/3/4 主键位改版的视觉效果。
 * 零依赖：Node 自带 fetch + WebSocket 驱动系统 Chrome（CDP）。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].find((p) => fs.existsSync(p))
if (!CHROME) {
  console.error('未找到 Chrome')
  process.exit(1)
}

const PORT = 9333
const userDir = 'C:/tmp/cdp-digit-' + Date.now()
const child = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDir}`,
    '--headless=new',
    '--no-first-run',
    '--disable-gpu',
    'about:blank'
  ],
  { stdio: 'ignore' }
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(2500)

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const target = list.find((t) => t.type === 'page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))

let id = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((res) => {
    const mid = ++id
    pending.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 860,
  deviceScaleFactor: 1,
  mobile: false
})

const BASE = 'http://127.0.0.1:5173'
const OUT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

/** 用真实登录接口换 token 写进 localStorage，避免每次手动登录 */
async function login(username, password) {
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '${username}', password: '${password}' })
      })
      const d = await res.json()
      localStorage.setItem('eq_token', d.data.token)
      localStorage.setItem('eq_user', JSON.stringify({
        userId: d.data.userId, username: d.data.username,
        role: d.data.role, nickname: d.data.nickname
      }))
      return 'ok'
    })()`,
    awaitPromise: true,
    returnByValue: true
  })
}

async function shot(url, file) {
  await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#${url}` })
  await sleep(3200)
  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      pills: [...document.querySelectorAll('.option-key')].map(e => e.innerText),
      stem: document.querySelector('.quiz-stem')?.innerText || ''
    })`,
    returnByValue: true
  })
  console.log(`${file} ->`, probe.result?.result?.value)
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${OUT_DIR}/${file}`, Buffer.from(s.result.data, 'base64'))
}

await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#/login` })
await sleep(2200)
await login((process.env.EQ_USER || 'student'), (process.env.EQ_PASS || ''))
await sleep(300)
await shot('/quiz/vocab/1', '24-选择题数字键药丸.png')

ws.close()
child.kill()
process.exit(0)
