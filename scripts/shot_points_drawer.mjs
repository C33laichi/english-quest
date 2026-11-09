/**
 * 截「个人中心 → 总积分明细抽屉」，用于核对历史打卡差额补发是否在界面上正常呈现。
 *
 * 为什么不用 shot_el.mjs：它靠 URL 深链（`/?t=...#/profile`）进入页面，
 * 而当前 dev server 下这种带 query 的深链会被路由兜底到 /home（实测 /game、/stats、
 * /profile 甚至 /quiz/vocab/1 都会）。所以这里改成「先加载站点 → 再改 hash 切路由」，
 * 走的是和用户点侧边栏一样的路径。
 *
 * 用法：node scripts/shot_points_drawer.mjs --out screenshots/x.png
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9362
const BASE = 'http://127.0.0.1:5173'
const USER = 'student'
const PASS = (process.env.EQ_PASS || '')

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  return process.argv[i + 1] ?? def
}
const OUT = arg('out', null)
const THEME = arg('theme', 'light')
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

const udd = mkdtempSync(join(tmpdir(), 'eq-drawer-'))

async function main() {
  mkdirSync(dirname(OUT), { recursive: true })
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
    '--window-size=1440,900', '--force-device-scale-factor=1', '--hide-scrollbars',
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

  // 1. 先加载站点（拿 origin），注入登录态
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
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
      localStorage.setItem('eq_theme', '${THEME}');
      return 'OK';
    })()
  `)
  if (ok !== 'OK') throw new Error('登录失败：' + ok)
  console.log('登录成功')

  // 2. 整页重载一次，保证 store 从 localStorage 重建，然后改 hash 切路由
  await send(ws, 'Page.navigate', { url: `${BASE}/` })
  await sleep(2600)
  console.log('起始 hash:', await ev('location.hash'))

  await ev(`location.hash = '#/profile'; 'set'`)
  await sleep(2000)
  const state = await ev(`JSON.stringify({
    hash: location.hash,
    stats: [...document.querySelectorAll('.mini-stat')].map(e => e.className).join(' ; '),
    total: (document.querySelector('.stat-clickable') || {}).innerText || null
  })`)
  console.log('切换后:', state)
  const st = JSON.parse(state)
  if (!st.stats.includes('stat-clickable')) throw new Error('没找到可点击的总积分卡片')

  // 3. 点开抽屉
  await ev(`document.querySelector('.stat-clickable').click(); 'clicked'`)
  await sleep(1500)

  const drawer = await ev(`(() => {
    const d = document.querySelector('.el-drawer');
    if (!d) return null;
    const rows = [...d.querySelectorAll('.log-item, .log-row, li, .el-table__row')].slice(0, 6)
      .map(r => r.innerText.replace(/\\n/g, ' '));
    return JSON.stringify({
      text: d.innerText.replace(/\\n/g, ' | ').slice(0, 400),
      rect: (() => { const r = d.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()
    });
  })()`)
  if (!drawer) throw new Error('抽屉没打开')
  const dj = JSON.parse(drawer)
  console.log('抽屉内容:', dj.text)
  console.log('抽屉区域:', JSON.stringify(dj.rect))

  const shot = await send(ws, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 1440, height: 900, scale: 1 }
  })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log('截图:', OUT)

  ws.close()
  chrome.kill()
}
main().catch((e) => { console.error('脚本异常:', e.message); process.exit(1) })
