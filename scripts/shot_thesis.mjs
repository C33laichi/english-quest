/**
 * 毕设说明书配图批量截图（零依赖 CDP）
 *
 * 一次性启动 Chrome，按顺序登录学生/管理员账号，逐个路由截「屏幕尺寸」图，
 * 直接输出到 毕设说明书配图/ 下，文件名与说明书图题一一对应。
 *
 * 用法：node scripts/shot_thesis.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9351
const OUT_DIR = 'D:/WorkBuddy/WorkPlace/毕设说明书配图'
const W = 1440
const H = 900

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

const userDataDir = mkdtempSync(join(tmpdir(), 'eq-thesis-'))

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

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
    if (r.exceptionDetails) {
      throw new Error('页面脚本异常: ' + JSON.stringify(r.exceptionDetails.exception?.description))
    }
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
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false
  })

  /** 用 fetch 拿 token 并写进 localStorage，绕开登录表单，保证每个页面都带登录态 */
  async function login(user, pass) {
    await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
    await sleep(2000)
    const r = await evaluate(`
      (async () => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '${user}', password: '${pass}' })
        });
        const b = await res.json();
        if (b.code !== 200) return 'FAIL:' + b.msg;
        const d = b.data;
        localStorage.setItem('eq_token', d.token);
        localStorage.setItem('eq_user', JSON.stringify({
          userId: d.userId, username: d.username, nickname: d.nickname,
          role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
        }));
        localStorage.setItem('eq_theme', 'light');
        return 'OK:' + d.role;
      })()
    `)
    console.log(`  登录 ${user} -> ${r}`)
    if (String(r).startsWith('FAIL')) throw new Error(`登录失败：${r}`)
  }

  /** 把视口撑到整页高再截图：100vh 的侧栏会跟着拉伸，避免整页截图下方出现白条 */
  async function captureTo(outName, maxh = 2000) {
    const doc = await evaluate(
      `JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, hash: location.hash, title: document.title })`
    )
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
      width: W,
      height: Math.max(H, Math.min(doc.h, maxh)),
      deviceScaleFactor: 1,
      mobile: false
    })
    await sleep(800)
    const doc2 = await evaluate(`JSON.stringify({ h: document.documentElement.scrollHeight })`)
    const clipH = Math.max(1, Math.min(doc2.h, maxh))
    const clip = { x: 0, y: 0, width: W, height: clipH, scale: 1 }
    const r = await send(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip
    })
    writeFileSync(join(OUT_DIR, outName), Buffer.from(r.data, 'base64'))
    // 恢复标准视口，避免影响下一页的排版
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile: false
    })
    await sleep(300)
    console.log(
      `  ✔ ${outName}  视口 ${W}x${H}  页高 ${doc.h}/${doc2.h}  截图高 ${clipH}  hash=${doc.hash}  「${doc.title}」`
    )
  }

  // maxh 默认放大到 2000：宁可图高一点，也不能把页面下半部分（图表/卡片）截掉
  async function shot(pathname, outName, { wait = 0, maxh = 2000 } = {}) {
    // hash 路由只改 hash 不会重载，必须带变动 query 强制整页加载
    await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#${pathname}` })
    await sleep(3200)
    if (wait) await sleep(wait)
    await sleep(500)
    await captureTo(outName, maxh)
  }

  console.log('\n== 学生端 ==')
  await login(os.environ.get('EQ_USER', 'student'), os.environ.get('EQ_PASS', ''))

  // 图 3-3 系统首页 = 图 4-2 学习主界面（同一页面，分别用于第 3 章与第 4 章）
  await shot('/home', '图3-3_系统首页.png')
  await shot('/home', '图4-2_学习主界面（闯关地图）.png')

  // 图 4-3 词汇闯关答题界面（无开始按钮，直接进答题态）
  await shot('/quiz/vocab/1', '图4-3_词汇闯关答题界面.png', { wait: 800 })

  // 图 4-4 语法闯关答题界面（需点「开始测验」进入答题态）
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/lesson/2` })
  await sleep(3200)
  const clicked = await evaluate(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => (x.innerText || '').includes('开始测验'));
      if (!b) return 'NOBTN:' + btns.map((x) => x.innerText.trim()).join('|');
      b.click();
      return 'CLICKED';
    })()
  `)
  console.log(`  语法页开始测验按钮: ${clicked}`)
  await sleep(1200)
  await captureTo('图4-4_语法闯关答题界面.png')

  await shot('/listen/2/EASY', '图4-5_听力听写界面.png', { wait: 800 })

  // 图 4-6 AI 智能练习界面（先选一道错题 -> 生成同型题 -> 作答，露出解析框）
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/ai` })
  await sleep(3600)
  const pick = await evaluate(`
    (() => {
      const items = [...document.querySelectorAll('.pick-item')];
      if (!items.length) return 'NO_ERROR_ITEMS';
      items[0].click();
      return 'PICKED:' + items.length;
    })()
  `)
  console.log(`  AI 选错题: ${pick}`)
  await sleep(600)
  await evaluate(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('生成同型题'));
      if (b) b.click();
      return 'CLICKED';
    })()
  `)
  // 等结果渲染（本地生成通常 1~3 秒）
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
  await sleep(700)
  await captureTo('图4-6_AI智能练习界面.png')

  // 图 4-7 错题本界面（切到「词汇」筛选，只截到第 6 张卡片底边，避免拉成长条）
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/error-book` })
  await sleep(4000)
  const ebPicked = await evaluate(`
    (() => {
      const btns = [...document.querySelectorAll('.el-radio-button__inner')];
      const b = btns.find((x) => (x.innerText || '').trim() === '词汇');
      if (!b) return 'NO_BTN:' + btns.map((x) => x.innerText.trim()).join('|');
      b.click();
      return 'CLICKED';
    })()
  `)
  console.log(`  错题本筛选: ${ebPicked}`)
  await sleep(1800)
  const ebCnt = await evaluate(`document.querySelectorAll('.error-card').length`)
  console.log(`  错题卡片数 = ${ebCnt}`)
  const ebBox = await evaluate(`
    JSON.stringify((() => {
      const cs = [...document.querySelectorAll('.error-card')];
      if (!cs.length) return { h: 900 };
      const r = cs.length >= 6 ? cs[5].getBoundingClientRect() : cs[cs.length - 1].getBoundingClientRect();
      return { h: Math.round(r.bottom + window.scrollY + 26) };
    })())
  `)
  const ebDoc = await evaluate(`JSON.stringify({ h: document.documentElement.scrollHeight })`)
  const ebClipH = Math.max(600, Math.min(ebBox.h, ebDoc.h))
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: W, height: ebClipH, deviceScaleFactor: 1, mobile: false })
  await sleep(800)
  const ebShot = await send(ws, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: W, height: ebClipH, scale: 1 }
  })
  writeFileSync(join(OUT_DIR, '图4-7_错题本界面.png'), Buffer.from(ebShot.data, 'base64'))
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await sleep(300)
  console.log(`  ✔ 图4-7_错题本界面.png  页高 ${ebDoc.h}  截图高 ${ebClipH}`)

  await shot('/game', '图4-8_游戏中心界面.png')
  await shot('/stats', '图4-9_学习数据看板界面.png')
  await shot('/profile', '图4-10_个人中心界面.png')

  // 图 4-1 系统登录界面（换个干净的用户目录状态：清掉本地登录态后截登录页）
  await evaluate(`localStorage.removeItem('eq_token'); localStorage.removeItem('eq_user'); 'CLEARED'`)
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/login` })
  await sleep(3000)
  await captureTo('图4-1_系统登录界面.png')

  console.log('\n== 管理端 ==')
  await login((process.env.EQ_USER || 'admin'), (process.env.EQ_ADMIN_PASS || ''))
  await shot('/admin/dashboard', '图4-11_后台管理界面.png')

  ws.close()
  chrome.kill()
  console.log('\n全部截图完成 ->', OUT_DIR, '\n')
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
