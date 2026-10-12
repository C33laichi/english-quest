/**
 * 抓取 taste-skill 改造的 3 个打样页截图：
 *   登录页 / 首页 / 词汇答题页
 * 用于横向对比改造前后的视觉语言（冷调石墨 + 单色翡翠）。
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

const PORT = 9336
const userDir = 'C:/tmp/cdp-taste-' + Date.now()
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
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false
})

const BASE = 'http://127.0.0.1:5173'
const OUT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

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

async function shot(route, file, probeExpr, wait = 3200) {
  await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#${route}` })
  await sleep(wait)
  if (probeExpr) {
    const probe = await send('Runtime.evaluate', {
      expression: probeExpr,
      returnByValue: true
    })
    console.log(`  probe ${file} ->`, probe.result?.result?.value)
  }
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${OUT_DIR}/${file}`, Buffer.from(s.result.data, 'base64'))
  console.log(`  shot  ${file}`)
}

// ---------- 1. 登录页（未登录态，直接看左右分栏） ----------
await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#/login` })
await sleep(2600)
await shot('/login', 'T1-打样-登录页.png', null, 1800)

// 登录取 token
await login(os.environ.get('EQ_USER', 'student'), os.environ.get('EQ_PASS', ''))
await sleep(400)

// ---------- 2. 首页 ----------
await shot(
  '/home',
  'T2-打样-首页.png',
  `JSON.stringify({
    entryCards: document.querySelectorAll('.entry-card').length,
    lead: !!document.querySelector('.entry-card--lead'),
    heroStats: document.querySelectorAll('.hero-stat').length,
    font: getComputedStyle(document.body).fontFamily.split(',')[0]
  })`
)

// ---------- 3. 词汇答题页（选择题） ----------
await shot(
  '/quiz/vocab/1',
  'T3-打样-词汇答题页.png',
  `JSON.stringify({
    pills: [...document.querySelectorAll('.option-key')].map(e => e.innerText),
    stem: document.querySelector('.quiz-stem')?.innerText?.slice(0, 24) || '',
    optionRadius: getComputedStyle(document.querySelector('.option')).borderRadius,
    keyRadius: getComputedStyle(document.querySelector('.option-key')).borderRadius
  })`
)

// ---------- 4. 结算态（答题成绩页） ----------
// 直接调接口拿结果太绕，用键盘连点把题答完，落到结算屏
await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' })
for (let i = 0; i < 30; i++) {
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49
  })
  await sleep(420)
  const done = await send('Runtime.evaluate', {
    expression: '!!document.querySelector(".result-card")',
    returnByValue: true
  })
  if (done.result?.result?.value === true) break
}
await sleep(1200)
await shot('/quiz/vocab/1', 'T4-打样-答题结算页.png', null, 1500)

ws.close()
child.kill()
process.exit(0)
