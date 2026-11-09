/**
 * 重拍说明书 图 4-3 词汇闯关答题界面（零依赖 CDP）
 *
 * 为什么单独写：题目的 type 由后端 ORDER BY RAND() 决定，每次进关卡可能是
 * CHOICE（四选项）也可能是 SPELL（拼写）。图 4-3 要的是「题干 + 四个带词性的
 * 选项」，所以必须反复重进关卡，直到抽到 CHOICE 且选项已渲染 .pos-tag 为止。
 *
 * 几何必须与旧图一致：1440x900、scale=1，否则换进 Word 会变形。
 *
 * 用法：node scripts/shot_fig43.mjs --out 路径.png
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9352
const W = 1440
const H = 900
const BASE = 'http://127.0.0.1:5173'
const USER = 'student'
const PASS = (process.env.EQ_PASS || '')
const THEME = 'light'
const MAX_TRY = 20
/** 优先抽回原图那个单词，抽不到就用第一次拿到的选择题兜底 */
const PREFER = String(arg('prefer', 'principle'))

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const OUT = arg('out', null)
const LEVEL = Number(arg('level', 1))
const ROUTE = `/quiz/vocab/${LEVEL}`

if (!OUT) {
  console.error('必须指定 --out <输出路径>')
  process.exit(2)
}

let msgId = 0
const pending = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

const userDataDir = mkdtempSync(join(tmpdir(), 'eq-fig43-'))

async function main() {
  mkdirSync(dirname(OUT), { recursive: true })

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${W},${H}`,
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
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

  const evaluate = async (expr) => {
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
  await sleep(2000)
  const loginOk = await evaluate(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '${USER}', password: '${PASS}' })
      });
      const b = await r.json();
      if (b.code !== 200) return 'FAIL:' + b.msg;
      const d = b.data;
      localStorage.setItem('eq_token', d.token);
      localStorage.setItem('eq_user', JSON.stringify({
        userId: d.userId, username: d.username, nickname: d.nickname,
        role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
      }));
      localStorage.setItem('eq_theme', '${THEME}');
      return 'OK';
    })()
  `)
  if (String(loginOk).startsWith('FAIL')) throw new Error(`登录失败：${loginOk}`)
  console.log('登录成功')

  let picked = null
  let fallback = null
  for (let i = 1; i <= MAX_TRY; i++) {
    // hash 路由只改 hash 不会重载，必须带变化 query 强制整页加载
    await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}${i}#${ROUTE}` })
    await sleep(3000)
    await sleep(700)

    const state = await evaluate(`
      (() => {
        const opts = [...document.querySelectorAll('.option')];
        const stem = document.querySelector('.quiz-stem');
        return JSON.stringify({
          hash: location.hash,
          optionCount: opts.length,
          posTags: document.querySelectorAll('.option .pos-tag').length,
          stemText: stem ? stem.innerText.replace(/\\n/g, ' | ') : null,
          options: opts.map(o => o.innerText.replace(/\\n/g, ' '))
        });
      })()
    `)
    const kind = state.optionCount > 0 ? 'CHOICE' : 'SPELL'
    console.log(
      `第 ${i} 次：${kind} 选项 ${state.optionCount} 个，词性标签 ${state.posTags} 个`
    )
    if (kind === 'CHOICE') {
      console.log('  题干:', state.stemText)
      state.options.forEach((o, k) => console.log(`  选项${k + 1}:`, o))
      if (state.posTags < 4) {
        console.log('  ⚠ 词性标签不足 4 个，继续重抽')
        continue
      }
      const word = String(state.stemText || '').trim()
      if (word === PREFER) {
        picked = state
        break
      }
      if (!fallback) fallback = state
      console.log(`  词不是「${PREFER}」，先记为兜底，继续重抽`)
      continue
    }
  }

  if (!picked) picked = fallback
  if (!picked) throw new Error(`尝试 ${MAX_TRY} 次仍未抽到带词性的选择题`)
  if (String(picked.stemText || '').trim() !== PREFER) {
    console.log(`\n注：未抽到「${PREFER}」，使用「${String(picked.stemText).trim()}」`)
  }

  await sleep(500)
  const shot = await send(ws, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: W, height: H, scale: 1 }
  })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log(`\n截图已保存：${OUT}  ${W}x${H}`)

  ws.close()
  chrome.kill()
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
