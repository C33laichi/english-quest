/**
 * 重拍 README 的「首页-等级提示浮层」（63-首页-等级提示浮层.png）
 *
 * 为什么单独写：这张不是整屏截图，而是**贴着浮层的一块紧裁剪**（原图 180x207）。
 * 要复现同样的构图，得先让 tooltip 真出现（只有真实指针事件才会触发），
 * 再按浮层的位置加四周留白去裁。留白做成命令行参数，方便对齐原图比例。
 *
 * 用法：
 *   node scripts/shot_level_tip.mjs --out 路径.png
 *   node scripts/shot_level_tip.mjs --out x.png --pad-l 40 --pad-t 8 --pad-r 8 --pad-b 50
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9364
const BASE = 'http://127.0.0.1:5173'
const USER = 'student'
const PASS = (process.env.EQ_PASS || '')
const W = 1440
const H = 900

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  return process.argv[i + 1] ?? def
}
const OUT = arg('out', null)
const PAD = {
  l: Number(arg('pad-l', 40)),
  t: Number(arg('pad-t', 8)),
  r: Number(arg('pad-r', 8)),
  b: Number(arg('pad-b', 50)),
}
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
      if (pending.has(id)) { pending.delete(id); reject(new Error('CDP 超时 ' + method)) }
    }, 30000)
  })
}

const udd = mkdtempSync(join(tmpdir(), 'eq-leveltip-'))

async function main() {
  mkdirSync(dirname(OUT), { recursive: true })
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
    `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ])
  await sleep(2500)
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    }
  }
  const ev = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result?.value
  }
  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')

  // 1. 登录 + 进首页
  await send(ws, 'Page.navigate', { url: `${BASE}/` })
  await sleep(2200)
  const ok = await ev(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '${USER}', password: '${PASS}' })
      });
      const b = await r.json();
      if (b.code !== 200) return 'FAIL ' + b.msg;
      const d = b.data;
      localStorage.setItem('eq_token', d.token);
      localStorage.setItem('eq_user', JSON.stringify({
        userId: d.userId, username: d.username, nickname: d.nickname,
        role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
      }));
      localStorage.setItem('eq_theme', 'light');
      return 'OK';
    })()
  `)
  if (ok !== 'OK') throw new Error('登录失败：' + ok)
  await ev(`location.hash = '#/home'; 'ok'`)
  await send(ws, 'Page.reload', {})
  await sleep(3200)

  // 2. 悬停「?」徽标（tooltip 只认真实指针事件）
  const badge = await ev(`(() => {
    const el = document.querySelector('.level-help');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`)
  if (!badge) throw new Error('没找到 .level-help 徽标')
  const b = JSON.parse(badge)
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 0 })
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x + 2, y: b.y + 2, buttons: 0 })
  await sleep(1200)

  // 3. 读浮层尺寸
  const pop = await ev(`(() => {
    const el = document.querySelector('.level-tip-popper') || document.querySelector('.el-popper');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const rows = [...el.querySelectorAll('.level-tip-row')].map(x => x.innerText.replace(/\\n/g, ' '));
    return JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height, rows: rows.length,
                            first: rows[0] || null, last: rows[rows.length - 1] || null });
  })()`)
  if (!pop) throw new Error('浮层没出现')
  const p = JSON.parse(pop)
  console.log(`浮层: ${Math.round(p.w)}x${Math.round(p.h)} @ (${Math.round(p.x)}, ${Math.round(p.y)})，${p.rows} 行`)
  console.log(`  首行: ${p.first}`)
  console.log(`  末行: ${p.last}`)

  // 4. 按留白裁剪
  const clip = {
    x: Math.max(0, Math.round(p.x - PAD.l)),
    y: Math.max(0, Math.round(p.y - PAD.t)),
    width: Math.round(p.w + PAD.l + PAD.r),
    height: Math.round(p.h + PAD.t + PAD.b),
    scale: 1
  }
  console.log(`裁剪区域: ${clip.width}x${clip.height} @ (${clip.x}, ${clip.y})`)

  const shot = await send(ws, 'Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false, clip
  })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log('截图:', OUT)

  ws.close()
  chrome.kill()

  // 5. 读回实际像素尺寸（零依赖：直接解析 PNG 头）
  const png = execFileSync(process.execPath, ['-e', `
    const b = require('fs').readFileSync(${JSON.stringify(OUT)});
    console.log(b.readUInt32BE(16) + 'x' + b.readUInt32BE(20) + ' ' + b.length + ' bytes');
  `]).toString().trim()
  console.log('实际输出:', png)
}
main().catch((e) => { console.error('脚本异常:', e.message); process.exit(1) })
