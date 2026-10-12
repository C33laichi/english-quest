/**
 * 本轮 6 项缺陷修复的浏览器验证（零依赖 CDP）
 *
 * 需求对应：
 *   1. 浅色主题下侧栏与首页横幅仍是深色 → 必须为浅底
 *   2. 首页「连续天数/排名」个位数与下方标签不对齐
 *   3. 首页等级旁加圆形问号，悬浮显示等级名称与所需分值
 *   4. AI 练习去掉次数限制
 *   5. AI 练习：词汇多选 → 串成短文；语法错题 → 拓展考点
 *   6. 个人中心「关于」改为页面底部低透明度展示，不占卡片
 *
 * ── 断言取向（本项目的硬教训）─────────────────────────────
 * ① 「浅色/深色」不读 getComputedStyle().backgroundColor ——
 *    讲解块/横幅的底色是**半透明**的，计算样式没有 alpha，据此算亮度会误判。
 *    这里一律 clip 截真实像素、取**众数**亮度（底色面积压倒性）。
 * ② 「对齐」不靠肉眼看图 —— 直接比较两个盒子中心点的 x 差值。
 * ③ 「悬浮提示」真的派发鼠标事件，不是只查 DOM 里有没有那个节点。
 *
 * 用法：node scripts/ui6_check.mjs
 * 前置：后端 8090 + 前端 5173 均已启动
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { decodePng, luminance, pixelAt } from './png_probe.mjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9351
const SHOTS = 'screenshots'

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

/** 取截图区域内亮度众数（= 底色），避开左边缘竖条 */
function modalLuminance(buf) {
  const img = decodePng(buf)
  const hist = new Map()
  const y0 = Math.round(img.height * 0.15)
  const y1 = Math.round(img.height * 0.85)
  const x0 = Math.round(img.width * 0.12)
  const x1 = Math.round(img.width * 0.96)
  const stepY = Math.max(1, Math.floor((y1 - y0) / 100))
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
  return bestK
}

const userDataDir = mkdtempSync(join(tmpdir(), 'eq-ui6-'))

