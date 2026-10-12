/**
 * 重拍说明书 图 4-6 AI 智能练习界面（零依赖 CDP）
 *
 * 为什么单独写：图 4-6 需要「选中错题 → 生成同型题 → 作答露出解析」这一串交互，
 * shot_el.mjs 只支持单步 --click / --hover，复用它拿不到那张图。
 * 几何必须与旧图一致（1440x900，ratio 0.625），否则换进 Word 会变形。
 *
 * 用法：
 *   node scripts/shot_fig46.mjs --out 路径.png            # 无 tooltip（替换 图 4-6）
 *   node scripts/shot_fig46.mjs --out 路径.png --hover    # 悬停「AI 对话」入口，带气泡
 *
 * 参数：
 *   --out    输出路径（必填）
 *   --hover  截图前把鼠标移到 .ai-chat-entry 上（tooltip 只有真实指针事件才出现）
 *   --base   站点根，默认 http://127.0.0.1:5173
 *   --theme  light | dark（默认 light，与旧图一致）
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9357
const W = 1440
const H = 900

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const OUT = arg('out', null)
const HOVER = !!arg('hover', false)
const BASE = String(arg('base', 'http://127.0.0.1:5173')).replace(/\/+$/, '')
const THEME = arg('theme', 'light') === 'dark' ? 'dark' : 'light'

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
    }, 40000)
  })
}

const userDataDir = mkdtempSync(join(tmpdir(), 'eq-fig46-'))

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
      expression: expr, awaitPromise: true, returnByValue: true
    })
    if (r.exceptionDetails) {
      throw new Error('页面脚本异常: ' + JSON.stringify(r.exceptionDetails.exception?.description))
    }
    const v = r.result?.value
    if (typeof v === 'string') {
      try { return JSON.parse(v) } catch { return v }
    }
    return v
  }

  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 1, mobile: false
  })

  // ---- 登录态 ----
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2400)
  const loginOk = await evaluate(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'student', password: (process.env.EQ_PASS || '') })
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
  console.log(`  登录 -> ${loginOk}`)

  // ---- 进入 AI 智能练习，复刻旧图的交互序列 ----
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/ai` })
  await sleep(3600)

  // 顺带把 AI 对话可用性状态读出来，写进日志（也当一次功能断言）
  const chatReady = await evaluate(`
    (() => {
      const el = document.querySelector('.ai-chat-entry');
      if (!el) return 'NO_ENTRY';
      return el.innerText.replace(/\\n/g, ' / ');
    })()
  `)
  console.log(`  入口状态: ${chatReady}`)

  const pick = await evaluate(`
    (() => {
      const items = [...document.querySelectorAll('.pick-item')];
      if (!items.length) return 'NO_ERROR_ITEMS';
      items[0].click();
      return 'PICKED:' + items.length;
    })()
  `)
  console.log(`  选错题: ${pick}`)
  if (String(pick).startsWith('NO_')) throw new Error('AI 页没有可选错题，先确认错题本非空')
  await sleep(600)

  await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('生成同型题'));
      if (b) b.click();
      return 'CLICKED';
    })()
  `)
  for (let i = 0; i < 20; i++) {
    await sleep(700)
    const st = await evaluate(`document.querySelectorAll('.quiz-stem').length`)
    if (st > 0) break
  }
  await evaluate(`
    (() => {
      const o = document.querySelectorAll('.option');
      if (o.length) o[0].click();
      return 'ANSWERED';
    })()
  `)
  await sleep(900)

  // ---- 可选：悬停 AI 对话入口，让 tooltip 出现 ----
  if (HOVER) {
    const pos = await evaluate(`
      (() => {
        const el = document.querySelector('.ai-chat-entry');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
      })()
    `)
    if (!pos) throw new Error('没找到 .ai-chat-entry（AI 对话入口）')
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, buttons: 0 })
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 2, y: pos.y + 2, buttons: 0 })
    await sleep(1200)
    const tip = await evaluate(`
      (() => {
        const t = [...document.querySelectorAll('.el-popper')].filter((e) => e.offsetParent !== null);
        return t.length ? t[t.length - 1].innerText.replace(/\\n/g, ' ') : 'NO_TOOLTIP';
      })()
    `)
    console.log(`  tooltip: ${tip}`)
    if (tip === 'NO_TOOLTIP') throw new Error('hover 没让 tooltip 出现，检查入口是否被遮挡')
  }

  // ---- 截整页（高度压回 900，与旧图几何一致）----
  const doc = await evaluate(
    `JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, hash: location.hash })`
  )
  const clipH = Math.max(H, Math.min(doc.h, H))
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: W, height: clipH, deviceScaleFactor: 1, mobile: false
  })
  await sleep(700)
  const shot = await send(ws, 'Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: W, height: clipH, scale: 1 }
  })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log(`截图: ${OUT}\n  ${W}x${clipH}  hash=${doc.hash}  页高=${doc.h}  hover=${HOVER}  theme=${THEME}`)

  ws.close()
  chrome.kill()
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
