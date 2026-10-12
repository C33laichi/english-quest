/**
 * 抓取听力简单模式「词长底衬提示」截图，验证提示层与输入文字是否对齐。
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

const PORT = 9334
const userDir = 'C:/tmp/cdp-hint-' + Date.now()
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
  height: 900,
  deviceScaleFactor: 1,
  mobile: false
})

const BASE = 'http://127.0.0.1:5173'
const OUT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#/login` })
await sleep(2200)
await send('Runtime.evaluate', {
  expression: `(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student', password: '' })
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
await sleep(300)

/* ---------- 简单模式：词长底衬提示 ---------- */
await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#/listen/1/EASY` })
await sleep(3400)

/** 逐格探测：底衬提示字符数、格宽、输入框字号字距，用于判断对齐口径 */
const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    slots: [...document.querySelectorAll('.slot')].map(s => {
      const hint = s.querySelector('.slot-hint')
      const input = s.querySelector('.slot-input')
      const cs = getComputedStyle(input)
      return {
        hintLen: hint ? hint.textContent.replace(/\\u00a0/g, ' ').length : -1,
        hintColor: hint ? getComputedStyle(hint).color : '',
        w: Math.round(s.getBoundingClientRect().width),
        font: cs.fontFamily.split(',')[0],
        size: cs.fontSize,
        tracking: cs.letterSpacing
      }
    }),
    tip: (document.querySelector('.slots-tip')?.innerText || '').trim()
  })`,
  returnByValue: true
})
console.log('EASY:', probe.result?.result?.value)

// 敲前几个字母，看「已打字母 vs 底衬总长」的视觉关系
await send('Input.insertText', { text: 'i' })
await sleep(400)
const s1 = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(`${OUT_DIR}/25-听力词长提示-未输入.png`, Buffer.from(s1.result.data, 'base64'))
await sleep(200)
const s2 = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(`${OUT_DIR}/26-听力词长提示-已输入首词.png`, Buffer.from(s2.result.data, 'base64'))
console.log('saved 25 / 26')

/* ---------- 困难模式：确认提示层完全不出现 ---------- */
await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#/listen/1/HARD` })
await sleep(3400)
const hardProbe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    hints: document.querySelectorAll('.slot-hint').length,
    slots: document.querySelectorAll('.slot').length,
    tip: (document.querySelector('.slots-tip')?.innerText || '').trim(),
    chinese: (document.querySelector('.stage-chinese')?.innerText || '').trim()
  })`,
  returnByValue: true
})
console.log('HARD:', hardProbe.result?.result?.value)
const s3 = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(`${OUT_DIR}/14-听力困难模式.png`, Buffer.from(s3.result.data, 'base64'))

ws.close()
child.kill()
process.exit(0)
