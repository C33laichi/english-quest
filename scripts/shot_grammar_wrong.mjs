/**
 * 截图验证：语法关错题回顾是否显示选项内容（而非 A/B/C/D）
 *
 * 流程：进 Day1 → 开始测验 → 每题都选第一个选项（大概率错）→ 提交 → 截结算页
 *
 * 用法：node scripts/shot_grammar_wrong.mjs [day]
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9340
const DAY = Number(process.argv[2] || 1)
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

mkdirSync(SHOT_DIR, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-wrong-'))

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
    '--window-size=1440,1800',
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

  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
  await evalJson(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'student', password: (process.env.EQ_PASS || '') })
      });
      const b = await r.json();
      const d = b.data;
      localStorage.setItem('eq_token', d.token);
      localStorage.setItem('eq_user', JSON.stringify({
        userId: d.userId, username: d.username, nickname: d.nickname,
        role: d.role, avatar: d.avatar,
        totalPoints: d.totalPoints, streakDays: d.streakDays
      }));
      return 'OK';
    })()
  `)

  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/lesson/${DAY}` })
  await sleep(3200)

  // 开始测验
  await evalJson(`(document.querySelector('.btn-primary')?.click(), 'ok')`)
  await sleep(1200)

  // 逐题选"第一个选项"（大概率是错的），然后下一题
  const total = await evalJson(`JSON.stringify(document.querySelectorAll('.option').length)`)
  for (let i = 0; i < 6; i++) {
    const done = await evalJson(`JSON.stringify(!!document.querySelector('.result-card'))`)
    if (done) break
    // 选中第一个选项
    await evalJson(`(document.querySelector('.option')?.click(), 'ok')`)
    await sleep(900)
    // 点下一题 / 提交答卷
    await evalJson(`
      (() => {
        const btns=[...document.querySelectorAll('.btn-row .el-button')];
        const next=btns.find(b=>/下一题|提交答卷/.test(b.innerText));
        if(next) next.click();
        return 'ok';
      })()
    `)
    await sleep(1100)
  }

  // 等结算
  await sleep(2000)

  // 读取错题区渲染文本
  const wrong = await evalJson(`
    JSON.stringify(
      [...document.querySelectorAll('.wrong-item')].map((el) => ({
        stem: el.querySelector('.wrong-stem')?.innerText || '',
        lines: [...el.querySelectorAll('.wrong-line')].map(l => l.innerText.trim()),
        analysis: el.querySelector('.wrong-analysis')?.innerText || ''
      }))
    )
  `)

  console.log(`===== Day ${DAY} 错题回顾渲染 =====`)
  if (!wrong.length) console.log('（没有错题 —— 本次全对，无法验证）')
  wrong.forEach((w, i) => {
    console.log(`--- 错题 ${i + 1} ---`)
    console.log('  ', w.stem)
    w.lines.forEach((l) => console.log('  ', l))
    if (w.analysis) console.log('   ', w.analysis.slice(0, 60))
  })

  // 断言：不能只出现单个字母
  console.log('')
  console.log('===== 断言 =====')
  const onlyLetter = wrong.flatMap((w) => w.lines).filter((l) => /：\s*[A-D]\s*$/.test(l))
  const hasText = wrong.flatMap((w) => w.lines).filter((l) => /：\s*\S{2,}/.test(l) && !/：\s*[A-D]\s*$/.test(l))
  console.log(`只显示字母 A-D 的行数: ${onlyLetter.length}（应为 0）`)
  console.log(`显示选项内容的行数  : ${hasText.length}（应 > 0）`)
  console.log(onlyLetter.length === 0 && hasText.length > 0 ? '✓ 通过' : '✗ 未通过')

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const out = join(SHOT_DIR, `31-语法错题回顾-显示选项内容.png`)
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('')
  console.log('截图:', out)

  ws.close()
  chrome.kill()
  process.exit(onlyLetter.length === 0 && hasText.length > 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
