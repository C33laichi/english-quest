/**
 * 截图验证：管理员「语法题批量导入」（浅色 / 深色各一轮）
 *
 * 与 shot_vocab_import.mjs 同源，差异在语法题的两条硬规则：
 *   1. 表头多一列「天数」，一份文件可以同时导入多个 Day；
 *   2. 4 个选项 + 答案必须全部填写（系统不自动生成干扰项）。
 *
 * 全程只在**一个临时 Day**（dayNo 97）里跑，跑完先删题再删 Day，
 * 最后断言题库 / 讲义总数回到开跑前 —— 绝不让演示数据留在真实题库里。
 *
 * 两条踩过的坑，本脚本都按规矩来：
 *   · 不用 el.click()：Element Plus 的 el-select 对合成 click 无反应，
 *     一律用 CDP Input.dispatchMouseEvent 派发真实鼠标事件；
 *   · 点击前先 scrollIntoView + elementFromPoint 命中校验，
 *     命中不到就抛错中止 —— 否则会静默穿透到下层，把演示数据写进真实关卡。
 *
 * 用法：node scripts/shot_grammar_import.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const API = BASE + '/api'
const PORT = 9341
const SHOT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots/grammar_import'
const DAY_NO = 97
const DAY_TITLE = '截图自检讲义（可删）'

mkdirSync(SHOT_DIR, { recursive: true })
const TMP = mkdtempSync(join(tmpdir(), 'eq-gimp-'))
const DL = join(TMP, 'dl')
mkdirSync(DL)
const CSV_PATH = join(TMP, 'gimport.csv')

// 三行分别验证「天数」列的三种写法：纯序号 / Day N / 留空（落默认 Day）
const CSV_TEXT = [
  '天数,题干,选项A,选项B,选项C,选项D,正确答案,知识点,解析',
  `${DAY_NO},Screenshot: I ______ him yesterday.,see,saw,seen,seeing,B,,`,
  `Day ${DAY_NO},Screenshot: He ______ to school every day.,go,goes,going,gone,B,手写考点,手写解析`,
  ',Screenshot: There ______ some milk in the glass.,is,are,be,were,A,,',
].join('\r\n') + '\r\n'
writeFileSync(CSV_PATH, '\ufeff' + CSV_TEXT, 'utf8')

// ------------------------------------------------------------------ 断言
let pass = 0
const fails = []
function check(name, ok, extra) {
  if (ok) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fails.push(name)
    const e = extra === undefined ? '' : JSON.stringify(extra).slice(0, 240)
    console.log(`  FAIL  ${name}   ${e}`)
  }
}
const section = (t) => console.log(`\n--- ${t} ---`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ HTTP（清理与核对用）
let TOKEN = ''
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN
  const res = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res.json()
}

async function purgeDay(lessonId, verbose) {
  if (!lessonId) return { questions: 0, deleted: 0, dayDeleted: true }
  const r = await api('GET', `/admin/grammar/questions?pageNum=1&pageSize=200&lessonId=${lessonId}`)
  const list = (r.data && r.data.list) || []
  let deleted = 0
  for (const q of list) {
    const res = await api('DELETE', `/admin/grammar/questions/${q.id}`)
    if (res.code === 200) deleted++
  }
  const rd = await api('DELETE', `/admin/grammar/lessons/${lessonId}`)
  const out = { questions: list.length, deleted, dayDeleted: rd.code === 200, msg: rd.msg }
  if (verbose) console.log('  清理：', JSON.stringify(out))
  return out
}

// ------------------------------------------------------------------ CDP
let ws
let msgId = 0
const pending = new Map()

function send(method, params = {}) {
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

async function evalJson(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  const v = r.result && r.result.value
  if (typeof v === 'string') {
    try {
      return JSON.parse(v)
    } catch {
      return v
    }
  }
  return v
}

/** 定位可见元素（可用文案过滤），顺带做 elementFromPoint 命中校验 */
async function locate(selector, text) {
  return evalJson(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null)
    const el = ${text ? `els.find(e => (e.innerText || '').includes(${JSON.stringify(text)}))` : 'els[0]'}
    if (!el) return JSON.stringify({ err: 'NOT_FOUND' })
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2)
    const hit = document.elementFromPoint(x, y)
    const own = !!hit && (el === hit || el.contains(hit) || hit.contains(el))
    return JSON.stringify({
      x, y, w: Math.round(r.width), h: Math.round(r.height), own,
      hit: hit ? (hit.tagName + '.' + String(hit.className || '')).slice(0, 70) : 'null',
      text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 36)
    })
  })()`)
}

async function dispatchClick(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(40)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
}

/** 真实鼠标点击；找不到或被遮挡一律抛错（绝不静默穿透） */
async function click(selector, text) {
  let info = await locate(selector, text)
  if (info && info.err) throw new Error(`找不到元素 ${selector} ${text || ''}`)
  await sleep(160)
  info = await locate(selector, text)
  if (info && info.err) throw new Error(`元素消失了 ${selector} ${text || ''}`)
  if (!info.own) throw new Error(`点击被遮挡：${selector} ${text || ''} -> 命中 ${info.hit}`)
  await dispatchClick(info.x, info.y)
  return info
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SHOT_DIR, name), Buffer.from(r.data, 'base64'))
  const theme = await evalJson(`document.documentElement.dataset.theme`)
  console.log(`  截图 ${name}   (data-theme=${theme})`)
}

async function waitText(selector, text, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < (timeoutMs || 8000)) {
    const v = await evalJson(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null)
      const el = ${text ? `els.find(e => (e.innerText || '').includes(${JSON.stringify(text)}))` : 'els[0]'}
      return el ? 'Y' : 'N'
    })()`)
    if (v === 'Y') return true
    await sleep(220)
  }
  return false
}

