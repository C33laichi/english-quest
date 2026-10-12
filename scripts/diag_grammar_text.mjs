/**
 * 诊断脚本：抓取语法讲义页的真实渲染文本，定位"乱码"到底出现在哪
 *
 * 用法：node scripts/diag_grammar_text.mjs [day]
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9338
const DAY = Number(process.argv[2] || 2)
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

mkdirSync(SHOT_DIR, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-diag-'))

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
    '--window-size=1440,1600',
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
        body: JSON.stringify({ username: 'student', password: '' })
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

  // 抓所有讲义条目
  const items = await evalJson(`
    JSON.stringify(
      [...document.querySelectorAll('.point-item')].map((el, i) => ({
        i,
        text: el.querySelector('.point-text')?.innerText || '',
        example: el.querySelector('.point-example')?.innerText || ''
      }))
    )
  `)

  console.log(`===== Day ${DAY} 讲义实际渲染文本（共 ${items.length} 条）=====`)
  for (const it of items) {
    console.log(`[${it.i}] ${it.text}`)
    if (it.example) console.log(`      ${it.example}`)
  }

  // 扫描可疑字符
  console.log('')
  console.log('===== 可疑字符扫描 =====')
  const suspicious = []
  for (const it of items) {
    const all = it.text + ' ' + it.example
    const found = []
    if (all.includes('\uFFFD')) found.push('U+FFFD 替换符')
    if (all.includes('\u0000')) found.push('U+0000 空字符')
    if (all.includes('\\u0000')) found.push('字面量 \\u0000')
    if (all.includes('\\"')) found.push('反斜杠+引号 \\"')
    if (all.includes("''")) found.push('双撇号')
    if (/[ÃÂåæçèéêëìíîï]{2,}/.test(all)) found.push('mojibake')
    if (found.length) suspicious.push({ i: it.i, found, text: it.text.slice(0, 80) })
  }
  if (!suspicious.length) console.log('未发现可疑字符 —— 渲染文本干净')
  else suspicious.forEach((s) => console.log(`[${s.i}] ${s.found.join(' / ')} :: ${s.text}`))

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const out = join(SHOT_DIR, `diag-grammar-day${DAY}.png`)
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('')
  console.log('截图:', out)

  // 额外：检查是否换行符号导致文字粘连
  console.log('')
  console.log('===== 换行/富文本检查 =====')
  const weird = items.filter((it) => /[\r\n]/.test(it.text) || /\\n/.test(it.text))
  console.log(weird.length ? `含换行符的条目: ${weird.length} 条` : '无换行符异常')

  ws.close()
  chrome.kill()
  process.exit(0)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