async function main() {
  mkdirSync(SHOTS, { recursive: true })

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,1400',
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

  let currentTheme = null

  const evaluate = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails) {
      throw new Error(`页面内异常：${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`)
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

  const waitFor = async (expr, timeout = 6000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      const v = await evaluate(`(() => { try { return !!(${expr}) } catch(e) { return false } })()`)
      if (v) return true
      await sleep(150)
    }
    return false
  }

  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')

  /** 登录一次，写好 token；换主题时只改 localStorage 再整页重载 */
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
  const loginOk = await evaluate(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'student', password: '' })
      });
      const b = await r.json();
      if (b.code !== 200) return 'FAIL:' + b.msg;
      const d = b.data;
      localStorage.setItem('eq_token', d.token);
      localStorage.setItem('eq_user', JSON.stringify({
        userId: d.userId, username: d.username, nickname: d.nickname,
        role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
      }));
      return 'OK';
    })()
  `)
  if (String(loginOk).startsWith('FAIL')) throw new Error(`登录失败：${loginOk}`)

  /** 切主题 + 跳路由（hash 路由只改 hash 不重载，必须加变化 query 强制整页加载） */
  const go = async (path, theme) => {
    await evaluate(`localStorage.setItem('eq_theme', ${JSON.stringify(theme)})`)
    currentTheme = theme
    await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#${path}` })
    await sleep(3200)
    await evaluate('window.scrollTo(0, 0)')
    await sleep(400)
  }

  const shotFull = async (out) => {
    const doc = await evaluate(
      `JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`
    )
    const s = await send(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: doc.w, height: doc.h, scale: 1 }
    })
    writeFileSync(join(SHOTS, out), Buffer.from(s.data, 'base64'))
    return out
  }

  const shotEl = async (sel, out) => {
    const r = await evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return JSON.stringify({
          x: Math.round(Math.max(0, b.left)),
          y: Math.round(Math.max(0, b.top + window.scrollY)),
          w: Math.round(b.width), h: Math.round(b.height)
        });
      })()
    `)
    if (!r || !r.w || !r.h) return null
    const s = await send(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 }
    })
    writeFileSync(join(SHOTS, out), Buffer.from(s.data, 'base64'))
    return out
  }

  /** 对某个选择器截像素图，返回亮度众数 */
  const modalOf = async (sel) => {
    const r = await evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return JSON.stringify({
          x: Math.round(Math.max(0, b.left)),
          y: Math.round(Math.max(0, b.top + window.scrollY)),
          w: Math.round(b.width), h: Math.round(b.height)
        });
      })()
    `)
    if (!r || !r.w || !r.h) return null
    const s = await send(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 }
    })
    return modalLuminance(Buffer.from(s.data, 'base64'))
  }

  /* ================= 1. 浅色下侧栏 / 首页横幅不再是深色 ================= */
  section('1. 浅色主题：侧栏与首页横幅必须是浅底（含深色回归）')

  await go('/home', 'light')
  const pageTheme = await evaluate(`document.documentElement.getAttribute('data-theme')`)
  ok('已切到浅色主题', pageTheme === 'light', `data-theme=${pageTheme}`)

  const sideLight = await modalOf('.side-nav')
  const heroLight = await modalOf('.hero')
  ok('浅色下侧栏是浅底（不是 #14181f 的黑）',
    sideLight !== null && sideLight > 0.5, `底色亮度=${sideLight}`)
  ok('浅色下首页横幅是浅底（不再整块发黑）',
    heroLight !== null && heroLight > 0.5, `底色亮度=${heroLight}`)

  // 深色回归：同一位置必须仍然是深底，说明没有把深色一起改坏
  await go('/home', 'dark')
  const themeDark = await evaluate(`document.documentElement.getAttribute('data-theme')`)
  const sideDark = await modalOf('.side-nav')
  const heroDark = await modalOf('.hero')
  ok('深色主题仍生效', themeDark === 'dark', `data-theme=${themeDark}`)
  ok('深色下侧栏仍为深底（无回退）',
    sideDark !== null && sideDark < 0.18, `底色亮度=${sideDark}`)
  ok('深色下横幅仍为深底（无回退）',
    heroDark !== null && heroDark < 0.18, `底色亮度=${heroDark}`)
  await shotFull('61-首页-深色-回归.png')

  /* ================= 2. 首页数值与标签对齐 ================= */
  section('2. 首页「连续天数/排名」个位数与下方标签对齐')

  await go('/home', 'light')
  const statAlign = await evaluate(`
    (() => {
      const rows = [...document.querySelectorAll('.hero-stat')];
      return JSON.stringify(rows.map((el) => {
        const b = el.querySelector('b'), s = el.querySelector('span');
        if (!b || !s) return null;
        const rb = b.getBoundingClientRect(), rs = s.getBoundingClientRect();
        return {
          value: b.innerText.trim(), label: s.innerText.trim(),
          db: +(Math.abs((rb.left + rb.right) / 2 - (rs.left + rs.right) / 2)).toFixed(2),
          alignB: getComputedStyle(b).textAlign, alignS: getComputedStyle(s).textAlign
        };
      }));
    })()
  `)
  ok('三个数据点都存在', Array.isArray(statAlign) && statAlign.length === 3,
    `实际 ${statAlign?.length}`)
  if (Array.isArray(statAlign)) {
    const maxOffset = Math.max(...statAlign.map((r) => r.db))
    ok('数值与标签的水平中心对齐（偏差 ≤ 1.5px）', maxOffset <= 1.5,
      statAlign.map((r) => `${r.value}/${r.label}:${r.db}px`).join('  '))
    ok('数值与标签均为居中排版',
      statAlign.every((r) => r.alignB === 'center' && r.alignS === 'center'),
      statAlign.map((r) => `${r.alignB}/${r.alignS}`).join(' '))
  }
  await shotEl('.hero', '62-首页-横幅对齐-浅色.png')

  /* ================= 3. 等级问号 + 悬浮提示 ================= */
  section('3. 等级圆形问号，悬浮显示等级名称与所需分值')

  const helpInfo = await evaluate(`
    (() => {
      const el = document.querySelector('.level-help');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return JSON.stringify({
        text: el.innerText.trim(), radius: cs.borderRadius,
        w: Math.round(b.width), h: Math.round(b.height),
        cx: b.left + b.width / 2, cy: b.top + b.height / 2
      });
    })()
  `)
  ok('问号徽标存在且文案为 ?', helpInfo?.text === '?', `text="${helpInfo?.text}"`)
  ok('徽标是圆形（宽高相等 + 50% 圆角）',
    !!helpInfo && Math.abs(helpInfo.w - helpInfo.h) <= 1 && /50%|9999px|999px/.test(helpInfo.radius),
    `${helpInfo?.w}x${helpInfo?.h} radius=${helpInfo?.radius}`)

  // 真的把鼠标移上去，而不是只查 DOM
  if (helpInfo) {
    await send(ws, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: Math.round(helpInfo.cx), y: Math.round(helpInfo.cy), buttons: 0
    })
  }
  const tipShown = await waitFor(`document.querySelector('.level-tip')`, 5000)
  ok('悬浮后出现等级提示浮层', tipShown)

  const tipInfo = await evaluate(`
    (() => {
      const tip = document.querySelector('.level-tip');
      if (!tip) return null;
      const rows = [...tip.querySelectorAll('.level-tip-row')].map(r => r.innerText.replace(/\\s+/g,' ').trim());
      return JSON.stringify({
        head: tip.querySelector('.level-tip-head')?.innerText.trim() || '',
        rows, current: tip.querySelectorAll('.level-tip-row.current').length
      });
    })()
  `)
  ok('提示里有 6 个等级', tipInfo?.rows?.length === 6, `共 ${tipInfo?.rows?.length} 行`)
  ok('每行都含等级名与所需分值',
    !!tipInfo && tipInfo.rows.every((r) => /Lv\.\d+/.test(r) && /分/.test(r)),
    JSON.stringify(tipInfo?.rows))
  ok('当前等级被高亮（唯一）', tipInfo?.current === 1, `高亮 ${tipInfo?.current} 行`)

  await shotEl('.el-popper.level-tip-popper', '63-首页-等级提示浮层.png')
  // 只截浮层盒子会因 captureBeyondViewport 重排版而看不出它与页面的叠压关系，
  // 再留一张「浮层打开状态下的整页图」，用于人眼确认底色不透明、文字不互相穿透。
  await shotFull('63b-首页-等级提示-整页.png')

  /* ================= 4. AI 练习：无次数限制 ================= */
  section('4. AI 练习：已无「今日剩余 N 次」限制')

  await go('/ai', 'light')
  const quotaText = await evaluate(`
    (() => {
      const t = document.body.innerText || '';
      const chips = [...document.querySelectorAll('.chip')].map(e => e.innerText.trim());
      return JSON.stringify({ hasLimit: /今日剩余/.test(t), chips });
    })()
  `)
  ok('页面上不再出现「今日剩余」', quotaText?.hasLimit === false,
    `chips=${JSON.stringify(quotaText?.chips)}`)

  // 连点两次生成都要成功（有次数限制时第二次会被拦）
  const clickPrimary = async () => {
    await evaluate(`document.querySelector('.pick-actions .btn-primary')?.click()`)
  }
  await evaluate(`document.querySelector('.pick-item')?.click()`)
  await sleep(400)
  await clickPrimary()
  await waitFor(`document.querySelector('.quiz-stem')`, 6000)
  const first = await evaluate(`document.querySelector('.quiz-stem')?.innerText.trim() || ''`)
  await clickPrimary()
  await sleep(1500)
  const second = await evaluate(`document.querySelector('.quiz-stem')?.innerText.trim() || ''`)
  const errToast = await evaluate(`!!document.querySelector('.el-message--error')`)
  ok('第一次生成同型题成功', first.length > 0, `题干长度=${first.length}`)
  ok('不限次数下可连续生成', second.length > 0 && !errToast,
    `第二次长度=${second.length} 错误提示=${errToast}`)

  /* ================= 5. 词汇多选串烧 + 语法拓展 ================= */
  section('5. 词汇多选 → 短文；语法错题 → 拓展考点')

  await go('/ai', 'light')
  const listInfo = await evaluate(`
    (() => {
      const items = [...document.querySelectorAll('.pick-item')];
      const vocab = items.filter(el => /词汇/.test(el.querySelector('.chip')?.innerText || ''));
      const grammar = items.filter(el => /语法/.test(el.querySelector('.chip')?.innerText || ''));
      return JSON.stringify({
        vocab: vocab.length, grammar: grammar.length,
        boxes: document.querySelectorAll('.pick-check input[type=checkbox]').length
      });
    })()
  `)
  ok('词汇错题数量与勾选框数量一致',
    listInfo?.boxes === listInfo?.vocab && listInfo?.vocab > 0,
    `词汇 ${listInfo?.vocab} 条 / 勾选框 ${listInfo?.boxes} 个`)
  ok('有语法错题可用于拓展', listInfo?.grammar > 0, `语法 ${listInfo?.grammar} 条`)

  if (listInfo?.vocab >= 2) {
    // 勾两个单词 → 出现「串成短文」按钮
    await evaluate(`
      (() => {
        const boxes = [...document.querySelectorAll('.pick-check input[type=checkbox]')];
        boxes[0].click(); boxes[1].click();
      })()
    `)
    await sleep(500)
    const btnState = await evaluate(`
      (() => {
        const btns = [...document.querySelectorAll('.pick-actions button')];
        const b = btns.find(x => /串成短文/.test(x.innerText));
        return JSON.stringify(b ? { text: b.innerText.replace(/\\s+/g,' ').trim(), disabled: b.disabled } : null);
      })()
    `)
    ok('勾选 2 个单词后出现「串成短文」按钮', !!btnState, JSON.stringify(btnState))
    ok('按钮可用（未禁用）', btnState?.disabled === false, `disabled=${btnState?.disabled}`)

    await evaluate(`
      (() => {
        const btns = [...document.querySelectorAll('.pick-actions button')];
        btns.find(x => /串成短文/.test(x.innerText))?.click();
      })()
    `)
    const gotPassage = await waitFor(`document.querySelector('.passage-body')`, 8000)
    const passage = await evaluate(`
      (() => {
        const body = document.querySelector('.passage-body');
        if (!body) return null;
        const words = [...document.querySelectorAll('.word-chip')].map(e => e.innerText.trim());
        return JSON.stringify({ words, len: body.innerText.trim().length, text: body.innerText.trim() });
      })()
    `)
    ok('短文已生成（正文非空）', gotPassage && (passage?.len || 0) > 40, `长度=${passage?.len}`)
    ok('短文包含全部勾选的单词',
      !!passage && passage.words.length >= 2 &&
        passage.words.every((w) => new RegExp(`\\b${w}\\b`, 'i').test(passage.text)),
      `words=${JSON.stringify(passage?.words)}`)
    await shotEl('.ai-grid', '64-AI练习-单词串烧.png')
  } else {
    console.log('   ⚠ 词汇错题不足 2 条，跳过串烧验证')
  }

  // 语法拓展
  await evaluate(`
    (() => {
      const g = [...document.querySelectorAll('.pick-item')]
        .find(el => /语法/.test(el.querySelector('.chip')?.innerText || ''));
      g?.click();
    })()
  `)
  await sleep(600)
  const expandBtn = await evaluate(`
    (() => {
      const btns = [...document.querySelectorAll('.pick-actions button')];
      const b = btns.find(x => /拓展这个考点/.test(x.innerText));
      const items = [...document.querySelectorAll('.pick-item')];
      const active = items.find(el => el.classList.contains('active'));
      return JSON.stringify({
        found: !!b,
        activeChip: active?.querySelector('.chip')?.innerText.trim() || null,
        actions: btns.map(x => x.innerText.replace(/\\s+/g, ' ').trim())
      });
    })()
  `)
  ok('选中语法错题后出现「拓展这个考点」按钮', expandBtn?.found === true,
    `当前选中=${expandBtn?.activeChip} 按钮=${JSON.stringify(expandBtn?.actions)}`)

  if (expandBtn) {
    await evaluate(`
      (() => {
        const b = [...document.querySelectorAll('.pick-actions button')].find(x => /拓展这个考点/.test(x.innerText));
        b?.click();
      })()
    `)
    const gotExpand = await waitFor(`document.querySelector('.expand-body')`, 8000)
    const expand = await evaluate(`
      (() => {
        const body = document.querySelector('.expand-body');
        if (!body) return null;
        const chip = document.querySelector('.card-title .chip.gold')?.innerText.trim() || '';
        return JSON.stringify({ chip, len: body.innerText.trim().length, text: body.innerText.trim() });
      })()
    `)
    ok('拓展正文已生成（非空）', gotExpand && (expand?.len || 0) > 60, `长度=${expand?.len}`)
    ok('拓展正文确实围绕该考点展开',
      !!expand && !!expand.chip && expand.text.includes(expand.chip),
      `考点="${expand?.chip}"`)
    await shotEl('.ai-grid', '65-AI练习-语法拓展.png')
  }

  /* ================= 6. 个人中心「关于」底部低透明度 ================= */
  section('6. 个人中心「关于」移到页面底部低透明度展示')

  await go('/profile', 'light')
  const about = await evaluate(`
    (() => {
      const el = document.querySelector('.about-foot');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const page = document.querySelector('.page');
      const pb = page.getBoundingClientRect();
      const eb = el.getBoundingClientRect();
      return JSON.stringify({
        text: el.innerText.replace(/\\s+/g,' ').trim(),
        inCard: !!el.closest('.card'),
        opacity: cs.opacity,
        isLast: el === page.lastElementChild,
        gapToBottom: Math.round(pb.bottom - eb.bottom),
        cardsTitledAbout: [...document.querySelectorAll('.card-title')].filter(t => t.innerText.trim() === '关于').length
      });
    })()
  `)
  ok('页脚元素存在', !!about, about?.text || '')
  ok('不再放在卡片里', about?.inCard === false)
  ok('没有残留标题为「关于」的卡片', about?.cardsTitledAbout === 0,
    `残留 ${about?.cardsTitledAbout} 个`)
  ok('透明度已调低（≈0.45）',
    !!about && Math.abs(parseFloat(about.opacity) - 0.45) < 0.06, `opacity=${about?.opacity}`)
  ok('位于页面最底部', about?.isLast === true && about?.gapToBottom <= 40,
    `距底 ${about?.gapToBottom}px isLast=${about?.isLast}`)

  const aboutLum = await modalOf('.about-foot')
  ok('浅色下页脚不是深色块', aboutLum === null || aboutLum > 0.5, `底色亮度=${aboutLum}`)

  await shotEl('.page', '66-个人中心-底部关于-浅色.png')
  await go('/profile', 'dark')
  const aboutLumDark = await modalOf('.about-foot')
  ok('深色下页脚不是漏白块', aboutLumDark === null || aboutLumDark < 0.3, `底色亮度=${aboutLumDark}`)
  await shotEl('.page', '67-个人中心-底部关于-深色.png')

  /* ================= 汇总 ================= */
  section('结果')
  console.log(`通过 ${pass} 项，失败 ${fail} 项  （当前主题 ${currentTheme}）`)
  if (fails.length) {
    console.log('失败项：')
    fails.forEach((f) => console.log(`  · ${f}`))
    process.exitCode = 1
  } else {
    console.log('  ✓ 全部通过')
  }

  ws.close()
  chrome.kill()
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