// ------------------------------------------------------------------ 单人一轮
const CREATED = []

async function run(theme) {
  section(`【${theme}】建临时 Day → 开对话框 → 上传 → 预览 → 入库 → 清理`)
  let lessonId = null
  let cleaned = false
  try {
    // ---------- 0. 建临时 Day ----------
    const create = await api('POST', '/admin/grammar/lessons', {
      dayNo: DAY_NO, title: DAY_TITLE, stage: '截图自检',
      mode: '学习', content: '[]', questionCount: 3, passScore: 60,
    })
    check(`[${theme}] 建临时 Day（dayNo=${DAY_NO}）成功`, create.code === 200, create.msg)
    const ls0 = await api('GET', '/admin/grammar/lessons')
    lessonId = ((ls0.data || []).find((x) => x.dayNo === DAY_NO) || {}).id || null
    if (lessonId) CREATED.push(lessonId)
    check(`[${theme}] 拿到临时 Day 的 id`, !!lessonId, lessonId)
    if (!lessonId) return

    // ---------- 1. 登录 + 进页面 ----------
    // 每轮都要一次**完整加载**：第二轮若只改 hash（BASE/ 与 BASE/#/xxx 同文档），
    // SPA 不会重建，主题 store 仍停在上一轮 —— 踩过：dark 那轮 5 张图全是浅色。
    await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}` })
    await sleep(1800)
    await evalJson(`(localStorage.clear(), localStorage.setItem('eq_theme', ${JSON.stringify(theme)}), 'ok')`)
    await send('Page.reload', { ignoreCache: true })
    await sleep(2200)
    const login = await evalJson(`
      (async () => {
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: (process.env.EQ_ADMIN_PASS || '') })
        });
        const b = await r.json();
        if (b.code !== 200) return 'LOGIN_FAIL:' + b.msg;
        const d = b.data;
        localStorage.setItem('eq_token', d.token);
        localStorage.setItem('eq_user', JSON.stringify({
          userId: d.userId, username: d.username, nickname: d.nickname, role: d.role,
          avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
        }));
        return 'OK:' + d.role;
      })()
    `)
    check(`[${theme}] 管理员登录`, String(login).startsWith('OK:'), login)

    await send('Page.navigate', { url: `${BASE}/?t=${Date.now()}#/admin/grammar` })
    await sleep(3000)
    const th = await evalJson(`document.documentElement.dataset.theme`)
    check(`[${theme}] 主题生效（data-theme=${th}）`, th === theme, th)

    // ---------- 2. 工具栏筛到临时 Day（这样对话框的默认目标 Day 就是它） ----------
    await click('.toolbar .el-select')
    await sleep(700)
    await click('.el-select-dropdown__item', `Day ${DAY_NO}`)
    await sleep(1400)
    const selText = await evalJson(`(document.querySelector('.toolbar .el-select')?.innerText || '').trim()`)
    check(`[${theme}] 工具栏筛到临时 Day`, selText.includes(`Day ${DAY_NO}`), selText)

    // ---------- 3. 打开导入对话框 ----------
    await click('.el-button', '批量导入')
    await sleep(1000)
    const dlgTitle = await evalJson(`(document.querySelector('.el-dialog__title')?.innerText || '').trim()`)
    check(`[${theme}] 对话框标题是「批量导入语法题」`, dlgTitle === '批量导入语法题', dlgTitle)
    const alertText = await evalJson(`(document.querySelector('.el-dialog .el-alert')?.innerText || '').trim()`)
    check(`[${theme}] 提示里强调了「4 个选项必须全部填写」`, alertText.includes('4 个选项必须全部填写'), alertText)
    const defDay = await evalJson(`(document.querySelector('.el-dialog .el-select')?.innerText || '').trim()`)
    check(`[${theme}] 默认目标 Day 预置为临时 Day`, defDay.includes(`Day ${DAY_NO}`), defDay)
    await shot(`01-对话框初始-${theme}.png`)

    // ---------- 4. 下载模板并校验 BOM ----------
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true })
    await click('.el-dialog .el-button', '下载 CSV 模板')
    let files = []
    for (let i = 0; i < 12; i++) {
      await sleep(300)
      files = readdirSync(DL).filter((f) => !f.endsWith('.crdownload'))
      if (files.length) break
    }
    check(`[${theme}] 模板下载成功`, files.length === 1, files)
    if (files.length === 1) {
      const buf = readFileSync(join(DL, files[0]))
      check(`[${theme}] 模板是 .csv`, /\.csv$/i.test(files[0]), files[0])
      check(`[${theme}] 模板带 UTF-8 BOM（Excel 打开不乱码）`,
        buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, [...buf.slice(0, 3)])
      const head = buf.slice(3).toString('utf8').split(/\r?\n/)[0].trim()
      check(`[${theme}] 模板表头含「天数」与 6 个必备列`,
        head.includes('天数') && head.includes('选项D') && head.includes('正确答案'), head)
    }

    // ---------- 5. 真实上传文件 ----------
    const doc = await send('DOM.getDocument', { depth: 1 })
    const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '.el-dialog .el-upload__input' })
    check(`[${theme}] 对话框里的文件输入框存在`, !!q.nodeId, q.nodeId)
    await send('DOM.setFileInputFiles', { files: [CSV_PATH], nodeId: q.nodeId })
    await sleep(1000)
    const fname = await evalJson(`(document.querySelector('.el-upload-list__item-name')?.innerText || '').trim()`)
    check(`[${theme}] 已选文件显示出来了`, fname.includes('gimport.csv'), fname)
    await shot(`02-已选文件-${theme}.png`)

    // ---------- 6. 解析预览 ----------
    await click('.el-dialog .el-button', '解析预览')
    check(`[${theme}] 统计条出现`, await waitText('.imp-stats', '文件数据行', 20000), '（等待 20s 未出现）')
    await sleep(600)
    const stats = await evalJson(`(document.querySelector('.imp-stats')?.innerText || '').replace(/\\s+/g, ' ').trim()`)
    const num = (label) => {
      const m = new RegExp(label + '\\s*(\\d+)').exec(stats || '')
      return m ? Number(m[1]) : -1
    }
    check(`[${theme}] 文件数据行 = 3`, num('文件数据行') === 3, stats)
    check(`[${theme}] 可导入 = 3`, num('可导入') === 3, stats)
    check(`[${theme}] 涉及 Day = 1（三行都落到同一个 Day）`, num('涉及 Day') === 1, stats)
    check(`[${theme}] 失败 = 0`, num('失败') === 0, stats)
    const previewCount = await evalJson(`(() => {
      const b = [...document.querySelectorAll('.imp-block')].find(x => (x.querySelector('.imp-block-title')?.innerText || '').includes('预览'))
      return b ? b.querySelectorAll('.el-table__body tbody tr.el-table__row').length : -1
    })()`)
    check(`[${theme}] 预览表里有 3 行`, previewCount === 3, previewCount)
    const dayCells = await evalJson(`JSON.stringify([...document.querySelectorAll('.imp-block .el-table__row')].map(tr => (tr.children[1]?.innerText || '').trim()))`)
    check(`[${theme}] 预览里三行的天数都是「Day ${DAY_NO}」`,
      Array.isArray(dayCells) && dayCells.length >= 3 && dayCells.slice(0, 3).every((d) => d.includes(`Day ${DAY_NO}`)),
      dayCells)
    await shot(`03-解析预览-${theme}.png`)

    // ---------- 7. 确认导入 ----------
    const btn = await locate('.el-dialog .el-button', '确认导入')
    check(`[${theme}] 确认导入按钮可点（未被遮挡）`, !!(btn && btn.own), btn)
    check(`[${theme}] 按钮上标了条数`, !!btn && /确认导入（3 条）/.test(btn.text || ''), btn && btn.text)
    await click('.el-dialog .el-button', '确认导入')
    await sleep(3500)
    const stats2 = await evalJson(`(document.querySelector('.imp-stats')?.innerText || '').replace(/\\s+/g, ' ').trim()`)
    const n2 = (label) => {
      const m = new RegExp(label + '\\s*(\\d+)').exec(stats2 || '')
      return m ? Number(m[1]) : -1
    }
    check(`[${theme}] 已写入 = 3`, n2('已写入') === 3, stats2)
    await shot(`04-导入完成-${theme}.png`)

    // ---------- 8. 后台列表核对 ----------
    const rq = await api('GET', `/admin/grammar/questions?pageNum=1&pageSize=100&lessonId=${lessonId}`)
    check(`[${theme}] 库里该 Day 下正好 3 题`, (rq.data || {}).total === 3, (rq.data || {}).total)
    const kp = await api('GET', `/admin/grammar/questions?pageNum=1&pageSize=100&lessonId=${lessonId}`)
    const rows = ((kp.data || {}).list) || []
    const hand = rows.find((x) => x.knowledgePoint === '手写考点')
    check(`[${theme}] 手写的知识点被原样保留`, !!hand, rows.map((x) => x.knowledgePoint))
    check(`[${theme}] 留空的知识点按讲义标题补全`,
      rows.filter((x) => x.knowledgePoint === DAY_TITLE).length === 2,
      rows.map((x) => x.knowledgePoint))

    await click('.el-dialog .el-button', '关闭')
    await sleep(1000)
    const listRows = await evalJson(`document.querySelectorAll('.el-table__body tbody tr.el-table__row').length`)
    check(`[${theme}] 后台列表里能看到刚导入的题`, listRows >= 3, listRows)
    await shot(`05-后台列表-${theme}.png`)

    // ---------- 9. 清理 ----------
    const cl = await purgeDay(lessonId, true)
    cleaned = true
    check(`[${theme}] 清理：题已删 ${cl.deleted}/${cl.questions}`, cl.deleted === cl.questions, cl)
    check(`[${theme}] 清理：临时 Day 已删`, cl.dayDeleted, cl)
  } finally {
    if (lessonId && !cleaned) await purgeDay(lessonId, true)
    CREATED.length = 0
  }
}

