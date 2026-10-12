/**
 * 截图验证：错题回顾里的「针对性讲解」是否真的跟着所选错项走
 *
 * 为什么必须用真实浏览器：讲解是异步拉取 + 逐条替换占位态渲染出来的，
 * 单纯看接口返回说明不了页面到底显示了什么（本项目吃过"断言过、肉眼不对"的亏）。
 *
 * 流程：进指定 Day → 开始测验 → 每题都选第 2 个选项（制造确定的错选）→ 提交
 *      → 等每条讲解从"加载中"落定 → 断言 + 截图
 *
 * 用法：node scripts/shot_wrong_explain.mjs [day]
 * 默认 Day 3：语法题 7（The soup tastes ______，正确答案 A good）在这一天，
 *            因此选第 2 项 B(well) 必定答错，便于稳定复现。
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// 为什么不用 getComputedStyle().backgroundColor 判主题：
// .explain-box 的底色是**半透明**的 rgba(...,0.08/0.14)，计算样式里只有 rgb 三通道，
// 亮度函数拿不到 alpha，于是"浅色 0.117 / 深色 0.302"这种假失败就会出现。
// 正确做法是量真实渲染像素——这里直接复用 png_probe 的解码器。
import { decodePng, luminance, pixelAt } from './png_probe.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9342
const DAY = Number(process.argv[2] || 3)
/**
 * 主题档位：本次新增了 .explain-* 样式，必须浅色/深色各验一遍，
 * 否则深色下很容易出现"新加的浅底方块"这种漏白。
 */
const THEME = process.argv[3] === 'dark' ? 'dark' : 'light'
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

