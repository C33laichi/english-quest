/**
 * 音频触发审计：定位「我没点播放，听力却在响」的真实触发点
 *
 * 做法：在页面创建前 hook 掉 HTMLMediaElement.prototype.play / pause
 * 和 speechSynthesis.speak，记录每一次调用的调用栈与 play() 的
 * Promise 结果（OK / REJECT:NotAllowedError）。然后按真实用户路径走一遍：
 *
 *   S1 无手势，SPA 内换 hash 进听力页      → 会不会响？
 *   S2 真实点击侧栏进听力页（有手势）      → 会不会响？
 *   S3 判分后按 Enter 切下一句             → 有没有人偷偷播？
 *   S4 播放中点击侧栏离开                  → 有没有停住？
 *
 * 两种浏览器自动播放策略各跑一遍：
 *   默认（--gesture）: document-user-activation-required  ← 真实 Chrome 的默认
 *   --loose          : no-user-gesture-required           ← 站点被用户「信任」后的状态
 *
 * 用法：
 *   node scripts/diag_audio.mjs            # 两种策略都跑
 *   node scripts/diag_audio.mjs --loose    # 只跑宽松策略
 */

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9351
const LEVEL = '1'
const ONLY_LOOSE = process.argv.includes('--loose')

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

/** 页面创建前注入：记录所有发声行为 + 调用栈 */
const HOOK = `
(() => {
  window.__audit = [];
  window.__media = [];
  const src2 = (m) => String(m.currentSrc || m.src || '').split('/').slice(-2).join('/');
  const rec = (type, data) => {
    let stack = '';
    try {
      stack = (new Error().stack || '')
        .split('\\n').slice(2, 6)
        .map((s) => s.trim().replace(/^at\\s+/, '').replace(/\\s*\\(.*/, ''))
        .filter((s) => s && !/^rec$/.test(s))
        .join(' < ');
    } catch (e) {}
    window.__audit.push(Object.assign({ t: Math.round(performance.now()), type }, data, { stack }));
    return window.__audit.length - 1;
  };
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const i = rec('play', { src: src2(this) });
    window.__media.push(this);
    const p = op.apply(this, arguments);
    if (p && p.then) {
      p.then(() => { window.__audit[i].r = 'OK'; window.__audit[i].playing = !this.paused; })
       .catch((e) => { window.__audit[i].r = 'REJECT:' + ((e && e.name) || e); });
    }
    return p;
  };
  const opause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function () {
    rec('pause', { src: src2(this) });
    return opause.apply(this, arguments);
  };
  if (window.speechSynthesis) {
    const os = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function (u) {
      rec('speak', { text: String((u && u.text) || '').slice(0, 40) });
      return os(u);
    };
  }
})();
`

