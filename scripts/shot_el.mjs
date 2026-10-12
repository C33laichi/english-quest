/**
 * 截取页面上**某个元素**的高清图（零依赖 CDP）
 *
 * 为什么需要它：整页截图缩略之后，细节（个位数的对齐、问号徽标、页脚透明度）
 * 会被 Read 工具缩放掉，肉眼判断极不可靠。直接 clip 出目标元素并放大，
 * 才能看清到底对齐没有。整页截图也支持（--full）。
 *
 * 用法：
 *   node scripts/shot_el.mjs --path /home --sel ".hero" --theme light --out screenshots/x.png
 *   node scripts/shot_el.mjs --path /profile --full --theme dark --out screenshots/y.png
 *
 * 参数：
 *   --path   路由，可写 /home 或 home（自动补 /#/）
 *   --base   站点根，默认 http://127.0.0.1:5173（dev）；测生产产物给 http://127.0.0.1:5174
 *   --click  截图前先点击该选择器（用于打开弹窗等需要交互才出现的界面）
 *   --hover  截图前把鼠标移到该选择器上（tooltip / :hover 只有真实鼠标移动才出现，直接截拍不到）
 *   --sel    CSS 选择器（给 --full 时忽略）
 *   --theme  light | dark          （默认 light）
 *   --out    输出路径              （必填）
 *   --scale  设备像素比            （默认 2，放大看细节）
 *   --w/--h  视口宽高              （默认 1440x1200）
 *   --wait   额外等待毫秒          （默认 0）
 *   --user   账号                  （默认 student）
 *   --pass   密码                  （默认 ）
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
/** 默认打 vite dev（5173）；要验证**生产构建产物**就传 --base http://127.0.0.1:5174 */
const BASE = (() => {
  const i = process.argv.indexOf('--base')
  const v = i >= 0 ? process.argv[i + 1] : null
  return v && !v.startsWith('--') ? v.replace(/\/+$/, '') : 'http://127.0.0.1:5173'
})()
const PORT = 9346

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const rawPath = String(arg('path', '/home'))
const PATHNAME = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
const SEL = arg('sel', '.page')
const THEME = arg('theme', 'light') === 'dark' ? 'dark' : 'light'
const OUT = arg('out', null)
const SCALE = Number(arg('scale', 2))
const W = Number(arg('w', 1440))
const H = Number(arg('h', 1200))
const WAIT = Number(arg('wait', 0))
const USER = String(arg('user', 'student'))
const PASS = String(arg('pass', process.env.EQ_PASS || ''))
const FULL = !!arg('full', false)
const CLICK = arg('click', null)
const HOVER = arg('hover', null)
/** 限制截图高度：超长页面（如上百张卡片的错题本）整页截会直接超时 */
const MAXH = Number(arg('maxh', 0))

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

const userDataDir = mkdtempSync(join(tmpdir(), 'eq-shotel-'))

async function main() {
  mkdirSync(dirname(OUT), { recursive: true })

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${W},${H}`,
    `--force-device-scale-factor=${SCALE}`,
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

  // 注入登录态 + 主题（登录页自己会读 localStorage）
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
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
  if (String(loginOk).startsWith('FAIL')) {
    throw new Error(`登录失败：${loginOk}`)
  }

  // 带变化 query 强制整页加载（hash 路由只改 hash 不会重载，见项目已知坑）
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#${PATHNAME}` })
  await sleep(3400)
  if (WAIT) await sleep(WAIT)

  // 懒加载/过渡收尾
  await sleep(600)

  /*
   * 交互前置动作：--click / --hover。
   * 需要这一步的原因：Element Plus 的 tooltip、以及各种 :hover 样式，
   * 只有真实指针事件才会触发 —— 静态截图永远拍不到，会让人误判成"没实现"。
   */
  if (CLICK) {
    const ok = await evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(CLICK)});
        if (!el) return 'NO';
        el.click();
        return 'OK';
      })()
    `)
    if (ok !== 'OK') throw new Error(`--click 选择器没匹配到元素：${CLICK}`)
    await sleep(800)
  }

  if (HOVER) {
    const pos = await evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(HOVER)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      })()
    `)
    if (!pos) throw new Error(`--hover 选择器没匹配到元素：${HOVER}`)
    // 派发两次轻微位移：部分实现要"移动过程中"才计算 tooltip 位置
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, buttons: 0 })
    await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 2, y: pos.y + 2, buttons: 0 })
    await sleep(1000)   // 等 tooltip 的淡入过渡结束
  }

  let clip = null
  let info = ''
  if (FULL) {
    const doc = await evaluate(
      `JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, hash: location.hash })`
    )
    info = `整页 ${doc.w}x${doc.h} hash=${doc.hash}`
    clip = { x: 0, y: 0, width: doc.w, height: doc.h, scale: 1 }
  } else {
    const rect = await evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(SEL)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return JSON.stringify({
          x: Math.max(0, r.left), y: Math.max(0, r.top + window.scrollY),
          w: r.width, h: r.height, hash: location.hash,
          text: (el.innerText || '').slice(0, 200)
        });
      })()
    `)
    if (!rect) throw new Error(`选择器没匹配到元素：${SEL}`)
    info = `${SEL} @ ${Math.round(rect.w)}x${Math.round(rect.h)} hash=${rect.hash}`
    clip = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.w)),
      height: Math.max(1, Math.round(rect.h)),
      scale: 1
    }
    console.log(`元素文本: ${String(rect.text).replace(/\n/g, ' | ')}`)
  }

  if (MAXH && clip.height > MAXH) {
    console.log(`  （页面高 ${clip.height}px，按 --maxh=${MAXH} 截断）`)
    clip.height = MAXH
  }

  const shot = await send(ws, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip
  })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log(`截图: ${OUT}\n  ${info}  scale=${SCALE}`)

  ws.close()
  chrome.kill()
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
