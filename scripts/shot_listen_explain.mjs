/**
 * 听力关错句「AI 针对性讲解」—— 真实浏览器渲染验证
 *
 * 为什么不能只看接口：讲解是「交卷后异步拉取 + 逐条替换占位态」渲染出来的，
 * 接口 200 不代表页面上真的出现了讲解区块（本项目吃过"断言过、肉眼不对"的亏）。
 *
 * 流程：登录 → 进听力关（简单模式）→ 每题只填第一个词（必然判错）→ 交卷
 *      → 等讲解从「加载中」落定 → 断言 DOM + 截图
 *
 * 用法：node scripts/shot_listen_explain.mjs
 * 前置：后端 8090 + 前端 dist 服务器 5174 都已启动
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5174'
const PORT = 9361
const LEVEL = Number(process.argv[2] || 1)
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

mkdirSync(SHOT_DIR, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-listen-explain-'))

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
    }, 90000)
  })
}

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

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,2000',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank'
  ])

  await sleep(2600)
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const target = list.find((t) => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res) => (ws.onopen = res))

  const pageErrors = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params?.exceptionDetails?.exception?.description || 'unknown')
    }
  }

  const evaluate = async (expr, timeoutMs = 90000) => {
    const r = await send(ws, 'Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs
    })
    if (r.exceptionDetails) {
      throw new Error('页面执行异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails))
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

  try {
    // ---------- 登录 ----------
    console.log('\n── 登录 ──────────────────────────────────────────')
    await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
    await sleep(2200)
    const loggedIn = await evaluate(`
      (async () => {
        const setVal = (el, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(el, v)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        const inputs = [...document.querySelectorAll('input')]
        if (inputs.length < 2) return { ok: false, why: 'input 不足 2 个' }
        setVal(inputs[0], 'student'); setVal(inputs[1], (process.env.EQ_PASS || ''))
        const btn = [...document.querySelectorAll('button')].find(b => /登\\s*录/.test(b.textContent || ''))
        if (!btn) return { ok: false, why: '未找到登录按钮' }
        btn.click()
        await new Promise(r => setTimeout(r, 2500))
        return { ok: location.hash.indexOf('login') < 0, hash: location.hash }
      })()
    `)
    ok('登录成功', loggedIn?.ok, `hash=${loggedIn?.hash}`)

    // ---------- 进听力关 ----------
    console.log('\n── 进入听力关并作答 ──────────────────────────────')
    await send(ws, 'Page.navigate', { url: `${BASE}/#/listen/${LEVEL}/EASY` })
    await sleep(2800)

    const answered = await evaluate(`
      (async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms))
        const btn = (re) => [...document.querySelectorAll('.btn-row button')]
          .find(b => re.test(b.textContent || '') && !b.disabled)
        let answered = 0
        for (let guard = 0; guard < 160; guard++) {
          if (document.querySelector('.result-card')) break
          // 已判分 → 点「下一句 / 查看成绩」
          if (document.querySelector('.judge')) {
            const nx = btn(/下一句|查看成绩/)
            if (nx) { nx.click(); answered++; await sleep(900); continue }
            await sleep(300)
            continue
          }
          // 未判分 → 每个格子填 zzz，再点「提交」
          const inputs = [...document.querySelectorAll('.slot-input')].filter(el => el.offsetParent !== null)
          if (inputs.length) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
            inputs.forEach((el) => {
              setter.call(el, 'zzz')
              el.dispatchEvent(new Event('input', { bubbles: true }))
            })
            await sleep(350)
            const sub = btn(/提交/)
            if (sub) { sub.click(); await sleep(800); continue }
          }
          await sleep(400)
        }
        return { answered, hasResult: !!document.querySelector('.result-card') }
      })()
    `)
    ok('走完听力关并进入结果页', answered?.hasResult, `作答 ${answered?.answered} 次`)

    // ---------- 等讲解落定 ----------
    const explainState = await evaluate(`
      (async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms))
        for (let i = 0; i < 120; i++) {
          const loading = document.querySelectorAll('.explain-loading').length
          const boxes = document.querySelectorAll('.explain-box').length
          if (boxes > 0 && loading === 0) break
          await sleep(250)
        }
        const boxes = [...document.querySelectorAll('.explain-box')]
        return {
          boxCount: boxes.length,
          loadingLeft: document.querySelectorAll('.explain-loading').length,
          bodies: boxes.map(b => (b.querySelector('.explain-body')?.textContent || '').trim()),
          titles: boxes.map(b => (b.querySelector('.explain-title')?.textContent || '').trim())
        }
      })()
    `)

    ok('页面上出现了解释区块', explainState?.boxCount > 0, `共 ${explainState?.boxCount} 个`)
    ok('所有讲解都已落定（无残留加载中）', explainState?.loadingLeft === 0,
      `loading=${explainState?.loadingLeft}`)
    const nonEmpty = (explainState?.bodies || []).filter(b => b.length > 20)
    ok('至少有一条讲解正文非空', nonEmpty.length > 0, `非空 ${nonEmpty.length} 条`)
    ok('讲解标题是听力专用文案', (explainState?.titles || []).every(t => t.includes('没听对')),
      `示例：${explainState?.titles?.[0] || '(无)'}`)
    // 听力讲解的关键价值：点出漏掉/多敲的词
    const anyDiff = nonEmpty.some(b => /漏掉|多敲|听错/.test(b))
    ok('讲解点出了词级差异', anyDiff, nonEmpty[0] ? `示例：${nonEmpty[0].slice(0, 70)}` : '（无正文）')

    ok('页面无未捕获的运行时异常', pageErrors.length === 0,
      pageErrors.length ? pageErrors[0].slice(0, 160) : '')

    // ---------- 截图 ----------
    const shot = await send(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const out = join(SHOT_DIR, `listen_explain_level${LEVEL}.png`)
    writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log(`\n   📸 截图：${out}`)
  } finally {
    console.log(`\n── 结果 ──────────────────────────────────────────`)
    console.log(`通过 ${pass} / 失败 ${fail}`)
    if (fails.length) {
      console.log('失败项：')
      fails.forEach((f) => console.log(`  · ${f}`))
      process.exitCode = 1
    }
    ws.close()
    chrome.kill()
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
