/**
 * 首页「等级进度」渲染回归（零依赖 CDP）
 *
 * 验证的是**修好的那两处显示**，不是接口：
 *   1. 不能出现「182 / 118」这种分子大于分母
 *   2. 不能出现「距下一级还差 0 分」
 *   3. 进度条宽度要真的等于 cur/need
 *
 * 用法：node scripts/home_level_ui_check.mjs [light|dark]
 */

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9352
const THEME = (process.argv[2] || 'light') === 'dark' ? 'dark' : 'light'

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

const userDataDir = mkdtempSync(join(tmpdir(), 'eq-homelevel-'))

async function main() {
  console.log(`\n== 首页等级进度渲染检查（${THEME}）==\n`)

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

  // 注入登录态
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
      localStorage.setItem('eq_theme', '${THEME}');
      return 'OK';
    })()
  `)
  if (String(loginOk).startsWith('FAIL')) throw new Error(`登录失败：${loginOk}`)

  // 带变化 query 强制整页加载
  await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/home` })
  await sleep(3400)
  await sleep(600)

  // 等接口回来并渲染
  let data = null
  for (let i = 0; i < 20; i++) {
    data = await evaluate(`
      (() => {
        const box = document.querySelector('.level-progress-text');
        if (!box) return null;
        const bar = document.querySelector('.level-progress-inner');
        const track = document.querySelector('.level-progress-bar');
        const txt = box.innerText.replace(/\\s+/g, ' ').trim();
        const texts = [...box.querySelectorAll('span')].map(s => s.innerText.trim());
        return JSON.stringify({
          txt,
          texts,
          barW: bar ? Math.round(bar.getBoundingClientRect().width) : -1,
          trackW: track ? Math.round(track.getBoundingClientRect().width) : -1,
          hash: location.hash
        });
      })()
    `)
    if (data && data.txt) break
    await sleep(500)
  }

  ok('首页等级进度区已渲染', !!data && !!data.txt, data ? `hash=${data.hash}` : '元素未找到')
  if (!data || !data.txt) {
    await finish(ws, chrome)
    return
  }

  console.log(`\n  实际文案：「${data.txt}」\n`)

  // 1) 不能出现「还差 0 分」
  ok('不出现「距下一级还差 0 分」', !/还差\s*0\s*分/.test(data.txt), data.txt)

  // 2) 右侧 X / Y，分子不得大于分母
  const m = data.txt.match(/(\d+)\s*\/\s*(\d+)/)
  ok('存在「已得 / 所需」数字对', !!m, m ? m[0] : '未匹配到')
  if (m) {
    const cur = Number(m[1])
    const need = Number(m[2])
    ok('分子 <= 分母（不会出现 182/118）', cur <= need, `${cur} / ${need}`)
  }

  // 3) 「还差 N 分」的 N 必须 > 0
  const gapMatch = data.txt.match(/还差\s*(\d+)\s*分/)
  if (gapMatch) {
    ok('「还差 N 分」的 N > 0', Number(gapMatch[1]) > 0, `还差 ${gapMatch[1]} 分`)
  } else {
    // 满级时会显示「已达到最高等级」，这也算合法
    ok('满级分支显示正确', /最高等级/.test(data.txt), data.txt)
  }

  // 4) 进度条宽度与 cur/need 吻合（容差 2%）
  if (m && data.trackW > 0) {
    const cur = Number(m[1])
    const need = Number(m[2])
    const expectPct = Math.round((cur / need) * 100)
    const actualPct = Math.round((data.barW / data.trackW) * 100)
    ok(
      '进度条宽度 = cur / need',
      Math.abs(actualPct - expectPct) <= 2,
      `期望 ${expectPct}%，实际 ${actualPct}%`
    )
  }

  await finish(ws, chrome)
}

async function finish(ws, chrome) {
  console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==\n`)
  if (fail) {
    console.log('失败项：')
    failures.forEach((f) => console.log('  - ' + f))
    console.log('')
  }
  try {
    ws.close()
  } catch {}
  chrome.kill()
  await sleep(400)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本异常：', e)
  process.exit(1)
})
