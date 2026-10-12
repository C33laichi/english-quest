/**
 * 音频行为回归：
 *   A. 听力页不再「自己响」——进关卡、切下一句都不许自动播放
 *   B. 错题本新增的朗读按钮工作正常——读对内容、再点会停
 *
 * 为什么不用访问计算样式：朗读是「有没有人调用 speechSynthesis.speak、
 * 传了什么文本」，这只能靠 hook 住 API 才看得见，看界面看不出来。
 * 而「有没有自己响」必须用 hook 抓 HTMLMediaElement.play 的调用栈，
 * 光听声音或看按钮高亮都会漏判（被浏览器拦下时按钮根本不会亮）。
 *
 * 用法：node scripts/audio_check.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9353
const LEVEL = '1'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    fail += 1
    console.log(`  ✗ ${name}${extra ? `  ${extra}` : ''}`)
  }
}
const section = (t) => console.log(`\n${t}`)

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

const HOOK = `
(() => {
  window.__playLog = [];
  window.__speakLog = [];
  const src2 = (m) => String(m.currentSrc || m.src || '').split('/').slice(-1)[0];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    let stack = '';
    try {
      stack = (new Error().stack || '').split('\\n').slice(2, 5)
        .map((s) => s.trim().replace(/^at\\s+/, '').replace(/\\s*\\(.*/, ''))
        .filter(Boolean).join(' < ');
    } catch (e) {}
    const rec = { src: src2(this), stack };
    window.__playLog.push(rec);
    const p = op.apply(this, arguments);
    if (p && p.then) {
      p.then(() => { rec.r = 'OK'; }).catch((e) => { rec.r = 'REJECT:' + ((e && e.name) || e); });
    }
    return p;
  };
  if (window.speechSynthesis) {
    const os = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function (u) {
      window.__speakLog.push({ text: String((u && u.text) || ''), lang: String((u && u.lang) || '') });
      return os(u);
    };
    const oc = window.speechSynthesis.cancel.bind(window.speechSynthesis);
    window.speechSynthesis.cancel = function () {
      window.__speakLog.push({ cancel: true });
      return oc();
    };
  }
  // 平滑滚动会让 scrollIntoView「还没滚到位就返回」，脚本据此算出的坐标必然落空。
  // 这不是产品问题，是测试脚本自己要处理的时序，统一关掉。
  const killSmooth = () => {
    const st = document.createElement('style');
    st.textContent = '*, *::before, *::after { scroll-behavior: auto !important; }';
    (document.head || document.documentElement).appendChild(st);
  };
  if (document.head) killSmooth();
  else document.addEventListener('DOMContentLoaded', killSmooth);
})();
`

const HAS_ZH = /[\u4e00-\u9fa5]/

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'eq-audiochk-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,1000',
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
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    const v = r.result?.value
    if (typeof v === 'string') {
      try { return JSON.parse(v) } catch { return v }
    }
    return v
  }

  const clickAt = async (rect) => {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send(ws, 'Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    }
  }
  const key = async (k, code, vk, modifiers = 0) => {
    await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers })
    await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers })
  }
  const goto = async (hash, wait = 3200) => {
    await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#${hash}` })
    await sleep(wait)
  }

  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')
  await send(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: HOOK })

  await goto('/login', 2200)
  const loginOk = await evaluate(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'student', password: '' })
      });
      const b = await r.json();
      if (b.code !== 200) return 'FAIL:' + b.msg;
      const d = b.data;
      localStorage.setItem('eq_token', d.token);
      localStorage.setItem('eq_user', JSON.stringify({ userId: d.userId, username: d.username, nickname: d.nickname, role: d.role }));
      localStorage.setItem('eq_theme', 'light');
      return 'OK';
    })()
  `)
  if (String(loginOk).startsWith('FAIL')) throw new Error('登录失败: ' + loginOk)

  /* ================= A. 听力页：不许自动响 ================= */
  section('A. 听力页不再自动播放')

  await goto(`/listen/${LEVEL}/easy`)
  const playOnEnter = await evaluate('JSON.stringify(window.__playLog || [])')
  ok('进入关卡后没有自动播放',
    playOnEnter.length === 0,
    playOnEnter.length ? `出现了 ${playOnEnter.length} 次 play：${playOnEnter.map((p) => p.stack).join(' | ')}` : '')

  // 判分（Ctrl+;）后按 Enter 切下一句 —— 这里最容易偷偷播
  await key(';', 'Semicolon', 186, 2)
  await sleep(1400)
  await key('Enter', 'Enter', 13)
  await sleep(2000)
  const playAfterNext = await evaluate('JSON.stringify(window.__playLog || [])')
  ok('切下一句后仍没有自动播放',
    playAfterNext.length === 0,
    playAfterNext.length ? `出现了 ${playAfterNext.length} 次 play：${playAfterNext.map((p) => p.stack).join(' | ')}` : '')

  // 手动 Ctrl+Space 必须还能播（别把功能一起删掉）
  await key(' ', 'Space', 32, 2)
  await sleep(1200)
  const playManual = await evaluate('JSON.stringify(window.__playLog || [])')
  ok('按 Ctrl+Space 能手动播放',
    playManual.length === 1 && playManual[0].r === 'OK',
    `play=${playManual.length} ${JSON.stringify(playManual.map((p) => `${p.src} ${p.r}`))}`)
  ok('手动播放的调用来源是键盘，不是页面自己',
    playManual.length === 1 && /onKeydown/.test(playManual[0].stack || ''),
    `stack=${playManual[0]?.stack}`)

  /* ================= B. 错题本：朗读按钮 ================= */
  section('B. 错题本朗读按钮')

  await goto('/error-book')
  const cards = await evaluate(`
    JSON.stringify([...document.querySelectorAll('.error-card')].map((el, i) => ({
      i,
      chip: el.querySelector('.chip')?.innerText.trim() || '',
      kp: ([...el.querySelectorAll('.muted')].map((x) => x.innerText.trim())
            .find((t) => t.startsWith('知识点：')) || '').replace('知识点：', '').trim(),
      stem: el.querySelector('.error-stem')?.innerText.trim() || '',
      correct: el.querySelector('.error-line .good')?.innerText.trim() || '',
      hasBtn: !!el.querySelector('.speak-btn')
    })))
  `)
  ok('错题本渲染出了卡片', cards.length > 0, `共 ${cards.length} 张`)

  const withBtn = cards.filter((c) => c.hasBtn)
  ok('带英文可读的错题都出现了朗读按钮', withBtn.length > 0, `${withBtn.length}/${cards.length} 张有按钮`)

  // 上轮修过的老 bug：听力错题曾被标成「语法」，这里必须能看到「听力」
  const chips = [...new Set(cards.map((c) => c.chip))].sort()
  ok('模块标签按三模块正确显示（听力没被标成语法）',
    chips.includes('听力'),
    `页面上的模块标签：${JSON.stringify(chips)}`)

  const pick = (m) => cards.find((c) => c.chip === m && c.hasBtn)

  const clickCardBtn = async (idx) => {
    const info = await evaluate(`
      (async () => {
        const el = document.querySelectorAll('.error-card')[${idx}];
        if (!el) return JSON.stringify({ err: 'no card' });
        el.scrollIntoView({ block: 'center' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const b = el.querySelector('.speak-btn');
        if (!b) return JSON.stringify({ err: 'no btn' });
        const r = b.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return JSON.stringify({
          x: Math.round(x), y: Math.round(y),
          vh: window.innerHeight,
          inView: r.top >= 0 && r.bottom <= window.innerHeight,
          hitTag: hit ? hit.tagName : null,
          hitCls: hit ? String(hit.className) : null,
          isSelf: hit === b,
          supported: 'speechSynthesis' in window
        });
      })()
    `)
    if (info.err) {
      console.log(`    点击诊断: ${JSON.stringify(info)}`)
      return false
    }
    await clickAt({ x: info.x, y: info.y })
    return info
  }
  const lastSpoken = () => evaluate(`
    JSON.stringify((window.__speakLog || []).filter((x) => x.text !== undefined).slice(-1)[0] || null)
  `)
  const speakCount = () => evaluate('JSON.stringify((window.__speakLog || []).filter((x) => x.text !== undefined).length)')
  const cancelCount = () => evaluate('JSON.stringify((window.__speakLog || []).filter((x) => x.cancel).length)')

  const vocab = pick('词汇')
  if (vocab) {
    const diag = await clickCardBtn(vocab.i)
    await sleep(600)
    // 只在点空时才打诊断，正常跑保持输出干净
    if (!diag || !diag.isSelf) console.log(`    点击诊断: ${JSON.stringify(diag)}`)
    const said = await lastSpoken()
    const want = vocab.kp
    ok('词汇错题朗读的是单词本身（不是带中文释义的题干）',
      !!said && said.text === want && !HAS_ZH.test(said.text),
      `期望「${want}」实际「${said?.text}」`)
  } else {
    ok('词汇错题朗读的是单词本身（不是带中文释义的题干）', false, '没找到带按钮的词汇错题')
  }

  const listen = pick('听力')
  if (listen) {
    await clickCardBtn(listen.i)
    await sleep(600)
    const said = await lastSpoken()
    ok('听力错题朗读的是英文原句（不是中文翻译）',
      !!said && said.text === listen.correct && !HAS_ZH.test(said.text),
      `期望「${listen.correct}」实际「${said?.text}」`)
  } else {
    ok('听力错题朗读的是英文原句（不是中文翻译）', false, '没找到带按钮的听力错题')
  }

  const grammar = pick('语法')
  if (grammar) {
    await clickCardBtn(grammar.i)
    await sleep(600)
    const said = await lastSpoken()
    const want = grammar.stem.replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim()
    ok('语法错题朗读前把 ______ 空位抹平了',
      !!said && said.text === want && !/_/.test(said.text),
      `期望「${want}」实际「${said?.text}」`)
  } else {
    ok('语法错题朗读前把 ______ 空位抹平了', false, '没找到带按钮的语法错题')
  }

  // 同一条再点一次要能停（否则只能等它念完）
  if (grammar) {
    const before = await cancelCount()
    await clickCardBtn(grammar.i)
    await sleep(500)
    const after = await cancelCount()
    ok('再次点击同一条会停止朗读',
      after > before,
      `cancel 次数 ${before} → ${after}`)
  }

  // 换一条读，应该有新的 speak（而不是被上一条卡住）
  if (vocab && listen) {
    const before = await speakCount()
    await clickCardBtn(listen.i)
    await sleep(600)
    const after = await speakCount()
    ok('点到另一条会改读那一条',
      after > before,
      `speak 次数 ${before} → ${after}`)
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  ws.close()
  chrome.kill()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
