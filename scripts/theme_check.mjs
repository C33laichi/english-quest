/**
 * 主题切换回归验证（零依赖，只用 Node 内置能力 + CDP）
 *
 * 为什么必须用真实浏览器：主题是"CSS 变量 + data-theme 属性"的联动，
 * jsdom / 单元测试里既没有真实的层叠计算，也没有 canvas 重绘，
 * 断言全绿也说明不了任何事。本项目已经吃过两次"断言过、肉眼不对"的亏。
 *
 * 覆盖：
 *   1. 首屏默认主题（未设置偏好时跟随系统）
 *   2. 头像菜单能打开，且主题是三态分段控件
 *   3. 切深色 → data-theme / 背景色 / localStorage 三处同时生效
 *   4. 刷新后仍保持深色（持久化 + 首屏防白闪）
 *   5. 切浅色 → 恢复
 *   6. 「跟随系统」+ 模拟系统深色 → 自动变深
 *   7. 深色下正文对比度是否达标（读真实 computed style 算 WCAG）
 *   8. 关键页面截图（浅色 / 深色各一套）
 *
 * 用法：
 *   1) 先起服务：后端 8090、前端 5173
 *   2) node scripts/theme_check.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'screenshots')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const BASE = 'http://127.0.0.1:5173'

/* ------------------------------------------------------------------ 小工具 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
const fails = []

function ok(label, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`   ✓ ${label}${extra ? '  ' + extra : ''}`)
  } else {
    fail++
    fails.push(label)
    console.log(`   ✗ ${label}${extra ? '  ' + extra : ''}`)
  }
}

function section(t) {
  console.log(`\n${'─'.repeat(64)}\n${t}\n${'─'.repeat(64)}`)
}

/** 相对亮度 / WCAG 对比度（在 Node 侧算，避免页面里再写一遍） */
function srgbToLin(c) {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b)
}
function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 把 'rgb(22, 27, 35)' / 'rgba(…)  ' 解析成 [r,g,b] */
function parseRgb(s) {
  const m = String(s).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (!m) return null
  return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])]
}

/* ------------------------------------------------------------- CDP 客户端 */

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id != null) {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
      } else if (msg.method) {
        const list = this.events.get(msg.method)
        if (list) list.forEach((fn) => fn(msg.params))
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时: ${method}`))
        }
      }, 30000)
    })
  }

  once(method) {
    return new Promise((resolve) => {
      const list = this.events.get(method) || []
      const fn = (p) => {
        this.events.set(
          method,
          (this.events.get(method) || []).filter((f) => f !== fn)
        )
        resolve(p)
      }
      list.push(fn)
      this.events.set(method, list)
    })
  }

  /** 在页面里求值并把结果取回来（函数体字符串，必须自带 return） */
  async eval(fnBody) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${fnBody} })()`,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails) {
      throw new Error(
        '页面执行异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails)
      )
    }
    return r.result.value
  }

  async goto(url, waitMs = 900) {
    /*
     * 关键：本项目是 hash 路由，如果只改 hash 部分，浏览器**不会重新加载文档**，
     *   · index.html 里防止首屏白闪的内联脚本不会再跑
     *   · Pinia 的 theme store 也不会重建，仍然拿旧的偏好
     * 于是"切换后刷新"这类断言会在没真正刷新的情况下通过，形成假绿。
     * 统一追加一个每次都变的 query 参数，保证每次都是真正的整页加载。
     */
    this._nav = (this._nav || 0) + 1
    const [head, hash] = url.split('#')
    const real = `${head}${head.includes('?') ? '&' : '?'}_nav=${this._nav}${hash ? '#' + hash : ''}`
    const loaded = this.once('Page.loadEventFired')
    await this.send('Page.navigate', { url: real })
    await Promise.race([loaded, sleep(8000)])
    await sleep(waitMs)
  }

  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(SHOTS, file), Buffer.from(r.data, 'base64'))
    return file
  }
}

/* ------------------------------------------------------------------ 主流程 */

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  const profile = mkdtempSync(join(tmpdir(), 'eq-theme-'))

  console.log('启动 Chrome（headless）…')
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1440,900',
      '--hide-scrollbars',
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  let targets = null
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) {
        targets = page
        break
      }
    } catch (e) {
      /* Chrome 还没起来，继续等 */
    }
  }
  if (!targets) {
    chrome.kill()
    throw new Error('Chrome 调试端口未就绪')
  }

  const ws = new WebSocket(targets.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })

  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  })

  try {
    await run(cdp)
  } finally {
    try {
      ws.close()
    } catch (e) {}
    chrome.kill()
    await sleep(500)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch (e) {}
  }

  section('结果')
  console.log(`  通过 ${pass} 项，失败 ${fail} 项`)
  if (fail) {
    console.log('  失败清单：')
    fails.forEach((f) => console.log('   - ' + f))
    process.exitCode = 1
  } else {
    console.log('  ✓ 全部通过')
  }
  console.log()
}

