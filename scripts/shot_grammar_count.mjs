/**
 * 截图验证：语法闯关头部题数显示的三种状态
 *
 * 背景：头部原来恒显示「N 题」（总题数），答题中看不出还剩几题。
 * 现改为答题中显示「当前 / 总数」。
 *
 * 本脚本依次截三张：
 *   1) 讲义页（未开始）     → 应显示「N 题」
 *   2) 答题中（第 1 题）   → 应显示「1 / N」
 *   3) 答题中（第 2 题）   → 应显示「2 / N」（证明会递增）
 *
 * 用法：node scripts/shot_grammar_count.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9336
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

mkdirSync(SHOT_DIR, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-count-'))

let msgId = 0
const pending = new Map()

function send(ws, method, params = {}) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`CDP 超时: ${method}`))
      }
    }, 30000)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ])

  await sleep(2600)
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const target = list.find((t) => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res) => (ws.onopen = res))

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    }
  }

  const evalJson = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    })
    const v = r.result?.value
    if (typeof v === 'string') {
      try {
        return JSON.parse(v)
      } catch {
        return v
      }
    }
    return v
  }

  const shot = async (name) => {
    const r = await send(ws, 'Page.captureScreenshot', { format: 'png' })
    const out = join(SHOT_DIR, name)
    writeFileSync(out, Buffer.from(r.data, 'base64'))
    console.log('  截图:', out)
  }

  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')

  // 登录
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
  const login = await evalJson(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'student', password: '' })
      });
      const b = await r.json();
      if (b.code !== 200) return 'LOGIN_FAIL: ' + b.msg;
      const d = b.data;
      localStorage.setItem('eq_token', d.token);
      localStorage.setItem('eq_user', JSON.stringify({
        userId: d.userId, username: d.username, nickname: d.nickname,
        role: d.role, avatar: d.avatar,
        totalPoints: d.totalPoints, streakDays: d.streakDays
      }));
      return 'OK:' + d.role;
    })()
  `)
  console.log('登录:', login)

  const readCount = () =>
    evalJson(`JSON.stringify((document.querySelector('.quiz-bar-count')?.innerText || '').trim())`)

  // ---- 状态 1：讲义页 ----
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/lesson/2` })
  await sleep(3000)
  const c1 = await readCount()
  console.log('')
  console.log('[状态1] 讲义页（未开始） 头部署显示 =', JSON.stringify(c1))
  await shot('28-语法题数-讲义页.png')

  // ---- 进入测验 ----
  await evalJson(`(document.querySelector('.btn-primary')?.click(), 'ok')`)
  await sleep(1200)
  const c2 = await readCount()
  console.log('[状态2] 答题中·第 1 题    头部署显示 =', JSON.stringify(c2))
  await shot('29-语法题数-答题中第1题.png')

  // ---- 选一个选项 → 自动进入下一题 ----
  await evalJson(`(document.querySelector('.option')?.click(), 'ok')`)
  await sleep(1500)
  const c3 = await readCount()
  console.log('[状态3] 答题中·第 2 题    头部署显示 =', JSON.stringify(c3))
  await shot('30-语法题数-答题中第2题.png')

  console.log('')
  console.log('======================================')
  const ok1 = /^\d+\s*题$/.test(c1)
  const m2 = /^(\d+)\s*\/\s*(\d+)$/.exec(c2)
  const m3 = /^(\d+)\s*\/\s*(\d+)$/.exec(c3)
  const ok2 = m2 && Number(m2[1]) === 1 && Number(m2[2]) > 1
  const ok3 = m3 && Number(m3[1]) === 2 && m3[2] === m2?.[2]
  console.log(`${ok1 ? '✓' : '✗'} 讲义页显示总题数（"N 题"）`)
  console.log(`${ok2 ? '✓' : '✗'} 答题中第 1 题显示 "1 / N"`)
  console.log(`${ok3 ? '✓' : '✗'} 进入第 2 题后递增为 "2 / N"（不再是原来恒定的总题数）`)
  console.log('======================================')

  ws.close()
  chrome.kill()
  process.exit(ok1 && ok2 && ok3 ? 0 : 1)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