// ------------------------------------------------------------------ 主流程
async function main() {
  console.log('='.repeat(68))
  console.log('语法题批量导入 · 截图验证')
  console.log('='.repeat(68))

  const lg = await api('POST', '/auth/login', { username: 'admin', password: (process.env.EQ_ADMIN_PASS || '') })
  TOKEN = (lg && lg.data && lg.data.token) || ''
  if (!TOKEN) {
    console.log('  [!!] 管理员登录失败，响应：' + JSON.stringify(lg).slice(0, 300))
    process.exit(1)
  }
  check('后端可用、管理员登录成功', true)

  const baseQ = await api('GET', '/admin/grammar/questions?pageNum=1&pageSize=1')
  const baseTotal = (baseQ.data || {}).total
  const baseLs = await api('GET', '/admin/grammar/lessons')
  const baseLessons = (baseLs.data || []).length
  console.log(`  开跑前：题库 ${baseTotal} 题，讲义 ${baseLessons} 个`)
  check('临时 Day 序号 97 没被真实数据占用',
    !(baseLs.data || []).some((x) => x.dayNo === DAY_NO),
    (baseLs.data || []).map((x) => x.dayNo).slice(-3))

  const userDataDir = mkdtempSync(join(tmpdir(), 'eq-gimp-chrome-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,1500',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ])

  try {
    await sleep(2600)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const target = list.find((t) => t.type === 'page')
    ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res) => (ws.onopen = res))
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id)
        pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
      }
    }

    await send('Page.enable')
    await send('Runtime.enable')
    await send('DOM.enable')

    for (const theme of ['light', 'dark']) {
      await run(theme)
    }

    // 收尾核对
    section('收尾核对')
    const endQ = await api('GET', '/admin/grammar/questions?pageNum=1&pageSize=1')
    const endTotal = (endQ.data || {}).total
    const endLs = await api('GET', '/admin/grammar/lessons')
    const endList = endLs.data || []
    check('题库总题数回到开跑前（没有误写进别的 Day）', endTotal === baseTotal, `${baseTotal} -> ${endTotal}`)
    check('讲义总数回到开跑前', endList.length === baseLessons, `${baseLessons} -> ${endList.length}`)
    check('临时 Day 没留在讲义表里', !endList.some((x) => x.dayNo === DAY_NO), endList.map((x) => x.dayNo).slice(-3))

    const dlLeft = readdirSync(DL).filter((f) => !f.endsWith('.crdownload'))
    check('下载目录里只有模板（没有别的文件被误下载）', dlLeft.length === 1, dlLeft)
  } finally {
    try {
      if (ws) ws.close()
    } catch {}
    chrome.kill()
    rmSync(TMP, { recursive: true, force: true })
    rmSync(userDataDir, { recursive: true, force: true })
  }

  console.log('')
  console.log('='.repeat(68))
  console.log(`${pass} 项通过 / ${fails.length} 项失败${fails.length ? '  ——  ' + fails.join(' | ') : '  ——  全部通过'}`)
  console.log(`截图目录：${SHOT_DIR}`)
  console.log('='.repeat(68))
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
