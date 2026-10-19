/**
 * 三项 UI 缺陷的浏览器回归（零依赖 CDP）
 *
 * 对应需要修掉的现象：
 *   1. 词汇/听力关卡结算：非最后一关要出现「下一关」，最后一关只出现
 *      「Congratulations！You cleared the level.」
 *   2. 右下角快捷键提示应是 Shift + ?（单独一个 ? 键并不存在）
 *   3. 左侧边栏要一直铺到屏幕底部，底部键位条只占右半边
 *
 * 说明：听力页（ListenPractice）与词汇页（VocabQuiz）是同一套结算逻辑，
 *       这里跑词汇的「中间关 / 最后一关」两个分支即可覆盖判定；
 *       听力侧靠 e2e_check.mjs 的整关流程保证渲染不炸。
 *
 * 注意：程序化作答基本全错，正常配置下分数过不了及格线、看不到「通关」分支。
 *      所以运行前先把词汇关卡的及格线临时改成 0（跑完再改回去）：
 *
 *        mysql -h ::1 -uroot -p english_quest -e "
 *          UPDATE t_vocab_level SET pass_score = 0;"   -- 记下原值再跑
 *
 *      这三条检查的是「通关之后的按钮/文案」，与及格线高低无关。
 *
 * 用法：node scripts/verify_level_ui_fixed.mjs [light|dark]
 * 前置：后端 8090、前端 5173 均在运行
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9361
const THEME = (process.argv[2] || 'light') === 'dark' ? 'dark' : 'light'
/** 加 --shots 时把三张关键画面存到 screenshots/，方便人工复核 */
const SHOTS = process.argv.includes('--shots')
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

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

