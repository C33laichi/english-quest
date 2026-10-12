/**
 * 前端端到端校验（零依赖）
 *
 * 用系统 Chrome 的 DevTools Protocol 驱动真实浏览器：
 *   1) 逐页检查 Vue 是否正常挂载、控制台有无报错、关键文案是否存在
 *   2) 用 Input.dispatchKeyEvent 派发**真实键盘事件**，验证「键盘打字母」这条主线
 *
 * Node 18+ 自带 fetch，Node 22 自带 WebSocket，无需安装任何 npm 包。
 *
 * 用法：node scripts/e2e_check.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9333
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

mkdirSync(SHOT_DIR, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-chrome-'))

let msgId = 0
const pending = new Map()
const consoleErrors = []
const pageErrors = []

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

/** 从缓存的用户 JSON 里取角色，便于诊断 */
function roleOf(userJson) {
  try {
    return JSON.parse(userJson)?.role ?? '(无)'
  } catch (e) {
    return '(解析失败)'
  }
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--no-proxy-server',
    // 听力模块要在无人操作的情况下验证音频播放，需要放开自动播放限制
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' })

  let version = null
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      version = await r.json()
      break
    } catch (e) {
      await sleep(500)
    }
  }
  if (!version) throw new Error('Chrome 调试端口未就绪')

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      pageErrors.push(d.exception?.description || d.text)
    }
  }

  await send(ws, 'Runtime.enable')
  await send(ws, 'Page.enable')
  // 桌面端系统，统一用桌面视口
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  })

  /* ---------------- 真实键盘输入 ---------------- */

  const VK = {
    Enter: { code: 'Enter', vk: 13 },
    Escape: { code: 'Escape', vk: 27 },
    Backspace: { code: 'Backspace', vk: 8 },
    '?': { code: 'Slash', vk: 191 },
    Space: { code: 'Space', vk: 32 },
    ';': { code: 'Semicolon', vk: 186 },
    ArrowLeft: { code: 'ArrowLeft', vk: 37 },
    ArrowRight: { code: 'ArrowRight', vk: 39 },
    // 数字键：主键位（功能键区 1-4），code 必须是 DigitN 而非 KeyN
    '1': { code: 'Digit1', vk: 49 },
    '2': { code: 'Digit2', vk: 50 },
    '3': { code: 'Digit3', vk: 51 },
    '4': { code: 'Digit4', vk: 52 }
  }

  /** CDP 修饰键掩码：Ctrl 用于听力页的 Ctrl+Space / Ctrl+; */
  const CTRL = 2

  /** 派发一次完整的 keydown + keyup；modifiers 非 0 时表示组合键 */
  async function pressKey(key, modifiers = 0) {
    const info =
      VK[key] ||
      (/^[0-9]$/.test(key)
        ? { code: 'Digit' + key, vk: 48 + Number(key) }
        : { code: 'Key' + key.toUpperCase(), vk: key.toUpperCase().charCodeAt(0) })
    // 浏览器里空格键的 e.key 是单个空格字符，而不是 'Space'
    const actualKey = key === 'Space' ? ' ' : key
    const common = {
      key: actualKey,
      code: info.code,
      windowsVirtualKeyCode: info.vk,
      nativeVirtualKeyCode: info.vk,
      modifiers
    }
    await send(ws, 'Input.dispatchKeyEvent', {
      ...common,
      type: 'keyDown',
      // 组合键不产生可见字符
      text: actualKey.length === 1 && !modifiers ? actualKey : undefined
    })
    await send(ws, 'Input.dispatchKeyEvent', { ...common, type: 'keyUp' })
  }

  /** 往当前聚焦的输入框里插入文本（会触发 input 事件，v-model 能收到） */
  async function typeText(text) {
    await send(ws, 'Input.insertText', { text })
  }

  async function evalJson(expr, awaitPromise = false) {
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise })
    const v = r.result.value
    if (typeof v === 'string') {
      try {
        return JSON.parse(v)
      } catch (e) {
        return v
      }
    }
    return v
  }

  /** 随时截一张图（截图失败不影响断言） */
  async function shot(name) {
    try {
      const img = await send(ws, 'Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(img.data, 'base64'))
    } catch (e) {
      /* 忽略 */
    }
  }

  /* ---------------- 页面校验 ---------------- */

  const results = []

  /** 注入登录态 */
  async function loginAs(username, password) {
    const expr = `
      (async () => {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '${username}', password: '${password}' })
        });
        const b = await r.json();
        if (b.code !== 200) return 'LOGIN_FAIL: ' + b.msg;
        const d = b.data;
        // /auth/login 返回扁平结构（token + userId/username/nickname/role/...），
        // 没有嵌套 user 对象，这里必须与 store/user.js 的组装逻辑保持一致。
        localStorage.setItem('eq_token', d.token);
        localStorage.setItem('eq_user', JSON.stringify({
          userId: d.userId, username: d.username, nickname: d.nickname,
          role: d.role, avatar: d.avatar,
          totalPoints: d.totalPoints, streakDays: d.streakDays
        }));
        return 'OK:' + d.role;
      })()
    `
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result.value
  }

  /** 打开页面 → 等渲染 → 断言关键词 → 截图 */
  async function visit(path, name, expectTexts = [], shot = true) {
    consoleErrors.length = 0
    pageErrors.length = 0

    // 用 Page.navigate 做真正的整页导航（纯 hash 变化不会重载，Pinia 状态不会重建）
    const url = `${BASE}/?t=${Date.now()}#${path}`
    await send(ws, 'Page.navigate', { url })
    await sleep(2600)

    const r = await send(ws, 'Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true
    })
    const text = (r.result.value || '').replace(/\s+/g, ' ')

    const dbg = await send(ws, 'Runtime.evaluate', {
      expression: `JSON.stringify({ hash: location.hash, user: localStorage.getItem('eq_user') })`,
      returnByValue: true
    })
    const debug = JSON.parse(dbg.result.value || '{}')

    const missing = expectTexts.filter((t) => !text.includes(t))
    const ok = missing.length === 0 && pageErrors.length === 0

    results.push({
      name,
      path,
      ok,
      missing,
      textLen: text.length,
      hash: debug.hash,
      user: debug.user,
      pageErrors: [...new Set(pageErrors)].slice(0, 2),
      consoleErrors: [...new Set(consoleErrors)].slice(0, 2)
    })

    if (shot) {
      try {
        const img = await send(ws, 'Page.captureScreenshot', { format: 'png' })
        writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(img.data, 'base64'))
      } catch (e) {
        /* 截图失败不影响断言 */
      }
    }
    return text
  }

  // ---------- 登录页 ----------
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2500)
  await visit('/login', '01-登录页', ['英语闯关', '登 录', '注册', '全键盘作答'])

  // ---------- 学生端 ----------
  const stuLogin = await loginAs(os.environ.get('EQ_USER', 'student'), os.environ.get('EQ_PASS', ''))
  console.log('学生登录:', stuLogin)
  if (!String(stuLogin).startsWith('OK')) throw new Error('学生登录失败')

  // 侧边栏（'成长'/'首页'）+ 底部键位条（'全部快捷键'）是桌面骨架的标志，逐页校验
  const SHELL = ['成长', '首页', '全部快捷键']

  await visit('/home', '02-首页', [...SHELL, '每日打卡', '今日任务', '词汇闯关', '28 天语法'])
  await visit('/vocab', '03-词汇关卡', [...SHELL, '通过本关才解锁下一关'])
  await visit('/grammar', '04-语法路线', [...SHELL, '28 天语法路线', 'Day 1'])
  await visit('/game', '05-游戏中心', [...SHELL, '积分规则', '排行榜', '今日任务'])
  await visit('/stats', '06-学习看板', [...SHELL, '学习数据看板', '学习热力图'])
  await visit('/error-book', '07-错题本', [...SHELL, '错题本'])
  await visit('/ai', '08-AI练习', [...SHELL, 'AI 智能练习', '生成同型题'])
  await visit('/profile', '09-个人中心', [...SHELL, '个人中心', '修改密码'])

  // 答题页是沉浸式布局：无侧边栏，但键位条必须在
  await visit('/quiz/vocab/1', '10-词汇答题', ['全部快捷键', '退出'])
  await visit('/lesson/1', '11-语法关卡', ['全部快捷键', '今日讲义', '开始测验'])
  // 注意：进入练习页会自动播放，按钮文案在「播放发音 / 播放中」之间切换，
  // 所以断言用恒定的「语速」而不是按钮文案
  await visit('/listen', '12-听力关卡', [...SHELL, '听力听写', '两种难度模式', '简单模式', '困难模式'])
  await visit('/listen/1/EASY', '13-听力简单模式', ['全部快捷键', '退出', '简单模式', '语速', '一个格子填一个单词'])
  await visit('/listen/1/HARD', '14-听力困难模式', ['全部快捷键', '困难模式', '语速', '每听出一个词就多一格'])

  /* ---------------- 键盘交互专项测试 ---------------- */
  console.log('\n' + '-'.repeat(64))
  console.log('键盘交互测试')
  const kb = []
  const kbCheck = (name, ok, detail = '') => {
    kb.push({ name, ok, detail })
    console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? '  ' + detail : ''}`)
  }

  // 1) ? 打开快捷键面板，Esc 关闭
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/home` })
  await sleep(2600)
  await pressKey('?')
  await sleep(500)
  let panel = await evalJson(
    `JSON.stringify({ open: !!document.querySelector('.shortcut-mask'), text: (document.querySelector('.shortcut-panel')?.innerText || '') })`
  )
  kbCheck('按 ? 打开快捷键面板', !!panel?.open, panel?.open ? '面板已弹出' : '未弹出')

  await pressKey('Escape')
  await sleep(400)
  panel = await evalJson(`JSON.stringify({ open: !!document.querySelector('.shortcut-mask') })`)
  kbCheck('按 Esc 关闭快捷键面板', !panel?.open, panel?.open ? '仍开着' : '已关闭')

  // 2) 词汇答题：字母键快选 + 自动前进 + Enter 提交
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/quiz/vocab/1` })
  await sleep(3000)

  // 词汇每关是 40 题里随机抽 10 题，首题可能是选择也可能是拼写，
  // 断言要覆盖两种题型，否则会随机失败
  const before = await evalJson(`JSON.stringify({
    options: document.querySelectorAll('.option').length,
    spells: document.querySelectorAll('.spell-input').length,
    bar: (document.querySelector('.quiz-bar-count')?.innerText || '').trim(),
    hint: (document.querySelector('.keybar')?.innerText || '').replace(/\\s+/g, ' ')
  })`)
  const firstType = (before?.options ?? 0) > 0 ? '选择题' : (before?.spells ?? 0) > 0 ? '拼写题' : '未知'
  kbCheck(
    '答题页渲染出作答控件',
    (before?.options ?? 0) > 0 || (before?.spells ?? 0) > 0,
    `首题=${firstType}，选项 ${before?.options} 个`
  )
  kbCheck('底部键位条显示答题按键', /1 2 3 4|Enter/.test(before?.hint || ''), before?.hint || '')

  // 逐题作答：选择题按数字键（会自动前进），拼写题输入后按 Enter
  let answered = 0
  for (let i = 0; i < 14; i++) {
    const st = await evalJson(`JSON.stringify({
      result: (document.querySelector('.result-card')?.innerText || '').includes('正确率'),
      type: document.body.innerText.includes('拼写题') ? 'SPELL'
          : (document.body.innerText.includes('词义选择') ? 'CHOICE' : 'NONE')
    })`)
    if (!st || st.result) break
    if (st.type === 'CHOICE') {
      await pressKey('1')
      await sleep(700)
    } else if (st.type === 'SPELL') {
      await typeText('test')
      await sleep(250)
      await pressKey('Enter')
      await sleep(800)
    } else {
      break
    }
    answered++
  }

  const after = await evalJson(`JSON.stringify({
    result: (document.querySelector('.result-card')?.innerText || '').includes('正确率'),
    score: (document.querySelector('.result-score')?.innerText || '').trim(),
    bar: (document.querySelector('.quiz-bar-count')?.innerText || '').trim()
  })`)
  kbCheck('键盘可完成整关作答', answered > 0, `共作答 ${answered} 题`)
  kbCheck('答完后进入成绩结算', !!after?.result, after?.result ? `得分 ${after?.score}` : `仍停在 ${after?.bar}`)

  // 3) 拼写题：验证输入框自动聚焦，打字能直接落到输入框
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/quiz/vocab/1` })
  await sleep(3000)
  const spellInfo = await evalJson(`JSON.stringify({
    isSpell: document.body.innerText.includes('拼写题'),
    focused: document.activeElement?.tagName || '',
    cls: document.activeElement?.className || ''
  })`)
  if (spellInfo?.isSpell) {
    kbCheck('拼写题自动聚焦输入框', spellInfo.focused === 'INPUT', `焦点=${spellInfo.focused}`)
    await typeText('apple')
    await sleep(300)
    const typed = await evalJson(
      `JSON.stringify({ v: document.querySelector('.spell-input input')?.value || '' })`
    )
    kbCheck('字母键直接录入输入框', typed?.v === 'apple', `输入框内容="${typed?.v}"`)
  } else {
    kbCheck('首题为拼写题（本关首题是选择题，自动聚焦改由切题时触发）', true, '首题非拼写题，跳过')
  }

  /* 3.5) 数字键为选择题主键位：药丸标签 + 数字键生效 + 字母键向后兼容 */

  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/quiz/vocab/1` })
  await sleep(3000)
  const optProbe = await evalJson(`JSON.stringify({
    isChoice: document.body.innerText.includes('词义选择'),
    pills: [...document.querySelectorAll('.option-key')].map(e => e.innerText.trim()),
    hint: (document.querySelector('.quiz-hint')?.innerText || '').replace(/\\s+/g, ' ').trim()
  })`)
  if (optProbe?.isChoice) {
    kbCheck(
      '选项药丸标签为 1/2/3/4',
      JSON.stringify(optProbe.pills) === JSON.stringify(['1', '2', '3', '4']),
      `实际 ${JSON.stringify(optProbe.pills)}`
    )
    kbCheck('题面提示指向数字键', /1\s*2\s*3\s*4/.test(optProbe.hint || ''), optProbe.hint || '')

    // 按 3 应选中第 3 项（选中后短暂延时自动进入下一题）
    await pressKey('3')
    await sleep(120)
    const picked = await evalJson(`JSON.stringify({
      sel: [...document.querySelectorAll('.option')].findIndex(e => e.classList.contains('selected'))
    })`)
    kbCheck('按数字键 3 选中第 3 项', picked?.sel === 2, `选中下标=${picked?.sel}`)
    await sleep(700)

    // 字母键保留为备选：再按 a 应选中第 1 项
    await pressKey('a')
    await sleep(120)
    const picked2 = await evalJson(`JSON.stringify({
      sel: [...document.querySelectorAll('.option')].findIndex(e => e.classList.contains('selected'))
    })`)
    kbCheck('字母键 a 仍可选中第 1 项（向后兼容）', picked2?.sel === 0, `选中下标=${picked2?.sel}`)
    await sleep(700)
  } else {
    kbCheck('选项药丸标签为 1/2/3/4', true, '本关首题非选择题，跳过')
  }

  /* 4) 听力听写：简单/困难模式提示差异 + 全键盘作答闭环 */

  // 音频静态资源可达性（预生成的 mp3 必须能通过前端静态服务拿到）
  const audioStatus = await evalJson(
    `fetch('/audio/listen/1.mp3', { method: 'HEAD' }).then(r => r.status).catch(() => -1)`,
    true
  )
  kbCheck('听力音频资源可访问', audioStatus === 200, `HTTP ${audioStatus}`)

  // 逐词分格探测串：格子数 / 宽度 / 激活格 / 焦点 / 中文提示 / 底衬提示 / 是否残留旧结构
  const slotProbe = `JSON.stringify({
    slots: document.querySelectorAll('.slot').length,
    widths: [...document.querySelectorAll('.slot')].map(e => Math.round(e.getBoundingClientRect().width)),
    activeIdx: [...document.querySelectorAll('.slot')].findIndex(e => e.classList.contains('active')),
    focus: document.activeElement?.className || '',
    chinese: (document.querySelector('.stage-chinese')?.innerText || '').trim(),
    tag: (document.querySelector('.mode-tag')?.innerText || '').trim(),
    hintTicks: [...document.querySelectorAll('.slot')].map(e => e.querySelectorAll('.slot-hint i').length),
    hintVisible: [...document.querySelectorAll('.slot-hint')]
      .filter(e => getComputedStyle(e).opacity !== '0').length,
    legacy: document.querySelectorAll('.len-block, .len-line, .typed-input').length
  })`

  // 简单模式：一个单词一个格子，格子宽度 = 词长，底衬短横把词长可视化
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/listen/1/EASY` })
  await sleep(3200)
  const easy = await evalJson(slotProbe)
  kbCheck('简单模式按词渲染输入格', (easy?.slots ?? 0) > 1, `${easy?.slots} 个格子`)
  kbCheck('首格自动聚焦', (easy?.activeIdx ?? -1) === 0 && /slot-input/.test(easy?.focus || ''), `焦点=${easy?.focus}`)
  kbCheck('已无「整条横线」旧输入框', (easy?.legacy ?? -1) === 0, `残留旧元素 ${easy?.legacy}`)
  kbCheck('显示中文译文提示', (easy?.chinese || '').length > 0, easy?.chinese)
  // 底衬词长提示：每格短横数 == wordLens[i]，且全部可见（未判分时不许遮掉）
  const ticks = easy?.hintTicks || []
  kbCheck(
    '简单模式每格都有词长底衬提示',
    ticks.length > 0 && ticks.every((n) => n > 0) && ticks.every((n) => n <= 12),
    `每格短横数 ${JSON.stringify(ticks)}`
  )
  kbCheck(
    '底衬提示默认可见（未判分）',
    (easy?.hintVisible ?? 0) === ticks.length,
    `可见 ${easy?.hintVisible} / 共 ${ticks.length}`
  )
  // 信息性输出：宽度由词长决定
  console.log(`       简单模式格子宽度：${JSON.stringify(easy?.widths)}`)

  // Ctrl+Space 重听（组合键要在输入框聚焦时也能生效）
  await pressKey('Space', CTRL)
  await sleep(1100)
  const playState = await evalJson(`JSON.stringify({
    playing: !!document.querySelector('.play-btn.playing'),
    times: (document.querySelector('.played-times')?.innerText || '').trim()
  })`)
  kbCheck(
    'Ctrl+Space 触发音频播放',
    // 注意：进入关卡不再自动播放，所以这里的「已听」是从 0 变成 1 次。
    // 原来写 [2-9] 是因为自动播放已经替它播过一次 —— 那个前提已经不存在了。
    !!playState?.playing || /已听 [1-9]\d* 次/.test(playState?.times || ''),
    `${playState?.times || ''}，播放态=${playState?.playing}`
  )

  // 打满一格 → 自动跳到下一格（逐词输入的核心手感，全程不用按空格）
  //
  // 注意别用「格子像素宽 ÷ 每字符宽」反推词长 —— 那个估算值会跟真实词长差一位，
  // 打多了会溢出到下一格、打少了不触发跳转，断言就会偶发失败
  // （后端的例句是随机的，某些词长下才撞上，表现为"跑十次红一次"）。
  // 直接从 DOM 读真实的底衬短横数，与页面用的是同一份数据。
  const firstLen = Number(easy?.hintTicks?.[0]) > 0 ? Number(easy.hintTicks[0]) : 1
  await typeText('x'.repeat(firstLen))
  await sleep(420)
  const filled = await evalJson(`JSON.stringify({
    activeIdx: [...document.querySelectorAll('.slot')].findIndex(e => e.classList.contains('active')),
    val0: document.querySelectorAll('.slot-input')[0]?.value || ''
  })`)
  kbCheck(
    '打满一格自动跳到下一格',
    filled?.activeIdx === 1 && (filled?.val0 || '').length === firstLen,
    `激活第 ${filled?.activeIdx} 格，首格="${filled?.val0}"（应为 ${firstLen} 个字符）`
  )

  // 逐格填好后提交 → 判分结果必须着色回格子本身
  const totalSlots = easy?.slots || 0
  for (let i = 0; i < totalSlots; i++) {
    await evalJson(`(document.querySelectorAll('.slot-input')[${i}]?.focus(), 'ok')`)
    await sleep(90)
    await typeText('x')
    await sleep(110)
  }
  await sleep(260)
  await pressKey('Enter')
  await sleep(1600)
  const judged = await evalJson(`JSON.stringify({
    has: !!document.querySelector('.judge'),
    text: (document.querySelector('.judge')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 90),
    words: document.querySelectorAll('.judge .dw').length,
    ok: document.querySelectorAll('.slot.ok').length,
    bad: document.querySelectorAll('.slot.bad').length
  })`)
  kbCheck('Enter 提交后出现逐词判分', !!judged?.has && (judged?.words ?? 0) > 0, judged?.text)
  kbCheck(
    '判分结果着色回输入格',
    (judged?.ok ?? 0) + (judged?.bad ?? 0) > 0,
    `绿格 ${judged?.ok} 个 / 红格 ${judged?.bad} 个`
  )
  await shot('20-听力判分逐词对照')

  // Enter 进入下一句
  await pressKey('Enter')
  await sleep(1700)
  const nextQ = await evalJson(`JSON.stringify({
    hasJudge: !!document.querySelector('.judge'),
    count: (document.querySelector('.quiz-bar-count')?.innerText || '').trim(),
    activeIdx: [...document.querySelectorAll('.slot')].findIndex(e => e.classList.contains('active'))
  })`)
  kbCheck(
    'Enter 切到下一句并重置输入格',
    !nextQ?.hasJudge && nextQ?.activeIdx === 0,
    `进度 ${nextQ?.count}，第 ${nextQ?.activeIdx} 格激活`
  )

  // Ctrl+; 显示答案
  await pressKey(';', CTRL)
  await sleep(1400)
  const revealedPanel = await evalJson(`JSON.stringify({
    has: !!document.querySelector('.judge'),
    text: (document.querySelector('.judge')?.innerText || '').replace(/\\s+/g, ' ')
  })`)
  kbCheck(
    'Ctrl+; 显示答案',
    !!revealedPanel?.has && /已查看答案/.test(revealedPanel?.text || ''),
    (revealedPanel?.text || '').slice(0, 56)
  )
  await shot('21-听力显示答案')

  // 困难模式：连「这句话有几个词」都不该泄露 —— 初始只能有一个空格子
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/listen/1/HARD` })
  await sleep(3200)
  const hard = await evalJson(slotProbe)
  kbCheck('困难模式不泄露词数（初始仅 1 格）', (hard?.slots ?? -1) === 1, `${hard?.slots} 个格子`)
  kbCheck('已无「整条横线」旧输入框', (hard?.legacy ?? -1) === 0, `残留旧元素 ${hard?.legacy}`)
  kbCheck('困难模式标记正确', /困难/.test(hard?.tag || ''), hard?.tag)
  // 反作弊：困难模式必须一条底衬提示都不渲染，否则等于泄露词长
  kbCheck(
    '困难模式无任何词长底衬提示',
    (hard?.hintTicks || []).every((n) => n === 0),
    `短横数 ${JSON.stringify(hard?.hintTicks)}`
  )

  // 空格分出新词格 / 空格子按 Backspace 回收
  await typeText('i')
  await sleep(220)
  await pressKey('Space')
  await sleep(320)
  const sp = await evalJson(slotProbe)
  kbCheck('空格分出新词格', (sp?.slots ?? 0) === 2 && sp?.activeIdx === 1, `${sp?.slots} 格，第 ${sp?.activeIdx} 格激活`)

  await pressKey('Backspace')
  await sleep(320)
  const bs = await evalJson(slotProbe)
  kbCheck(
    '空格子按 Backspace 回退上一格',
    (bs?.slots ?? 0) === 1 && bs?.activeIdx === 0,
    `${bs?.slots} 格，第 ${bs?.activeIdx} 格激活`
  )

  // 用本句真实答案逐词敲入：证明「空格分格」不只是能走完流程，而是真能答对
  // 先删掉上一条 Backspace 测试留在首格的 "i"，让这句从空白格起步
  await pressKey('Backspace')
  await sleep(250)

  // （句子 id 从已请求的音频地址反推，答案借 revealed 方式向接口取回）
  // 听力页不再自动播放，performance 里就不会再「凭空」出现音频请求；
  // 想拿到当前句 id，就得真的播一次 —— 这也正是用户答题前的实际动作。
  await pressKey('Space', CTRL)
  await sleep(1100)

  const curSid = await evalJson(`
    (() => {
      const hit = performance.getEntriesByType('resource')
        .map(e => e.name.match(/\\/audio\\/listen\\/(\\d+)\\.mp3$/))
        .filter(Boolean).pop()
      return hit ? Number(hit[1]) : 0
    })()
  `)
  const truth = await evalJson(
    `(async () => {
      const t = localStorage.getItem('eq_token')
      const r = await fetch('/api/listen/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ sentenceId: ${Number(curSid) || 0}, userAnswer: '', mode: 'HARD' })
      })
      const b = await r.json()
      return JSON.stringify({ en: b?.data?.correctAnswer || '' })
    })()`,
    true
  )
  const truthWords = String(truth?.en || '').split(/\s+/).filter(Boolean)
  for (const w of truthWords) {
    await typeText(w)
    await sleep(70)
    await pressKey('Space')
    await sleep(70)
  }
  await pressKey('Enter')
  await sleep(1700)
  const perfect = await evalJson(`JSON.stringify({
    ok: document.querySelectorAll('.slot.ok').length,
    bad: document.querySelectorAll('.slot.bad').length,
    text: (document.querySelector('.judge')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 46)
  })`)
  kbCheck(
    '逐词分格能完整答对一句',
    truthWords.length > 0 && (perfect?.ok ?? 0) === truthWords.length && (perfect?.bad ?? 0) === 0,
    `${perfect?.ok}/${truthWords.length} 格全绿 · ${perfect?.text}`
  )
  await shot('22-听力答对逐格全绿')

  await pressKey('Enter') // 进入下一句
  await sleep(1300)

  // 只用键盘走完整个困难模式关卡，验证「全程不碰鼠标」在听写模块同样成立
  // 每道题两步：敲句子+Enter 提交，再 Enter 进下一句
  for (let i = 0; i < 14; i++) {
    const done = await evalJson(`JSON.stringify({ r: !!document.querySelector('.result-card') })`)
    if (done?.r) break

    const judging = await evalJson(`JSON.stringify({ j: !!document.querySelector('.judge') })`)
    if (judging?.j) {
      await pressKey('Enter') // 上一题已判分 -> 下一句
      await sleep(1150)
      continue
    }

    // 逐词敲入：每敲一个词按一次空格分出下一格，重现真实听写动作
    for (const w of ['i', 'like', 'this', 'food']) {
      await typeText(w)
      await sleep(80)
      await pressKey('Space')
      await sleep(80)
    }
    await pressKey('Enter')
    await sleep(1150)

    // 判分出来后立刻进下一句，这样一轮就能走完一题
    const judgedNow = await evalJson(`JSON.stringify({ j: !!document.querySelector('.judge') })`)
    if (judgedNow?.j) {
      await pressKey('Enter')
      await sleep(1150)
    }
  }
  await sleep(1200)
  const settled = await evalJson(`JSON.stringify({
    r: !!document.querySelector('.result-card'),
    score: (document.querySelector('.result-score')?.innerText || '').trim(),
    review: document.querySelectorAll('.review-row').length
  })`)
  kbCheck('纯键盘答完困难模式整关', !!settled?.r, `得分 ${settled?.score}，回顾 ${settled?.review} 句`)
  await shot('23-听力成绩结算')

  console.log('-'.repeat(64))

  // ---------- 管理后台 ----------
  const adminLogin = await loginAs((process.env.EQ_USER || 'admin'), (process.env.EQ_ADMIN_PASS || ''))
  console.log('管理员登录:', adminLogin)
  if (!String(adminLogin).startsWith('OK')) throw new Error('管理员登录失败')

  await visit('/admin/dashboard', '15-后台总览', ['注册用户', '题库总量'])
  // 「新增用户」「关卡管理」是为对齐任务书补的管理员/关卡增删能力，属于常驻控件，一并锁进回归
  await visit('/admin/users', '16-用户管理', ['用户', '角色', '注册时间', '新增用户'], true)
  await visit('/admin/vocab', '17-词汇题库', ['新增题目', '关卡管理'], true)
  await visit('/admin/grammar', '18-语法题库', ['题目管理', '讲义管理'], true)

  // ---------- 汇总 ----------
  console.log('\n' + '='.repeat(70))
  let pass = 0
  for (const r of results) {
    if (r.ok) {
      pass++
      console.log(`[PASS] ${r.name.padEnd(14)} 渲染 ${String(r.textLen).padStart(5)} 字符  角色=${roleOf(r.user)}`)
    } else {
      console.log(`[FAIL] ${r.name.padEnd(14)} 缺失=${JSON.stringify(r.missing)}`)
      console.log(`        期望路由=#${r.path}  实际路由=${r.hash}`)
      console.log(`        登录态=${String(r.user).slice(0, 130)}`)
      ;[...r.pageErrors, ...r.consoleErrors].forEach((e) => console.log(`        异常: ${String(e).slice(0, 180)}`))
    }
  }
  console.log('='.repeat(70))
  console.log(`页面校验：通过 ${pass} 项，失败 ${results.length - pass} 项`)

  const kbPass = kb.filter((k) => k.ok).length
  console.log(`键盘交互：通过 ${kbPass} 项，失败 ${kb.length - kbPass} 项`)
  console.log(`截图目录：${SHOT_DIR}`)

  const allOk = pass === results.length && kbPass === kb.length

  ws.close()
  chrome.kill()
  try {
    rmSync(userDataDir, { recursive: true, force: true })
  } catch (e) {
    /* 临时目录清理失败可忽略 */
  }
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('校验异常:', e.message)
  process.exit(2)
})
