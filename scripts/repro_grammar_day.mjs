/**
 * 复现/验证：语法路线点「进入 Day N」后是否真的进入第 N 天
 *
 * 背景：GrammarLesson.vue 用 `const day = Number(route.params.day)` 在 setup 里
 * 取了一次快照。由于 <router-view> 没有 :key，从 /lesson/2 走到 /lesson/3 时
 * 组件实例被复用、setup 不会重跑，day 会一直停在 2。
 *
 * 本脚本验证：点某一天的入口 → 看 URL 的 day 与页面实际渲染的 day 是否一致。
 *
 * 用法：node scripts/repro_grammar_day.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9334

mkdirSync('D:/WorkBuddy/WorkPlace/english-quest/screenshots', { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-repro-'))

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

  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')

  // 1) 注入登录态
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
  const login = await evalJson(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'student', password: (process.env.EQ_PASS || '') })
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

  // 2) 先直接落在 Day 2（模拟"刚通过 Day2 想进 Day3"的前置状态）
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/lesson/2` })
  await sleep(3000)
  const at2 = await evalJson(`
    JSON.stringify({
      hash: location.hash,
      title: (document.querySelector('.quiz-bar-title')?.innerText || '').trim()
    })
  `)
  console.log('直接打开 /lesson/2 →', at2)

  // 3) 在同一个 SPA 会话里跳到 Day 3（关键：不整页刷新，模拟点击跳转）
  await evalJson(`(location.hash = '#/lesson/3', 'ok')`)
  await sleep(2600)
  const at3 = await evalJson(`
    JSON.stringify({
      hash: location.hash,
      title: (document.querySelector('.quiz-bar-title')?.innerText || '').trim()
    })
  `)
  console.log('hash 改到 /lesson/3 →', at3)

  // 4) 判定：URL 与渲染内容是否一致
  const urlDay = Number((at3.hash || '').split('/').pop())
  const titleDay = Number((at3.title || '').match(/Day\s*(\d+)/)?.[1] || NaN)
  console.log('')
  console.log('======================================')
  console.log(`URL 里的 Day   : ${urlDay}`)
  console.log(`页面渲染的 Day : ${titleDay}`)
  if (urlDay === titleDay) {
    console.log('✓ 一致 —— 路由参数被正确响应')
  } else {
    console.log(`✗ 不一致 —— 页面仍停留在 Day ${titleDay}（BUG 复现）`)
  }
  console.log('======================================')

  // 5) 再跑一次"从路线页点进 Day3"的真实路径
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/grammar` })
  await sleep(3000)
  const items = await evalJson(`
    JSON.stringify([...document.querySelectorAll('.level-item')].map((el, i) => ({
      i, text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      locked: el.classList.contains('locked')
    })))
  `)
  const day3 = items.find((x) => /Day 3\s/.test(x.text) || /Day 3·/.test(x.text) || /Day 3\b/.test(x.text))
  console.log('')
  console.log('路线页找到的 Day3 条目:', JSON.stringify(day3))
  if (day3) {
    await evalJson(`(document.querySelectorAll('.level-item')[${day3.i}].click(), 'ok')`)
    await sleep(2800)
    const after = await evalJson(`
      JSON.stringify({
        hash: location.hash,
        title: (document.querySelector('.quiz-bar-title')?.innerText || '').trim()
      })
    `)
    console.log('点击 Day3 之后 →', after)
    const u = Number((after.hash || '').split('/').pop())
    const t = Number((after.title || '').match(/Day\s*(\d+)/)?.[1] || NaN)
    console.log('')
    console.log('======================================')
    console.log(`点击后 URL 的 Day   : ${u}`)
    console.log(`点击后渲染的 Day    : ${t}`)
    console.log(u === t ? '✓ 一致' : `✗ 不一致 —— 点了 Day${u} 却进了 Day${t}（BUG 复现）`)
    console.log('======================================')

    // 6) 留一张截图作为视觉证据
    const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' })
    const { writeFileSync } = await import('node:fs')
    const out = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots/27-语法Day3路由修复.png'
    writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log('截图已保存:', out)
  }

  ws.close()
  chrome.kill()
  process.exit(0)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