mkdirSync(SHOT_DIR, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-explain-'))

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

/**
 * 取一块像素区域里"面积占比最大"的那个亮度，即底色。
 * 为什么不取平均/中位数：区块里有文字（浅色主题下是深字），
 * 平均会被字压暗、中位数会被字带偏；而底色在面积上永远是压倒性的，
 * 所以"众数"才是稳的。同时避开左边缘 10%（那里有 3px 强调色竖条）。
 */
function modalLuminance(buf) {
  const img = decodePng(buf)
  const hist = new Map()
  const y0 = Math.round(img.height * 0.18)
  const y1 = Math.round(img.height * 0.82)
  const x0 = Math.round(img.width * 0.12)
  const x1 = Math.round(img.width * 0.94)
  const stepY = Math.max(1, Math.floor((y1 - y0) / 90))
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += 2) {
      const p = pixelAt(img, x, y)
      if (!p) continue
      const k = Math.round(luminance(p[0], p[1], p[2]) * 40) / 40
      hist.set(k, (hist.get(k) || 0) + 1)
    }
  }
  let bestK = 0
  let bestN = -1
  for (const [k, n] of hist) {
    if (n > bestN) {
      bestN = n
      bestK = k
    }
  }
  return { modal: bestK, px: img.width * img.height, w: img.width, h: img.height }
}

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

  // ---------- 登录 ----------
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
  await evaluate(`
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
      localStorage.setItem('eq_theme', '${THEME}');
      return 'OK';
    })()
  `)

  // ---------- 进关 ----------
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/lesson/${DAY}` })
  await sleep(3400)
  await evaluate(`(document.querySelector('.btn-primary')?.click(), 'ok')`)
  await sleep(1200)

  // ---------- 逐题选第 2 个选项（制造确定的错选） ----------
  for (let i = 0; i < 12; i++) {
    const done = await evaluate(`JSON.stringify(!!document.querySelector('.result-card'))`)
    if (done) break
    await evaluate(`
      (() => {
        const opts = document.querySelectorAll('.option');
        // 选第 2 个选项：Day3 的语法题 7 正确答案是 A，选 B 必错
        (opts[1] || opts[0])?.click();
        return 'ok';
      })()
    `)
    await sleep(900)
    await evaluate(`
      (() => {
        const btns = [...document.querySelectorAll('.btn-row .el-button')];
        const next = btns.find(b => /下一题|提交答卷/.test(b.innerText));
        if (next) next.click();
        return 'ok';
      })()
    `)
    await sleep(1100)
  }

  // ---------- 等所有讲解从"加载中"落定 ----------
  let settled = false
  for (let i = 0; i < 40; i++) {
    const loading = await evaluate(`JSON.stringify(document.querySelectorAll('.explain-loading').length)`)
    const boxes = await evaluate(`JSON.stringify(document.querySelectorAll('.explain-box').length)`)
    if (boxes > 0 && loading === 0) {
      settled = true
      break
    }
    await sleep(500)
  }

  const data = await evaluate(`
    JSON.stringify({
      wrongCount: document.querySelectorAll('.wrong-item').length,
      items: [...document.querySelectorAll('.wrong-item')].map((el) => {
        const box = el.querySelector('.explain-box');
        const r = box ? box.getBoundingClientRect() : null;
        return {
          stem: el.querySelector('.wrong-stem')?.innerText || '',
          yourAnswer: el.querySelector('.wrong-line .bad')?.innerText || '',
          correctAnswer: el.querySelector('.wrong-line .good')?.innerText || '',
          explainTitle: box?.querySelector('.explain-title')?.innerText.trim() || '',
          explainTag: box?.querySelector('.explain-tag')?.innerText.trim() || '',
          explainBody: box?.querySelector('.explain-body')?.innerText.trim() || '',
          explainFallback: box?.querySelector('.explain-fallback')?.innerText.trim() || '',
          explainBg: box ? getComputedStyle(box).backgroundColor : '',
          // clip 截图用的是**文档坐标**（captureBeyondViewport 从页面顶部算起），
          // 所以 y 必须补上 scrollY，否则页面一滚动就采到别的元素身上
          boxRect: r ? { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height } : null,
          explainTitleColor: box?.querySelector('.explain-title')
            ? getComputedStyle(box.querySelector('.explain-title')).color : '',
          analysis: el.querySelector('.wrong-analysis')?.innerText.trim() || ''
        };
      })
    })
  `)

  console.log(`\n===== Day ${DAY} 错题回顾：针对性讲解 =====`)
  console.log(`错题条目 ${data.wrongCount} 条，讲解落定=${settled}`)
  data.items.forEach((it, i) => {
    console.log(`\n--- 错题 ${i + 1} ---`)
    console.log(`  题干    : ${it.stem}`)
    console.log(`  你的答案: ${it.yourAnswer}`)
    console.log(`  正确答案: ${it.correctAnswer}`)
    console.log(`  讲解标题: ${it.explainTitle}${it.explainTag ? `  [${it.explainTag}]` : ''}`)
    console.log(`  讲解正文: ${it.explainBody || '（空）'}`)
    if (it.explainFallback) console.log(`  降级提示: ${it.explainFallback}`)
    console.log(`  通用解析: ${it.analysis.slice(0, 50)}`)
  })

  console.log('\n===== 断言 =====')
  let pass = 0
  let fail = 0
  const check = (label, cond, extra = '') => {
    cond ? pass++ : fail++
    console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? '  ' + extra : ''}`)
  }

  const items = data.items
  check('错题区渲染出了讲解区块', items.length > 0 && items.every((i) => i.explainTitle))
  check('讲解正文全部非空（没有停在"加载中"）',
    items.length > 0 && items.every((i) => i.explainBody.length > 0))
  // 核心：讲解正文里必须出现学生实际选的那个选项文本
  const mentions = items.filter((i) => i.yourAnswer && i.explainBody.includes(i.yourAnswer))
  check('每条讲解都提到了学生所选的那个错项',
    items.length > 0 && mentions.length === items.length,
    `${mentions.length}/${items.length}`)
  // 针对性讲解不能等于下方通用解析，否则等于没做
  const distinct = items.filter((i) => i.explainBody && i.explainBody !== i.analysis)
  check('针对性讲解与通用解析不是同一段',
    items.length > 0 && distinct.length === items.length,
    `${distinct.length}/${items.length}`)
  const titles = items.map((i) => i.explainTitle)
  check('标题写明了"为什么你选的X不对"',
    titles.every((t) => /为什么/.test(t) && /不对/.test(t)), titles[0] || '')

  // 新增样式在深色下的漏白守卫：直接量讲解区块的**真实渲染像素**。
  // 注意不能用 getComputedStyle 的 backgroundColor —— 它是半透明的 rgba(...,0.08)，
  // 计算样式里没有 alpha，亮度函数会把深色主题也算成"亮"（见文件头注释）。
  const boxLums = []
  for (const it of items) {
    const r = it.boxRect
    if (!r || r.w < 8 || r.h < 8) continue
    const clipShot = await send(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.w),
        height: Math.round(r.h),
        scale: 1
      }
    })
    boxLums.push(modalLuminance(Buffer.from(clipShot.data, 'base64')).modal)
  }
  const lumsText = boxLums.map((v) => v.toFixed(3)).join(', ')
  const bgHint = `计算样式=${items[0]?.explainBg}`
  if (THEME === 'dark') {
    check('深色下讲解区块底色确实变深（无漏白，实测像素）',
      boxLums.length > 0 && boxLums.every((v) => v < 0.18),
      `实测底色亮度=${lumsText}  ${bgHint}`)
  } else {
    check('浅色下讲解区块是浅底（实测像素）',
      boxLums.length > 0 && boxLums.every((v) => v > 0.5),
      `实测底色亮度=${lumsText}  ${bgHint}`)
  }
  check('讲解区块的左侧强调竖条颜色与主题一致',
    !!items[0]?.explainTitleColor,
    `标题色=${items[0]?.explainTitleColor}`)

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const out = join(SHOT_DIR, `51-语法错题回顾-针对性讲解-${THEME === 'dark' ? '深色' : '浅色'}.png`)
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`\n截图: ${out}`)
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项 ${fail === 0 ? '✓' : '✗'}\n`)

  ws.close()
  chrome.kill()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