async function runPolicy(loose) {
  const label = loose ? '宽松策略 (no-user-gesture-required)' : '默认策略 (document-user-activation-required)'
  console.log(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`)

  const userDataDir = mkdtempSync(join(tmpdir(), 'eq-audio-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=' + (loose ? 'no-user-gesture-required' : 'document-user-activation-required'),
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

  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')
  await send(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: HOOK })

  // ---- 登录（fetch 不会产生 user activation）----
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
  const loginOk = await evaluate(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'student', password: (process.env.EQ_PASS || '') })
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

  // 整页加载到首页（新文档 → hook 生效）
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/home` })
  await sleep(3200)

  const dump = async (title) => {
    const rows = await evaluate('JSON.stringify(window.__audit || [])')
    console.log(`\n--- ${title} ---`)
    if (!rows.length) {
      console.log('  （无任何 play / pause / speak 调用）')
    } else {
      for (const r of rows) {
        const extra = r.r ? ` → ${r.r}${r.playing !== undefined ? `, playing=${r.playing}` : ''}` : ''
        console.log(`  [${String(r.t).padStart(6)}ms] ${r.type.padEnd(6)} ${(r.src || r.text || '')}${extra}`)
        if (r.stack) console.log(`            ↳ ${r.stack}`)
      }
    }
    return rows
  }
  const clearAudit = () => evaluate('window.__audit = []; true')
  const mediaState = `JSON.stringify((window.__media || []).map((m) => ({ paused: m.paused, src: String(m.src || '').split('/').slice(-2).join('/'), t: +m.currentTime.toFixed(2) })))`

  // ---- S1：无手势，SPA 换 hash 进听力页 ----
  await clearAudit()
  await evaluate(`location.hash = '#/listen/${LEVEL}/easy'`)
  await sleep(3800)
  const s1 = await dump('S1 · 无手势，SPA 内换 hash 直接进听力页')

  const where = () => evaluate('JSON.stringify({ hash: location.hash, path: document.querySelector(".quiz-bar-title")?.innerText || "" })')
  const clickEl = async (findExpr, what) => {
    const rect = await evaluate(findExpr)
    if (!rect) {
      console.log(`  （找不到点击目标：${what}）`)
      return false
    }
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send(ws, 'Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    }
    return true
  }

  console.log('  S1 落点:', JSON.stringify(await where()))

  // ---- S2：在听力页判分后按 Enter 切下一句（另一个自动播放触发点）----
  await clearAudit()
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: ';', code: 'Semicolon', windowsVirtualKeyCode: 186, modifiers: 2 })
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: ';', code: 'Semicolon', windowsVirtualKeyCode: 186, modifiers: 2 })
  await sleep(1500)
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await sleep(2800)
  const s2 = await dump('S2 · 判分后按 Enter 切下一句')
  console.log('  S2 落点:', JSON.stringify(await where()))

  // ---- S3：播放中退出听力页（onUnmounted 有没有把声音停住）----
  await clearAudit()
  // 先手动播一次，确保「退出那一刻确实在响」
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, modifiers: 2 })
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, modifiers: 2 })
  await sleep(600)
  const beforeLeave = await evaluate(mediaState)
  // 点「← 退出」（DOM click 不会产生 user activation，恰好用来测真实离开路径）
  await evaluate(`document.querySelector('.quiz-bar-back')?.click(); true`)
  await sleep(1800)
  const s3 = await dump('S3 · 播放中点击「退出」离开听力页')
  const after = await evaluate(mediaState)
  console.log('  退出前媒体状态:', JSON.stringify(beforeLeave))
  console.log('  退出后媒体状态:', JSON.stringify(after))
  console.log('  S3 落点:', JSON.stringify(await where()))

  // ---- S4：在关卡列表页真实点击「简单模式」进入 ----
  await clearAudit()
  const easyRect = await evaluate(`
    JSON.stringify((() => {
      const el = document.querySelector('.mode-btn.easy');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })())
  `)
  if (easyRect) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send(ws, 'Input.dispatchMouseEvent', { type, x: easyRect.x, y: easyRect.y, button: 'left', clickCount: 1 })
    }
  } else {
    console.log('  （找不到 .mode-btn.easy，改为直接换 hash）')
    await evaluate(`location.hash = '#/listen/${LEVEL}/easy'`)
  }
  await sleep(3800)
  const s4 = await dump('S4 · 列表页真实点击「简单模式」进入听力页')
  console.log('  S4 落点:', JSON.stringify(await where()))

  // 统计
  const countPlay = (rows) => rows.filter((r) => r.type === 'play').length
  const countOk = (rows) => rows.filter((r) => r.type === 'play' && r.r === 'OK').length
  const countRej = (rows) => rows.filter((r) => r.type === 'play' && String(r.r || '').startsWith('REJECT')).length
  const countSpeak = (rows) => rows.filter((r) => r.type === 'speak').length

  console.log(`\n>>> 小结（${loose ? '宽松' : '默认'}策略）`)
  console.log(`  S1 无手势进入: play=${countPlay(s1)} (成功 ${countOk(s1)} / 被拦 ${countRej(s1)})  speak=${countSpeak(s1)}`)
  console.log(`  S2 切下一句  : play=${countPlay(s2)} (成功 ${countOk(s2)} / 被拦 ${countRej(s2)})  speak=${countSpeak(s2)}`)
  console.log(`  S3 切走页面  : play=${countPlay(s3)}  媒体状态=${JSON.stringify(after)}`)
  console.log(`  S4 点击进入  : play=${countPlay(s4)} (成功 ${countOk(s4)} / 被拦 ${countRej(s4)})  speak=${countSpeak(s4)}`)

  ws.close()
  chrome.kill()
  await sleep(600)
}

async function main() {
  if (ONLY_LOOSE) {
    await runPolicy(true)
  } else {
    await runPolicy(false)
    await runPolicy(true)
  }
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