async function run(cdp) {
  /* ---------- 0. 登录并写入会话 ---------- */
  section('0. 准备登录态')
  await cdp.goto(`${BASE}/#/login`, 600)
  const login = await cdp.eval(`
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student', password: '' })
    })
    const j = await r.json()
    const d = j.data || j
    localStorage.setItem('eq_token', d.token)
    localStorage.setItem('eq_user', JSON.stringify({
      userId: d.userId, username: d.username, nickname: d.nickname,
      role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
    }))
    localStorage.removeItem('eq_theme')
    return { code: j.code, hasToken: !!d.token, nickname: d.nickname }
  `)
  ok('登录并写入 localStorage', login.hasToken, JSON.stringify(login))

  /* ---------- 1. 默认主题 = 跟随系统（未设置偏好） ---------- */
  section('1. 首屏默认主题')
  await cdp.goto(`${BASE}/#/home`)
  const t0 = await cdp.eval(`
    return {
      theme: document.documentElement.dataset.theme,
      colorScheme: document.documentElement.style.colorScheme,
      stored: localStorage.getItem('eq_theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor
    }
  `)
  ok('未设偏好时按当前系统主题渲染', ['light', 'dark'].includes(t0.theme), `data-theme=${t0.theme}`)
  ok('localStorage 未写入偏好', t0.stored === null, `eq_theme=${t0.stored}`)

  // 系统浅色（默认）
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }]
  })
  await cdp.goto(`${BASE}/#/home`)
  const lightHome = await cdp.eval(`
    return {
      theme: document.documentElement.dataset.theme,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      cardBg: getComputedStyle(document.querySelector('.card') || document.body).backgroundColor
    }
  `)
  ok('系统浅色 → data-theme=light', lightHome.theme === 'light', `bodyBg=${lightHome.bodyBg}`)

  /* ---------- 2. 头像菜单 ---------- */
  section('2. 头像菜单（含主题三态）')
  const menu = await cdp.eval(`
    const trigger = document.querySelector('.side-user')
    if (!trigger) return { found: false }
    trigger.click()
    await new Promise(r => setTimeout(r, 350))
    const popper = document.querySelector('.user-menu-popper')
    const opts = Array.from(popper ? popper.querySelectorAll('.theme-opt') : [])
    return {
      found: true,
      popperVisible: !!popper,
      title: trigger.getAttribute('title'),
      rows: Array.from(popper ? popper.querySelectorAll('.user-menu-row') : []).map(e => e.innerText.trim()),
      groupLabel: popper ? (popper.querySelector('.user-menu-group')?.innerText || '').trim() : '',
      themeLabel: popper ? (popper.querySelector('.theme-row > span')?.innerText || '').trim() : '',
      optCount: opts.length,
      optTitles: opts.map(e => e.getAttribute('title')),
      onIndex: opts.findIndex(e => e.classList.contains('on')),
      radius: popper ? getComputedStyle(popper).borderRadius : ''
    }
  `)
  ok('侧栏头像可点击并弹出面板', menu.found && menu.popperVisible, `title=${menu.title}`)
  ok('主题控件是 3 态分段控件', menu.optCount === 3, `选项=${JSON.stringify(menu.optTitles)}`)
  ok('默认选中「跟随系统」（第 1 个）', menu.onIndex === 0, `onIndex=${menu.onIndex}`)
  ok('分组标题为「偏好设置」', menu.groupLabel === '偏好设置', `"${menu.groupLabel}"`)
  ok('行标签为「主题」', menu.themeLabel === '主题', `"${menu.themeLabel}"`)
  ok('菜单包含退出登录', menu.rows.some((r) => r.includes('退出登录')), `行=${JSON.stringify(menu.rows)}`)
  ok('菜单包含快捷键入口', menu.rows.some((r) => r.includes('快捷键')))
  ok('面板圆角走 token（10px）', menu.radius === '10px', `radius=${menu.radius}`)
  await cdp.shot('34-主题-头像菜单-浅色.png')

  /* ---------- 3. 切深色 ---------- */
  section('3. 切到深色')
  const dark = await cdp.eval(`
    const opts = document.querySelectorAll('.user-menu-popper .theme-opt')
    opts[2].click()
    await new Promise(r => setTimeout(r, 450))
    const bg = getComputedStyle(document.body).backgroundColor
    return {
      theme: document.documentElement.dataset.theme,
      colorScheme: document.documentElement.style.colorScheme,
      stored: localStorage.getItem('eq_theme'),
      bodyBg: bg,
      bodyRgb: (bg.match(/\\d+/g) || []).slice(0,3).map(Number),
      cardBg: getComputedStyle(document.querySelector('.card') || document.body).backgroundColor,
      onIndex: Array.from(document.querySelectorAll('.user-menu-popper .theme-opt'))
                 .findIndex(e => e.classList.contains('on'))
    }
  `)
  ok('data-theme 变为 dark', dark.theme === 'dark')
  ok('color-scheme 同步（滚动条/原生控件）', dark.colorScheme === 'dark', `colorScheme=${dark.colorScheme}`)
  ok('偏好写入 localStorage', dark.stored === 'dark', `eq_theme=${dark.stored}`)
  const bodyDark = luminance(dark.bodyRgb)
  ok('页面底色确实变深', bodyDark < 0.05, `bodyBg=${dark.bodyBg} L=${bodyDark.toFixed(4)}`)
  ok('分段控件选中项切到第 3 个', dark.onIndex === 2, `onIndex=${dark.onIndex}`)
  await cdp.shot('35-主题-头像菜单-深色.png')

  /* ---------- 4. 刷新后保持 ---------- */
  section('4. 刷新后仍为深色（持久化 + 首屏防白闪）')
  await cdp.goto(`${BASE}/#/home`)
  const afterReload = await cdp.eval(`
    return {
      theme: document.documentElement.dataset.theme,
      stored: localStorage.getItem('eq_theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      headerVisible: !!document.querySelector('.side-brand')
    }
  `)
  ok('刷新后 data-theme 仍为 dark', afterReload.theme === 'dark')
  ok('刷新后偏好仍在', afterReload.stored === 'dark')
  ok('侧栏正常渲染（未白屏）', afterReload.headerVisible)

  /* ---------- 5. 深色下的可读性 ---------- */
  section('5. 深色下的实际对比度（读真实 computed style）')
  const contrastProbe = await cdp.eval(`
    function rgb(s){ const m = String(s).match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)/); return m ? [+m[1],+m[2],+m[3]] : null }
    function bgOf(el){
      let n = el
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor
        if (c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c
        n = n.parentElement
      }
      return getComputedStyle(document.body).backgroundColor
    }
    const card = document.querySelector('.card')
    const pageTitle = document.querySelector('.page-title') || document.querySelector('h1')
    const muted = document.querySelector('.muted') || document.querySelector('.page-desc')
    const chip = document.querySelector('.chip')
    const out = {}
    for (const [k, el] of [['card','card'],['title',pageTitle],['muted',muted],['chip',chip]]) {
      if (!el || el === 'card') continue
      out[k] = { fg: getComputedStyle(el).color, bg: bgOf(el) }
    }
    out.cardBg = card ? getComputedStyle(card).backgroundColor : null
    out.cardBorder = card ? getComputedStyle(card).borderTopColor : null
    out.text = getComputedStyle(document.body).color
    out.bodyBg = getComputedStyle(document.body).backgroundColor
    out.accentVar = getComputedStyle(document.documentElement).getPropertyValue('--eq-accent').trim()
    out.primaryVar = getComputedStyle(document.documentElement).getPropertyValue('--eq-primary').trim()
    return out
  `)

  const pairs = []
  if (contrastProbe.text && contrastProbe.bodyBg) {
    pairs.push(['正文 / 页底', contrastProbe.text, contrastProbe.bodyBg])
  }
  for (const k of ['title', 'muted', 'chip']) {
    const v = contrastProbe[k]
    if (v?.fg && v?.bg) pairs.push([`${k} / 其底色`, v.fg, v.bg])
  }
  for (const [label, fg, bg] of pairs) {
    const a = parseRgb(fg)
    const b = parseRgb(bg)
    if (!a || !b) continue
    const r = contrast(a, b)
    ok(`${label} 对比度 ≥ 4.5:1`, r >= 4.5, `${r.toFixed(2)}:1  (${fg} on ${bg})`)
  }
  ok('--eq-accent 在深色下已翻转为亮靛蓝', contrastProbe.accentVar === '#a5b4fc', contrastProbe.accentVar)
  ok('--eq-primary 保持填充色不变', contrastProbe.primaryVar === '#4f46e5', contrastProbe.primaryVar)

  /*
   * 禁用态按钮单独探一下。
   * WCAG 正式豁免禁用控件，但"已打卡""下一题"这类文案本身是有信息量的，
   * 低到看不见就等于没写。Element Plus 默认的禁用配色是浅灰底 + 白字，
   * 深色主题下必须由我们接管，所以这里把它量化出来而不是凭肉眼看截图。
   */
  const disabledBtn = await cdp.eval(`
    const btn = document.querySelector('.el-button.is-disabled')
    if (!btn) return null
    return {
      text: (btn.innerText || '').trim().slice(0, 12),
      cls: btn.className,
      color: getComputedStyle(btn).color,
      bg: getComputedStyle(btn).backgroundColor
    }
  `)
  if (disabledBtn) {
    const a = parseRgb(disabledBtn.color)
    const b = parseRgb(disabledBtn.bg)
    const r = a && b ? contrast(a, b) : 0
    ok(`禁用按钮「${disabledBtn.text}」文字可读（≥ 3:1）`, r >= 3,
       `${r.toFixed(2)}:1  (${disabledBtn.color} on ${disabledBtn.bg})`)
  }
  await cdp.goto(`${BASE}/#/quiz/vocab/1`, 1500)
  const disabledBtn2 = await cdp.eval(`
    const btn = document.querySelector('.el-button.is-disabled')
    if (!btn) return null
    return {
      text: (btn.innerText || '').trim().slice(0, 12),
      color: getComputedStyle(btn).color,
      bg: getComputedStyle(btn).backgroundColor
    }
  `)
  if (disabledBtn2) {
    const a = parseRgb(disabledBtn2.color)
    const b = parseRgb(disabledBtn2.bg)
    const r = a && b ? contrast(a, b) : 0
    ok(`答题页禁用按钮「${disabledBtn2.text}」文字可读（≥ 3:1）`, r >= 3,
       `${r.toFixed(2)}:1  (${disabledBtn2.color} on ${disabledBtn2.bg})`)
  }

  /* ---------- 6. 关键页面：深色 / 浅色成对截图 ---------- */
  // 浅色与深色拍同一批页面，方便并排对比，避免"只看了深色没发现浅色被改坏"
  const PAGES = [
    ['/home', '首页'],
    ['/stats', '学习看板'],
    ['/grammar', '语法路线'],
    ['/listen', '听力关卡'],
    ['/profile', '个人中心'],
    ['/error-book', '错题本'],
    ['/quiz/vocab/1', '词汇答题页']
  ]

  section('6. 深色主题页面截图 + 漏白检查')
  for (const [i, [path, name]] of PAGES.entries()) {
    await cdp.goto(`${BASE}/#${path}`, 1600)
    const info = await cdp.eval(`
      return {
        theme: document.documentElement.dataset.theme,
        // 路由是 hash 模式，必须核对真实的 hash，
        // 否则 /stats 会被兜到 /home，后面所有断言都落在首页上、变成假绿
        hash: location.hash,
        bg: getComputedStyle(document.body).backgroundColor,
        cards: document.querySelectorAll('.card, .mini-stat, .listen-card, .level-item').length,
        // 页面上任何"漏白"的元素都会在这里露出来
        whiteLeft: Array.from(document.querySelectorAll('.card, .mini-stat, .listen-card, .level-item, .keybar, .option, .judge, .quiz-bar, .el-tag, .el-button'))
          .filter(e => {
            const c = getComputedStyle(e).backgroundColor
            return /rgb\\(255, 255, 255\\)|rgb\\(244, 244, 245\\)|rgb\\(200, 201, 204\\)/.test(c)
          }).length
      }
    `)
    await cdp.shot(`${36 + i}-主题-深色-${name}.png`)
    ok(`深色 ${path} 路由正确`, info.hash === `#${path}`, `hash=${info.hash}`)
    ok(`深色 ${path} 无漏白`, info.theme === 'dark' && info.whiteLeft === 0,
       `bg=${info.bg} 模块=${info.cards} 漏白=${info.whiteLeft}`)
  }

  /* ---------- 7. 切回浅色 ---------- */
  section('7. 切回浅色（并成对截图）')
  // 上一步最后停在沉浸式答题页，那里没有侧边栏、也就没有头像菜单，
  // 必须先回到带壳页面才能通过 UI 切主题。
  await cdp.goto(`${BASE}/#/home`, 1200)
  const backLight = await cdp.eval(`
    document.querySelector('.side-user').click()
    await new Promise(r => setTimeout(r, 350))
    const opts = document.querySelectorAll('.user-menu-popper .theme-opt')
    opts[1].click()
    await new Promise(r => setTimeout(r, 400))
    const bg = getComputedStyle(document.body).backgroundColor
    return {
      theme: document.documentElement.dataset.theme,
      stored: localStorage.getItem('eq_theme'),
      bodyBg: bg,
      bodyRgb: (bg.match(/\\d+/g) || []).slice(0,3).map(Number)
    }
  `)
  ok('切浅色后 data-theme=light', backLight.theme === 'light')
  ok('浅色偏好已持久化', backLight.stored === 'light')
  ok('页面底色恢复浅色', luminance(backLight.bodyRgb) > 0.8,
     `bodyBg=${backLight.bodyBg} L=${luminance(backLight.bodyRgb).toFixed(3)}`)

  for (const [i, [path, name]] of PAGES.entries()) {
    await cdp.goto(`${BASE}/#${path}`, 1500)
    const info = await cdp.eval(`
      const bg = getComputedStyle(document.body).backgroundColor
      return {
        theme: document.documentElement.dataset.theme,
        lum: (function () {
          const m = bg.match(/\\d+/g).slice(0,3).map(Number)
          const lin = c => { c/=255; return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4) }
          return 0.2126*lin(m[0]) + 0.7152*lin(m[1]) + 0.0722*lin(m[2])
        })()
      }
    `)
    await cdp.shot(`${43 + i}-主题-浅色-${name}.png`)
    ok(`浅色 ${path} 仍是浅色底`, info.theme === 'light' && info.lum > 0.8, `L=${info.lum.toFixed(3)}`)
  }

  // 跟随系统 + 模拟系统深色
  section('8. 「跟随系统」响应系统变化')
  // 同样：上一步最后一张截图停在答题页，先回带壳页面再点头像菜单
  await cdp.goto(`${BASE}/#/home`, 1200)
  const sys = await cdp.eval(`
    document.querySelector('.side-user').click()
    await new Promise(r => setTimeout(r, 350))
    const opts = document.querySelectorAll('.user-menu-popper .theme-opt')
    opts[0].click()
    await new Promise(r => setTimeout(r, 400))
    return { theme: document.documentElement.dataset.theme, stored: localStorage.getItem('eq_theme') }
  `)
  ok('选「跟随系统」后偏好 = system', sys.stored === 'system')
  ok('系统当前为浅色 → 实际浅色', sys.theme === 'light', `data-theme=${sys.theme}`)

  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }]
  })
  await sleep(600)
  const sysDark = await cdp.eval(`
    return {
      theme: document.documentElement.dataset.theme,
      stored: localStorage.getItem('eq_theme')
    }
  `)
  ok('系统切深色 → 免刷新自动跟随', sysDark.theme === 'dark',
     `data-theme=${sysDark.theme}（偏好仍为 ${sysDark.stored}）`)

  /* ---------- 9. 深色下的图表重绘 ---------- */
  section('9. ECharts 随主题重绘（学习看板）')
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }]
  })
  await cdp.goto(`${BASE}/#/home`, 1200)
  await cdp.eval(`
    document.querySelector('.side-user').click()
    await new Promise(r => setTimeout(r, 300))
    document.querySelectorAll('.user-menu-popper .theme-opt')[1].click()
    await new Promise(r => setTimeout(r, 300))
    document.querySelector('.side-user').click()
    await new Promise(r => setTimeout(r, 200))
  `)
  await cdp.goto(`${BASE}/#/stats`, 1500)
  /*
   * dev 模式下 echarts 是个 1MB 的裸包，首次访问 /stats 时 Vite 要现场
   * 转换依赖，图表 canvas 可能要好几秒才出现。这里必须轮询等待，
   * 写死一个 sleep 会变成"跑十次红三次"的偶发失败。
   */
  async function waitCanvas(ms = 25000) {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const r = await cdp.eval(`
        const host = document.querySelector('.chart-heat')
        const c = host ? host.querySelector('canvas') : null
        return { host: !!host, has: !!c, w: c ? c.width : 0, h: c ? c.height : 0 }
      `)
      if (r.has && r.w > 0) return r
      await sleep(400)
    }
    return await cdp.eval(`
      const host = document.querySelector('.chart-heat')
      const c = host ? host.querySelector('canvas') : null
      return { host: !!host, has: !!c, w: c ? c.width : 0, h: c ? c.height : 0 }
    `)
  }

  const lightCell = await waitCanvas()
  ok('浅色下图表 canvas 已渲染', lightCell.has && lightCell.w > 0,
     `host=${lightCell.host} ${lightCell.w}x${lightCell.h}`)

  const darkPixel = await cdp.eval(`
    document.querySelector('.side-user').click()
    await new Promise(r => setTimeout(r, 400))
    const opts = document.querySelectorAll('.user-menu-popper .theme-opt')
    opts[2].click()
    // 主题切换后 Stats 会 dispose + 重建图表，留足重绘时间
    await new Promise(r => setTimeout(r, 2500))
    const c = document.querySelector('.chart-heat canvas')
    if (!c) return { ok: false }
    const ctx = c.getContext('2d')
    // 取画布中部一行的像素，统计"明显是白"和"明显是深色"的比例
    const row = ctx.getImageData(0, Math.floor(c.height * 0.5), c.width, 1).data
    let darkPixels = 0, whitePixels = 0, opaque = 0
    for (let i = 0; i < row.length; i += 4) {
      const [r, g, b, a] = [row[i], row[i+1], row[i+2], row[i+3]]
      if (a < 10) continue
      opaque++
      if (r > 245 && g > 245 && b > 245) whitePixels++
      if (r < 120 && g < 130 && b < 180) darkPixels++
    }
    return { ok: true, theme: document.documentElement.dataset.theme, darkPixels, whitePixels, opaque, w: c.width }
  `)
  ok('切深色后图表重绘（画面不是白的）',
     darkPixel.ok && darkPixel.whitePixels === 0 && darkPixel.darkPixels > 0,
     darkPixel.ok
       ? `theme=${darkPixel.theme} 不透明像素=${darkPixel.opaque} 深色像素=${darkPixel.darkPixels} 白像素=${darkPixel.whitePixels}`
       : 'canvas 不存在')

  /*
   * 纯黑像素守卫。
   * ECharts 拿到解析不了的颜色字符串（最典型的就是忘了把 var(--x) 换成真实色值）
   * 不会报错，而是**静默 fallback 成纯黑** —— 本项目热力图"整片黑"就是这么来的。
   * 三个图表都扫一遍，命中纯黑即视为色值没解析成功。
   * 注意要两个主题都扫：浅色主题下黑色同样不正常。
   */
  async function countBlack(themeLabel) {
    const r = await cdp.eval(`
      const hosts = ['.chart-heat', '.chart-grid .chart']
      const out = []
      for (const sel of hosts) {
        const nodes = document.querySelectorAll(sel)
        nodes.forEach((host, i) => {
          const c = host.querySelector('canvas')
          if (!c) return
          const ctx = c.getContext('2d')
          const d = ctx.getImageData(0, 0, c.width, c.height).data
          let black = 0, opaque = 0
          for (let k = 0; k < d.length; k += 4 * 7) {   // 抽样，跳着读够用了
            if (d[k + 3] < 200) continue
            opaque++
            if (d[k] < 8 && d[k + 1] < 8 && d[k + 2] < 8) black++
          }
          out.push({ sel, i, black, opaque })
        })
      }
      return out
    `)
    const bad = r.filter((x) => x.black > 0)
    ok(`${themeLabel}：三个图表均无"解析失败变纯黑"`,
       bad.length === 0,
       r.map((x) => `${x.sel}[${x.i}] 采样${x.opaque} 黑${x.black}`).join('  '))
  }
  await countBlack('深色主题')

  // 切回浅色再扫一次，确认浅色主题同样没有黑色 fallback
  await cdp.goto(`${BASE}/#/home`, 1200)
  await cdp.eval(`
    document.querySelector('.side-user').click()
    await new Promise(r => setTimeout(r, 400))
    document.querySelectorAll('.user-menu-popper .theme-opt')[1].click()
    await new Promise(r => setTimeout(r, 400))
  `)
  await cdp.goto(`${BASE}/#/stats`, 1500)
  await waitCanvas(15000)
  await sleep(800)
  await countBlack('浅色主题')
  await cdp.shot('50-主题-深色-学习看板-图表随主题重绘.png')
}

main().catch((e) => {
  console.error('\n脚本异常:', e.message)
  process.exitCode = 1
})
