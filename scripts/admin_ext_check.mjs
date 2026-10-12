/**
 * 后台新增能力校验（零依赖，真实 Chrome + CDP）
 *
 * 对应任务书对齐补的三处能力，逐项在**真实浏览器**里点开验证：
 *   ① 用户管理 → 「新增用户」弹窗（可指定角色：学生 / 管理员）
 *   ② 词汇题库 → 「关卡管理」弹窗（关卡列表 + 新增关卡表单）
 *   ③ 语法题库 → 「讲义管理」页签 → 「新增 Day」按钮与删除入口
 *
 * 只做「渲染 + 弹窗能打开」的验证，**不做任何写操作**（不新增、不删除数据），
 * 因此可以反复执行，不会污染数据库。
 *
 * 用法：node scripts/admin_ext_check.mjs
 * 前置：后端 8090、前端 5173 均已启动
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9336
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'

mkdirSync(SHOT_DIR, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'eq-admin-'))

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

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail })
  console.log(`   ${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? '  ' + detail : ''}`)
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
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' })

  let version = null
  for (let i = 0; i < 40; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
      break
    } catch (e) {
      await sleep(500)
    }
  }
  if (!version) throw new Error('Chrome 调试端口未就绪')

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

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
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  })

  async function evalJson(expr, awaitPromise = false) {
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise })
    const v = r.result.value
    if (typeof v === 'string') { try { return JSON.parse(v) } catch (e) { return v } }
    return v
  }

  async function shot(name) {
    try {
      const img = await send(ws, 'Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(SHOT_DIR, `admin_ext_${name}.png`), Buffer.from(img.data, 'base64'))
    } catch (e) { /* 截图失败不影响断言 */ }
  }

  async function loginAsAdmin() {
    const expr = `
      (async () => {
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: (process.env.EQ_ADMIN_PASS || '') })
        });
        const b = await r.json();
        if (b.code !== 200) return 'LOGIN_FAIL: ' + b.msg;
        const d = b.data;
        localStorage.setItem('eq_token', d.token);
        localStorage.setItem('eq_user', JSON.stringify({
          userId: d.userId, username: d.username, nickname: d.nickname, role: d.role,
          avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
        }));
        return 'OK:' + d.role;
      })()
    `
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result.value
  }

  /** 整页导航（带时间戳，确保每次都是全新加载） */
  async function goto(path) {
    consoleErrors.length = 0
    pageErrors.length = 0
    await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#${path}` })
    await sleep(2600)
  }

  /**
   * 按可见文本点击。
   * 只匹配「可点击控件」而不是任意 div/span，避免命中同名的普通文字节点。
   */
  async function clickByText(text) {
    const expr = `
      (() => {
        const sel = 'button.el-button, .el-tabs__item, .el-radio-button__inner, button';
        const els = [...document.querySelectorAll(sel)]
          .filter(e => e.offsetParent !== null && (e.innerText || '').trim() === ${JSON.stringify(text)});
        if (!els.length) return 'NOT_FOUND';
        const el = els[0];
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
        el.click();
        return 'CLICKED';
      })()
    `
    return evalJson(expr)
  }

  /** 当前所有可见弹窗（含表单）的合并文本 */
  async function dialogText() {
    const expr = `
      (() => {
        const ds = [...document.querySelectorAll('.el-dialog, .el-message-box')]
          .filter(e => e.offsetParent !== null && getComputedStyle(e).display !== 'none');
        return ds.map(d => (d.innerText || '').replace(/\\s+/g, ' ')).join(' || ');
      })()
    `
    return evalJson(expr)
  }

  /** 页面上是否存在可见的某个文本 */
  async function hasVisible(text) {
    const expr = `
      (() => {
        const all = [...document.querySelectorAll('button, .el-tabs__item, .el-form-item__label, .el-radio-button__inner, th')];
        return all.some(e => e.offsetParent !== null && (e.innerText || '').trim() === ${JSON.stringify(text)});
      })()
    `
    return evalJson(expr)
  }

  async function pressEscape() {
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
    })
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27
    })
    await sleep(500)
  }

  // 必须先落到站点上再注入登录态：about:blank 下 fetch('/api/...') 没有 base URL，会直接抛错
  await goto('/login')
  const login = await loginAsAdmin()
  console.log('管理员登录:', login)
  if (!String(login).startsWith('OK')) throw new Error('管理员登录失败')

  /* ---------------- ① 用户管理 → 新增用户 ---------------- */
  console.log('\n' + '='.repeat(64))
  console.log('① 用户管理：新增用户（可指定 学生 / 管理员）')
  console.log('='.repeat(64))
  await goto('/admin/users')

  check('页面上有「新增用户」按钮', await hasVisible('新增用户'))
  const c1 = await clickByText('新增用户')
  check('点击「新增用户」', c1 === 'CLICKED', `结果=${c1}`)
  await sleep(700)

  const d1 = await dialogText()
  check('弹出「新增用户」对话框', d1.includes('新增用户'), `弹窗文本长度=${d1.length}`)
  for (const label of ['用户名', '密码', '昵称', '角色']) {
    check(`弹窗含字段「${label}」`, d1.includes(label))
  }
  check('角色可选「学生」', d1.includes('学生'))
  check('角色可选「管理员」（管理员注册入口）', d1.includes('管理员'))
  await shot('1_users_dialog')
  await pressEscape()
  check('Esc 可关闭弹窗', !(await dialogText()).includes('用户名'))

  /* ---------------- ② 词汇题库 → 关卡管理 ---------------- */
  console.log('\n' + '='.repeat(64))
  console.log('② 词汇题库：关卡管理（增 / 查 / 改 / 删）')
  console.log('='.repeat(64))
  await goto('/admin/vocab')

  check('页面上有「关卡管理」按钮', await hasVisible('关卡管理'))
  const c2 = await clickByText('关卡管理')
  check('点击「关卡管理」', c2 === 'CLICKED', `结果=${c2}`)
  await sleep(700)

  const d2 = await dialogText()
  check('弹出「词汇关卡管理」对话框', d2.includes('词汇关卡管理'), `弹窗文本长度=${d2.length}`)
  check('关卡列表含表头「关卡名称」', d2.includes('关卡名称'))
  check('关卡列表含表头「及格分」', d2.includes('及格分'))
  check('列表内有「编辑」入口', d2.includes('编辑'))
  check('列表内有「删除」入口（本次新增）', d2.includes('删除'))
  check('有「新增关卡」按钮', d2.includes('新增关卡'))
  await shot('2_levels_dialog')

  const c3 = await clickByText('新增关卡')
  check('点击「新增关卡」', c3 === 'CLICKED', `结果=${c3}`)
  await sleep(700)
  const d3 = await dialogText()
  check('弹出关卡表单（标题「新增关卡」）', d3.includes('新增关卡'), `弹窗文本长度=${d3.length}`)
  for (const label of ['关卡名称', '关序号', '抽题数', '及格分', '简介']) {
    check(`关卡表单含字段「${label}」`, d3.includes(label))
  }
  await shot('3_level_form')
  await pressEscape()
  await pressEscape()

  /* ---------------- ③ 语法题库 → 讲义管理 ---------------- */
  console.log('\n' + '='.repeat(64))
  console.log('③ 语法题库：讲义管理（新增 Day / 删除关卡）')
  console.log('='.repeat(64))
  await goto('/admin/grammar')

  check('默认在「题目管理」页签', await hasVisible('题目管理'))
  const c4 = await clickByText('讲义管理')
  check('点击「讲义管理」页签', c4 === 'CLICKED', `结果=${c4}`)
  await sleep(900)

  const t3 = await evalJson(`document.body.innerText.replace(/\\s+/g, ' ')`)
  check('切到讲义页签后能看到「新增 Day」按钮', t3.includes('新增 Day'), '')
  check('讲义列表含表头「天数」', t3.includes('天数'))
  check('讲义列表含表头「标题」', t3.includes('标题'))
  check('列表内有「删除」入口（本次新增）', t3.includes('删除'))
  check('页面提示了删除限制（只能从最后一天删）', t3.includes('只能从最后一天'))
  await shot('4_grammar_lesson_tab')

  check('全程无页面级 JS 异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
  check('全程无控制台 error', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

  /* ---------------- 汇总 ---------------- */
  const pass = checks.filter((c) => c.ok).length
  console.log('\n' + '='.repeat(64))
  console.log(`结果：通过 ${pass} / ${checks.length}`)
  if (pass !== checks.length) {
    console.log('失败项：')
    checks.filter((c) => !c.ok).forEach((c) => console.log(`  - ${c.name}  ${c.detail}`))
  }
  console.log(`截图目录：${SHOT_DIR}`)

  ws.close()
  chrome.kill()
  try { rmSync(userDataDir, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
  process.exit(pass === checks.length ? 0 : 1)
}

main().catch((e) => {
  console.error('脚本异常:', e.message)
  process.exit(2)
})
