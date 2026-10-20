/**
 * 截图验证：后台数据总览的题库题数是否走接口（而不是写死）
 *
 * 背景：AdminDashboard 的「词汇题目 / 语法题目」曾硬编码为 240 / 84，
 * 与实际库（240 / 136）不符，且导入新题后永不更新。
 * 现改为读取 /api/admin/stats 的 vocabQuestionCount / grammarQuestionCount。
 *
 * 校验方式：不只看像素，而是**同时读 DOM 文案与接口值做相等断言**。
 *
 * 用法：node scripts/shot_admin_dashboard.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5174'
const PORT = 9338
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots/admin_dashboard'

mkdirSync(SHOT_DIR, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-admindash-'))

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
    '--window-size=1440,1000',
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
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
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

  // ---------- 1) 以管理员身份登录 ----------
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
  // ⚠ 下面的代码是在**浏览器页面**里执行的，那里没有 process.env：
  //   口令必须先在 Node 侧取出来、序列化成 JS 字面量再拼进脚本，
  //   否则 process 未定义会直接抛错，login 变成 undefined，后面全线 undefined。
  const PW_LITERAL = JSON.stringify(process.env.EQ_PASS || '')
  const login = await evalJson(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: ${PW_LITERAL} })
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
      const s = await (await fetch('/api/admin/stats', {
        headers: { Authorization: 'Bearer ' + d.token }
      })).json();
      return JSON.stringify({ role: d.role, stats: s.data });
    })()
  `)
  if (typeof login === 'string' && login.startsWith('LOGIN_FAIL')) {
    console.error('登录失败:', login)
    process.exit(1)
  }
  const api = login.stats || {}
  console.log('接口值:', JSON.stringify({
    vocabQuestionCount: api.vocabQuestionCount,
    grammarQuestionCount: api.grammarQuestionCount,
    questionCount: api.questionCount
  }))

  // ---------- 2) 打开后台数据总览 ----------
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/admin/dashboard` })
  await sleep(3200)
  await shot('后台数据总览-题库题数.png')

  // ---------- 3) 读 DOM 文案 ----------
  const rows = await evalJson(`
    (() => {
      const out = {};
      document.querySelectorAll('.res-row').forEach((el) => {
        const k = (el.querySelector('span')?.innerText || '').trim();
        const v = (el.querySelector('b')?.innerText || '').trim();
        if (k) out[k] = v;
      });
      return JSON.stringify(out);
    })()
  `)
  console.log('页面文案:', JSON.stringify(rows))

  const num = (s) => Number(String(s || '').replace(/[^\d]/g, ''))
  const okVocab = num(rows['词汇题目']) === Number(api.vocabQuestionCount)
  const okGrammar = num(rows['语法题目']) === Number(api.grammarQuestionCount)
  const okSum =
    Number(api.vocabQuestionCount) + Number(api.grammarQuestionCount) === Number(api.questionCount)
  const okNoHardcode = !(num(rows['语法题目']) === 84)

  console.log('')
  console.log('======================================')
  console.log(`${okVocab ? '✓' : '✗'} 词汇题目显示值 = 接口 vocabQuestionCount（${api.vocabQuestionCount}）`)
  console.log(`${okGrammar ? '✓' : '✗'} 语法题目显示值 = 接口 grammarQuestionCount（${api.grammarQuestionCount}）`)
  console.log(`${okSum ? '✓' : '✗'} 题库总量 = 词汇 + 语法（${api.questionCount}）`)
  console.log(`${okNoHardcode ? '✓' : '✗'} 语法题目不再是写死的 84`)
  console.log('======================================')

  ws.close()
  chrome.kill()
  process.exit(okVocab && okGrammar && okSum && okNoHardcode ? 0 : 1)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