let pass = 0
let fail = 0
const failures = []
function ok(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${extra ? '  — ' + extra : ''}`)
  } else {
    fail++
    failures.push(name)
    console.log(`  ❌ ${name}${extra ? '  — ' + extra : ''}`)
  }
}

const userDataDir = mkdtempSync(join(tmpdir(), 'eq-levelui-'))

async function main() {
  console.log(`\n== 关卡结算 / 快捷键提示 / 侧边栏 布局回归（${THEME}）==\n`)

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
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
  const evalJson = (expr) => evaluate(expr)

  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')

  // 截图只做留档，不影响断言
  const shot = async (name) => {
    if (!SHOTS) return
    try {
      mkdirSync(SHOT_DIR, { recursive: true })
      const r = await send(ws, 'Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(r.data, 'base64'))
      console.log(`  📸 screenshots/${name}.png`)
    } catch (e) {
      console.log(`  （截图失败：${e.message}）`)
    }
  }

  /** 结算页的按钮在错题回顾下面，必须滚到底才能拍到 */
  const shotBottom = async (name) => {
    if (!SHOTS) return
    await evaluate(`window.scrollTo(0, document.body.scrollHeight); 'ok'`)
    await sleep(450)
    await shot(name)
    await evaluate(`window.scrollTo(0, 0); 'ok'`)
  }

  // ---------- 注入登录态 ----------
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
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

  // 键盘事件：字母键用来快选选项
  async function pressKey(key) {
    const code = /^[0-9]$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key, code, windowsVirtualKeyCode: key.charCodeAt(0), text: key
    })
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key, code, windowsVirtualKeyCode: key.charCodeAt(0)
    })
  }
  async function pressEnter() {
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r'
    })
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13
    })
  }
  async function typeText(text) {
    for (const ch of text) {
      await send(ws, 'Input.dispatchKeyEvent', { type: 'char', text: ch })
    }
  }

  /** 把一关答完（选择题按 1 自动前进；拼写题随便打点字再 Enter） */
  async function answerWholeLevel(maxSteps = 14) {
    for (let i = 0; i < maxSteps; i++) {
      const st = await evalJson(`JSON.stringify({
        result: !!document.querySelector('.result-card'),
        type: document.body.innerText.includes('拼写题') ? 'SPELL'
            : (document.body.innerText.includes('词义选择') ? 'CHOICE' : 'NONE')
      })`)
      if (!st || st.result) return true
      if (st.type === 'CHOICE') {
        await pressKey('1')
        await sleep(650)
      } else if (st.type === 'SPELL') {
        await typeText('test')
        await sleep(200)
        await pressEnter()
        await sleep(750)
      } else {
        return false
      }
    }
    return false
  }

  // ================================================================ 1. 快捷键提示
  console.log('— 快捷键提示 —')
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/home` })
  await sleep(3200)

  const keybar = await evalJson(`JSON.stringify({
    text: (document.querySelector('.keybar')?.innerText || '').replace(/\\s+/g, ' ').trim(),
    kbd: Array.from(document.querySelectorAll('.keybar-right kbd')).map(k => k.innerText.trim()),
    left: Math.round(document.querySelector('.keybar')?.getBoundingClientRect().left ?? -1),
    bottom: Math.round(document.querySelector('.keybar')?.getBoundingClientRect().bottom ?? -1),
    shell: !!document.querySelector('.keybar.keybar--shell')
  })`)
  ok('右侧提示里同时出现 Shift 与 ?',
    (keybar?.kbd || []).includes('Shift') && (keybar?.kbd || []).includes('?'),
    `kbd=[${(keybar?.kbd || []).join('|')}]`)
  ok('提示文字仍是「全部快捷键」', /全部快捷键/.test(keybar?.text || ''), keybar?.text)

  // 快捷键面板里也要写 Shift + ?
  await send(ws, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key: '?', code: 'Slash', windowsVirtualKeyCode: 191, text: '?',
    modifiers: 8 // shift
  })
  await send(ws, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: '?', code: 'Slash', windowsVirtualKeyCode: 191, modifiers: 8
  })
  await sleep(700)
  const panel = await evalJson(`JSON.stringify({
    open: !!document.querySelector('.shortcut-panel, .shortcut-help, .el-dialog'),
    text: (document.body.innerText || '').includes('打开 / 关闭本面板')
  })`)
  ok('Shift + ? 能打开快捷键面板', !!panel?.open && panel?.text, `open=${panel?.open}`)
  await send(ws, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27
  })
  await send(ws, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27
  })
  await sleep(500)

  // ================================================================ 2. 侧边栏铺满
  console.log('\n— 侧边栏与键位条布局 —')
  const layout = await evalJson(`JSON.stringify({
    innerH: window.innerHeight,
    innerW: window.innerWidth,
    sideTop: Math.round(document.querySelector('.side-nav')?.getBoundingClientRect().top ?? -1),
    sideBottom: Math.round(document.querySelector('.side-nav')?.getBoundingClientRect().bottom ?? -1),
    sideH: Math.round(document.querySelector('.side-nav')?.getBoundingClientRect().height ?? -1),
    sideW: Math.round(document.querySelector('.side-nav')?.getBoundingClientRect().width ?? -1),
    keyLeft: Math.round(document.querySelector('.keybar')?.getBoundingClientRect().left ?? -1),
    keyBottom: Math.round(document.querySelector('.keybar')?.getBoundingClientRect().bottom ?? -1),
    keyShell: !!document.querySelector('.keybar.keybar--shell')
  })`)
  ok('页面有侧边栏', (layout?.sideH ?? 0) > 0, `高 ${layout?.sideH}px`)
  ok('侧边栏高度 = 视口高度（铺到屏幕底部）',
    Math.abs((layout?.sideH ?? 0) - (layout?.innerH ?? 0)) <= 1,
    `侧栏 ${layout?.sideH} vs 视口 ${layout?.innerH}`)
  ok('侧边栏底边与视口底对齐',
    Math.abs((layout?.sideBottom ?? 0) - (layout?.innerH ?? 0)) <= 1,
    `底边 ${layout?.sideBottom} vs ${layout?.innerH}`)
  ok('键位条带 --shell 修饰类（不再通栏）', layout?.keyShell === true)
  ok('键位条左边界让出侧边栏宽度',
    Math.abs((layout?.keyLeft ?? -1) - (layout?.sideW ?? -2)) <= 1,
    `键位条左 ${layout?.keyLeft} vs 侧栏宽 ${layout?.sideW}`)
  ok('键位条仍贴在屏幕底部',
    Math.abs((layout?.keyBottom ?? 0) - (layout?.innerH ?? 0)) <= 1,
    `底边 ${layout?.keyBottom} vs ${layout?.innerH}`)
  await shot('fix-03-侧边栏铺满与键位条右移')

  // ================================================================ 3. 中间关：出「下一关」
  console.log('\n— 词汇第 1 关结算（非最后一关）—')
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/quiz/vocab/1` })
  await sleep(3200)
  const done1 = await answerWholeLevel()
  ok('第 1 关能答完并进入结算', done1)
  await sleep(800)

  const r1 = await evalJson(`JSON.stringify({
    hasResult: !!document.querySelector('.result-card'),
    chip: (document.querySelector('.result-line .chip')?.innerText || '').trim(),
    allCleared: !!document.querySelector('.all-cleared'),
    allClearedText: (document.querySelector('.all-cleared')?.innerText || '').replace(/\\s+/g, ' ').trim(),
    btns: Array.from(document.querySelectorAll('.btn-row .el-button')).map(b => ({
      text: b.innerText.replace(/\\s+/g, ' ').trim(),
      cls: b.className
    })),
    back: (() => {
      const b = Array.from(document.querySelectorAll('.btn-row .el-button'))
        .find(x => x.innerText.includes('返回关卡'));
      return b ? b.className : '';
    })()
  })`)
  const nextBtn = (r1?.btns || []).find((b) => b.text.startsWith('下一关'))
  ok('第 1 关本次判定为通关', /恭喜通关/.test(r1?.chip || ''), r1?.chip)
  ok('结算页出现「下一关」按钮', !!nextBtn, nextBtn ? nextBtn.text : '未找到')
  ok('「下一关」是主按钮', /btn-primary/.test(nextBtn?.cls || ''), nextBtn?.cls)
  ok('非最后一关不显示通关收尾文案', r1?.allCleared === false, r1?.allClearedText || '(未出现)')
  ok('「返回关卡」降级为次要按钮', /btn-ghost/.test(r1?.back || ''), r1?.back)
  ok('非最后一关不弹庆祝弹窗', !(await evalJson(`!!document.querySelector('.celebrate-title')`)))
  await shotBottom('fix-01-词汇第1关结算-出现下一关')

  // 点它真的能到第 2 关
  await evalJson(`(() => {
    const b = Array.from(document.querySelectorAll('.btn-row .el-button'))
      .find(x => x.innerText.includes('下一关'));
    if (b) b.click();
    return 'ok';
  })()`)
  await sleep(2600)
  const r2 = await evalJson(`JSON.stringify({
    hash: location.hash,
    hasResult: !!document.querySelector('.result-card'),
    hasOptions: document.querySelectorAll('.option').length > 0
      || !!document.querySelector('.spell-input')
  })`)
  ok('点「下一关」跳到第 2 关', /\/quiz\/vocab\/2/.test(r2?.hash || ''), r2?.hash)
  ok('切关后清掉了上一关的结算态', r2?.hasResult === false)
  ok('第 2 关渲染出作答控件', r2?.hasOptions === true)

  // ================================================================ 4. 最后一关：出收尾文案
  console.log('\n— 词汇第 6 关结算（最后一关）—')
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/quiz/vocab/6` })
  await sleep(3200)
  const done6 = await answerWholeLevel()
  ok('第 6 关能答完并进入结算', done6)
  await sleep(900)

  const r6 = await evalJson(`JSON.stringify({
    hasResult: !!document.querySelector('.result-card'),
    chip: (document.querySelector('.result-line .chip')?.innerText || '').trim(),
    allCleared: !!document.querySelector('.all-cleared'),
    text: (document.querySelector('.all-cleared')?.innerText || '').replace(/\\s+/g, ' ').trim(),
    nextBtn: Array.from(document.querySelectorAll('.btn-row .el-button'))
      .some(b => b.innerText.includes('下一关'))
  })`)
  ok('第 6 关本次判定为通关', /恭喜通关/.test(r6?.chip || ''), r6?.chip)
  ok('最后一关不出现「下一关」按钮', r6?.nextBtn === false)
  ok('最后一关出现通关收尾文案', r6?.allCleared === true, `allCleared=${r6?.allCleared}`)
  ok('收尾文案措辞与要求一致',
    /Congratulations！You cleared the level\./.test(r6?.text || ''), r6?.text)

  // 庆祝弹窗：最后一关要弹，中间关不许弹
  const dlg6 = await evalJson(`JSON.stringify({
    open: !!document.querySelector('.celebrate-dialog'),
    title: (document.querySelector('.celebrate-title')?.innerText || '').trim(),
    en: (document.querySelector('.celebrate-en')?.innerText || '').trim(),
    sub: (document.querySelector('.celebrate-sub')?.innerText || '').replace(/\\s+/g, ' ').trim(),
    btns: Array.from(document.querySelectorAll('.celebrate-actions .el-button'))
      .map(b => b.innerText.trim())
  })`)
  ok('最后一关弹出庆祝弹窗', dlg6?.open === true)
  ok('弹窗标题是 Congratulations！', /^Congratulations！$/.test(dlg6?.title || ''), dlg6?.title)
  ok('弹窗正文是 You cleared the level.', /^You cleared the level\.$/.test(dlg6?.en || ''), dlg6?.en)
  ok('弹窗说明通关了全部几关', /全部\s*6\s*个词汇关卡/.test(dlg6?.sub || ''), dlg6?.sub)
  ok('弹窗给出返回关卡与再来一次',
    (dlg6?.btns || []).includes('返回关卡') && (dlg6?.btns || []).includes('再来一次'),
    `[${(dlg6?.btns || []).join('|')}]`)
  await shot('fix-04-最后一关通关庆祝弹窗')

  // 点弹窗里的「返回关卡」应真的回到关卡列表
  await evalJson(`(() => {
    const b = Array.from(document.querySelectorAll('.celebrate-actions .el-button'))
      .find(x => x.innerText.includes('返回关卡'));
    if (b) b.click();
    return 'ok';
  })()`)
  await sleep(1200)
  const afterBack = await evalJson(`JSON.stringify({
    hash: location.hash,
    dialogGone: !document.querySelector('.celebrate-title')
  })`)
  ok('弹窗「返回关卡」回到关卡列表', /#\/vocab$/.test(afterBack?.hash || ''), afterBack?.hash)
  ok('点完弹窗自动收起', afterBack?.dialogGone === true)

  // ================================================================ 5. 听力页同一套判定
  console.log('\n— 听力关卡结算（与词汇同一套判定，这里实测确认没走偏）—')

  /** Ctrl+; 看答案（本题按放弃处理）→ Enter 下一句，直到出结算 */
  async function skipWholeListenLevel(maxSteps = 14) {
    for (let i = 0; i < maxSteps; i++) {
      const st = await evalJson(`JSON.stringify({
        result: !!document.querySelector('.result-card'),
        empty: !!document.querySelector('.empty')
      })`)
      if (st?.result) return true
      if (st?.empty) return false
      await send(ws, 'Input.dispatchKeyEvent', {
        type: 'keyDown', key: ';', code: 'Semicolon', windowsVirtualKeyCode: 186,
        text: ';', modifiers: 2
      })
      await send(ws, 'Input.dispatchKeyEvent', {
        type: 'keyUp', key: ';', code: 'Semicolon', windowsVirtualKeyCode: 186, modifiers: 2
      })
      await sleep(700)
      await pressEnter()
      await sleep(800)
    }
    return false
  }

  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/listen/1/easy` })
  await sleep(3600)
  const ld1 = await skipWholeListenLevel()
  ok('听力第 1 关能走到结算', ld1)
  const lr1 = await evalJson(`JSON.stringify({
    chip: (document.querySelector('.result-line .chip')?.innerText || '').trim(),
    allCleared: !!document.querySelector('.all-cleared'),
    next: (() => {
      const b = Array.from(document.querySelectorAll('.btn-row .el-button'))
        .find(x => x.innerText.includes('下一关'));
      return b ? b.innerText.replace(/\\s+/g, ' ').trim() : '';
    })()
  })`)
  ok('听力第 1 关本次判定为通关', /恭喜通过/.test(lr1?.chip || ''), lr1?.chip)
  ok('听力非最后一关出现「下一关」', /下一关/.test(lr1?.next || ''), lr1?.next || '(未出现)')
  ok('听力非最后一关不显示收尾文案', lr1?.allCleared === false)

  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/listen/6/hard` })
  await sleep(3600)
  const ld6 = await skipWholeListenLevel()
  ok('听力第 6 关能走到结算', ld6)
  const lr6 = await evalJson(`JSON.stringify({
    chip: (document.querySelector('.result-line .chip')?.innerText || '').trim(),
    allCleared: !!document.querySelector('.all-cleared'),
    text: (document.querySelector('.all-cleared')?.innerText || '').replace(/\\s+/g, ' ').trim(),
    next: Array.from(document.querySelectorAll('.btn-row .el-button'))
      .some(x => x.innerText.includes('下一关'))
  })`)
  ok('听力第 6 关本次判定为通关', /恭喜通过/.test(lr6?.chip || ''), lr6?.chip)
  ok('听力最后一关不出现「下一关」', lr6?.next === false)
  ok('听力最后一关出现通关收尾文案', lr6?.allCleared === true)
  ok('听力收尾文案措辞与要求一致',
    /Congratulations！You cleared the level\./.test(lr6?.text || ''), lr6?.text)

  // ================================================================ 收尾
  console.log(`\n${'='.repeat(62)}`)
  console.log(`通过 ${pass} 项 / 失败 ${fail} 项` + (fail ? `\n失败：${failures.join('、')}` : '  ——  全部通过'))
  console.log('='.repeat(62))

  ws.close()
  chrome.kill()
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本异常：', e)
  process.exit(1)
})
