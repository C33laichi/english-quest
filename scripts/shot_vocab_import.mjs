/**
 * 词库「批量导入」全流程截图 + 交互校验（零依赖 CDP，真实 Chrome）
 *
 * 这不是"拍几张图"的脚本，而是一条**有副作用的完整验收**：
 *   建临时关卡 -> 打开导入对话框 -> 下载模板（校验 UTF-8 BOM）-> 真实上传 CSV
 *   -> 解析预览 -> 确认入库 -> 回后台列表核对 -> 删题删关卡（保证零残留）
 *
 * 为什么必须真上传真入库：解析预览是 dryRun，只能证明"能读"；
 * 只有走到"确认导入"那一步，才能证明 表单 -> multipart -> POI/CSV 解析 -> 写库 整条链路是通的。
 *
 * 用法：
 *   node scripts/shot_vocab_import.mjs --theme light --outdir screenshots/vocab_import
 *   node scripts/shot_vocab_import.mjs --theme dark  --outdir screenshots/vocab_import
 *
 * 参数：
 *   --theme    light | dark（默认 light）
 *   --outdir   截图输出目录（默认 screenshots/vocab_import）
 *   --base     站点根（默认 http://127.0.0.1:5173）
 *   --keep     跑完不清理（排障用；正常情况下清理是自动的）
 *
 * 前置：后端 8090、前端 5173 均已启动
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9351

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const THEME = arg('theme', 'light') === 'dark' ? 'dark' : 'light'
const OUTDIR = String(arg('outdir', 'screenshots/vocab_import'))
const BASE = String(arg('base', 'http://127.0.0.1:5173')).replace(/\/+$/, '')
const KEEP = !!arg('keep', false)

const LEVEL_NAME = `导入演示关卡（可删·${THEME}）`
/** 关序号取 7，截图里就是"第7关 · …"，比挂着 97 更像真实场景 */
const LEVEL_SORT_NO = 7

let msgId = 0
const pending = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  [PASS] ${name}`)
  } else {
    fail++
    console.log(`  [FAIL] ${name}   ${extra}`)
  }
}

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
    }, 40000)
  })
}

const userDataDir = mkdtempSync(join(tmpdir(), 'eq-imp-'))
const downloadDir = mkdtempSync(join(tmpdir(), 'eq-imp-dl-'))
const fileDir = mkdtempSync(join(tmpdir(), 'eq-imp-file-'))

/**
 * 截图用的 CSV。
 *
 * 8 行而不是 4 行：只取 4 行时，正确项位置有 4*(1/4)^4 ≈ 1.6% 的概率全落在同一个字母上，
 * 截图就会"看起来像没随机"。8 行把这个概率压到 6e-5，同时截图里也能直观看到 A/B/C/D 分散。
 * 最后一行是拼写题（不填选项），用来演示"同一份文件混着两种题型也能导"。
 */
const CSV_ROWS = [
  ['diligent', '勤奋的；用功的', '', '', '', '', '', ''],
  ['humid', '潮湿的；湿润的', '', '', '', '', '', ''],
  ['scarce', '稀少的；不足的', '', '', '', '', '', ''],
  ['vacant', '空的；空缺的', '', '', '', '', '', ''],
  ['obsolete', '过时的；淘汰的', '', '', '', '', '', ''],
  ['prevail', '盛行；占优势', '', '', '', '', '', ''],
  ['lure', '引诱；诱惑', '', '', '', '', '', ''],
  ['scrutinize', '仔细检查', '拼写', '', '', '', '', '']
]
const CSV_HEADER = '单词,中文释义,题型,选项A,选项B,选项C,选项D,正确答案'
const CSV_TEXT = CSV_HEADER + '\n' + CSV_ROWS.map((r) => r.join(',')).join('\n') + '\n'
const N = CSV_ROWS.length
const N_SPELL = CSV_ROWS.filter((r) => r[2] === '拼写').length
const N_CHOICE = N - N_SPELL

const CSV_PATH = join(fileDir, 'demo_vocab.csv')

async function main() {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(CSV_PATH, '\ufeff' + CSV_TEXT, 'utf8')

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,1500',
    '--force-device-scale-factor=2',
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
      try {
        return JSON.parse(v)
      } catch {
        return v
      }
    }
    return v
  }

  /**
   * 截**视口**而不是整页。
   *
   * 对话框是 position:fixed 的浮层，它比页面本身高时会溢出 document.scrollHeight，
   * 按"整页高"去 clip 会正好把对话框底部（footer 按钮）切掉 —— 第一版就吃了这个亏。
   * 视口截图既能装下完整的对话框，也顺带保留了背后被遮暗的管理页。
   */
  const shot = async (name) => {
    const vp = await evaluate('JSON.stringify({ w: window.innerWidth, h: window.innerHeight })')
    // 顺手把当次的主题量下来：中途若有哪一步把 data-theme 翻回浅色，
    // 只靠看截图深浅很容易误判，带上这一列就能一眼定位是哪一步翻的。
    const th = await evaluate(
      'JSON.stringify({ t: document.documentElement.dataset.theme, stored: localStorage.getItem("eq_theme") })'
    )
    const r = await send(ws, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: vp.w, height: vp.h, scale: 1 }
    })
    const p = join(OUTDIR, `${THEME}_${name}.png`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, Buffer.from(r.data, 'base64'))
    console.log(`    · 截图 ${p}  (${vp.w}x${vp.h})  data-theme=${th.t} stored=${th.stored}`)
  }

  /**
   * 按可见文字点按钮：Element Plus 的按钮内部有多层 span，直接按类名点很容易点空。
   *
   * 两个必须处理的坑：
   *   1) 先 scrollIntoView。对话框加了预览表之后会变高，footer 按钮常常落在视口外，
   *      此时 elementFromPoint 返回 null —— 但那只是"不在视口里"，**不是被遮挡**，
   *      当成遮挡提前 return 会导致后面一串断言全崩（没人点到按钮）。
   *   2) 只有"点到的东西确实存在、且不是它自己"时才判定为遮挡（真会被静默穿透）。
   */
  const clickText = async (text, scope = 'body') => {
    const find = `
      (() => {
        const scope = document.querySelector(${JSON.stringify(scope)}) || document.body;
        const nodes = [...scope.querySelectorAll('button, .el-radio-button, .el-select-dropdown__item, a, span')];
        const hit = nodes.filter((n) => (n.innerText || '').trim() === ${JSON.stringify(text)})
          .filter((n) => n.offsetParent !== null && !n.disabled);
        if (!hit.length) return null;
        return hit[hit.length - 1];
      })()
    `
    const probe = await evaluate(`(() => { const el = ${find}; if (!el) return 'NO'; el.scrollIntoView({ block: 'center', inline: 'center' }); return 'OK'; })()`)
    if (probe === 'NO') return 'NO'
    await sleep(500)   // 等滚动/过渡稳定，否则拿到的 rect 是旧位置
    return await evaluate(`
      (() => {
        const el = ${find};
        if (!el) return 'NO';
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (top && !el.contains(top) && !top.contains(el)) {
          return 'COVERED:' + (top.className || top.tagName);
        }
        el.click();
        return 'OK';
      })()
    `)
  }

  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')
  await send(ws, 'DOM.enable')
  // 下载目录必须钉死：无头 Chrome 默认会落到用户的「下载」文件夹，把测试文件丢进用户机器
  await send(ws, 'Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true })

  // ---------- 登录态 ----------
  await send(ws, 'Page.navigate', { url: `${BASE}/#/login` })
  await sleep(2200)
  const login = await evaluate(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: (process.env.EQ_ADMIN_PASS || '') })
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
  if (String(login).startsWith('FAIL')) throw new Error(`管理员登录失败：${login}`)
  console.log(`主题=${THEME}  站点=${BASE}`)

  /** 页面内带 token 调接口 */
  const api = async (method, path, body) => {
    return await evaluate(`
      (async () => {
        const r = await fetch(${JSON.stringify(path)}, {
          method: ${JSON.stringify(method)},
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('eq_token') },
          ${body ? `body: ${JSON.stringify(JSON.stringify(body))}` : ''}
        });
        return JSON.stringify(await r.json());
      })()
    `)
  }

  let levelId = null
  let baseTotal = null
  try {
    // 开跑前的题库总题数：跑的全程只应该"临时关卡 +4 再 -4"，
    // 最后必须回到这个数 —— 这是防止误写到别的关卡的兜底断言。
    baseTotal = (await api('GET', '/api/admin/vocab/questions?pageNum=1&pageSize=1')).data.total
    console.log(`开跑前题库共 ${baseTotal} 题`)

    // ---------- 建临时关卡 ----------
    await api('POST', '/api/admin/vocab/levels', {
      name: LEVEL_NAME, sortNo: LEVEL_SORT_NO, difficulty: 'BASIC',
      questionCount: 10, passScore: 60, status: 1
    })
    const lv = await api('GET', '/api/admin/vocab/levels')
    const mine = (lv.data || []).find((x) => x.name === LEVEL_NAME)
    if (!mine) throw new Error('临时关卡没建出来')
    levelId = mine.id
    console.log(`临时关卡 id=${levelId}`)

    // ---------- 进页面 ----------
    await send(ws, 'Page.navigate', { url: `${BASE}/?t=${Date.now()}#/admin/vocab` })
    await sleep(3600)
    const hash = await evaluate('location.hash')
    check('进到词库管理页', hash.includes('/admin/vocab'), hash)

    // 量一下主题真的落到 <html> 上了 —— 只靠肉眼看截图深浅很容易误判
    const themeNow = await evaluate(
      'JSON.stringify({ t: document.documentElement.dataset.theme, stored: localStorage.getItem("eq_theme"), bg: getComputedStyle(document.body).backgroundColor })'
    )
    check(`主题已生效（data-theme=${THEME}）`, themeNow && themeNow.t === THEME, themeNow)

    const hasBtn = await evaluate(`
      [...document.querySelectorAll('button')].some((b) => (b.innerText || '').trim() === '批量导入')
    `)
    check('工具条上有「批量导入」按钮', hasBtn === true)

    // ---------- 打开对话框 ----------
    let r = await clickText('批量导入')
    check('点击「批量导入」', r === 'OK', r)
    await sleep(1200)

    const dlgTitle = await evaluate(`
      (() => {
        const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
        return d ? (d.querySelector('.el-dialog__title')?.innerText || '').trim() : null;
      })()
    `)
    check('弹出「批量导入词汇」对话框', dlgTitle === '批量导入词汇', dlgTitle)

    const dlgText = await evaluate(`
      (() => {
        const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
        return d ? d.innerText : '';
      })()
    `)
    check('对话框说明了两种填法（可留空自动造选项）',
      dlgText.includes('选项 A~D 可以全部留空') && dlgText.includes('表头必须有'), '')
    check('对话框提示了跳过重复的规则', dlgText.includes('已存在的单词会自动跳过'))
    check('对话框提示了大小与行数上限', dlgText.includes('5MB') && dlgText.includes('500 行'))
    check('默认题型可切换（单选 / 拼写）', dlgText.includes('单选') && dlgText.includes('拼写'))
    await shot('01_对话框初始')

    // ---------- 下载模板（校验 BOM） ----------
    r = await clickText('下载 CSV 模板')
    check('点击「下载 CSV 模板」', r === 'OK', r)
    await sleep(2200)
    const dl = readdirSync(downloadDir).filter((f) => !f.endsWith('.crdownload'))
    check('模板确实下载下来了（且只下载了 1 个文件）', dl.length === 1, dl)
    if (dl.length) {
      const buf = readFileSync(join(downloadDir, dl[0]))
      check('模板首字节是 UTF-8 BOM（否则 Excel 打开中文会乱码）',
        buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
        `前 3 字节 = ${buf[0]},${buf[1]},${buf[2]}`)
      const t = buf.toString('utf8')
      check('模板带「单词」「中文释义」表头', t.includes('单词') && t.includes('中文释义'))
      check('模板里有示例行教怎么留空', t.includes('abandon') || t.includes('fragile'))
    }

    // ---------- 选目标关卡 ----------
    /*
     * Element Plus 的 el-select 不能用 el.click() 打开：它监听真实鼠标事件，
     * 点外层 div 只会静默什么都不发生。而 openImport() 会把目标关卡**预置**成
     * "当前筛选关卡 || 第 1 关" —— 于是选不中却继续点"确认导入"的话，
     * 题目会真的写进第 1 关的真实题库（本脚本第一版就这么污染了 level 1）。
     * 所以这里一律走 CDP 派发真实的按下 / 抬起，且选不中就立刻中止。
     */
    const realClick = async (expr) => {
      const pos = await evaluate(`
        (() => {
          const el = ${expr};
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const r = el.getBoundingClientRect();
          return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        })()
      `)
      if (!pos) return 'NO'
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, buttons: 0 })
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 1 })
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 0 })
      return 'OK'
    }

    r = await realClick(
      `document.querySelector('.el-dialog .el-select__wrapper') || document.querySelector('.el-dialog .el-select')`
    )
    check('点开「目标关卡」下拉', r === 'OK', r)
    await sleep(1000)

    const optPos = await evaluate(`
      (() => {
        const items = [...document.querySelectorAll('.el-select-dropdown__item')]
          .filter((n) => n.offsetParent !== null && (n.innerText || '').includes(${JSON.stringify(LEVEL_NAME)}));
        if (!items.length) return null;
        const r = items[0].getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, text: items[0].innerText });
      })()
    `)
    check('下拉里有刚建的临时关卡', !!optPos, optPos)

    let selectedOk = false
    if (optPos) {
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: optPos.x, y: optPos.y, buttons: 0 })
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: optPos.x, y: optPos.y, button: 'left', clickCount: 1, buttons: 1 })
      await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: optPos.x, y: optPos.y, button: 'left', clickCount: 1, buttons: 0 })
      await sleep(800)
      const shown = await evaluate(`
        (() => {
          const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
          return d ? d.innerText : '';
        })()
      `)
      selectedOk = shown.includes(LEVEL_NAME)
      check('目标关卡已切到临时关卡（不是预置的第 1 关）', selectedOk, shown.slice(0, 90))
    }
    if (!selectedOk) {
      throw new Error('目标关卡没切换成功，为免污染真实题库，中止后续导入')
    }

    // ---------- 真实注入文件 ----------
    const doc = await send(ws, 'DOM.getDocument', { depth: -1 })
    const q = await send(ws, 'DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
    check('对话框里有文件选择框', !!q.nodeId, q)
    await send(ws, 'DOM.setFileInputFiles', { nodeId: q.nodeId, files: [CSV_PATH] })
    await sleep(1200)
    const uploadedText = await evaluate(`
      (() => {
        const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
        return d ? d.innerText : '';
      })()
    `)
    check('选中的文件名显示出来了', uploadedText.includes('demo_vocab.csv'), uploadedText.slice(0, 120))
    await shot('02_已选文件')

    // ---------- 解析预览（dryRun） ----------
    r = await clickText('解析预览')
    check('点击「解析预览」', r === 'OK', r)
    for (let i = 0; i < 30; i++) {
      const t = await evaluate(`
        (() => {
          const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
          return d ? d.innerText : '';
        })()
      `)
      if (t.includes('解析结果') && t.includes('可导入')) break
      await sleep(400)
    }
    const prevText = await evaluate(`
      (() => {
        const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
        return d ? d.innerText : '';
      })()
    `)
    check('预览区出现「解析结果（尚未写入题库）」', prevText.includes('解析结果（尚未写入题库）'), '')
    check(`统计条给出 ${N} 行 / 可导入 ${N}`,
      new RegExp(`文件数据行\\s*${N}`).test(prevText) && new RegExp(`可导入\\s*${N}`).test(prevText),
      prevText.slice(0, 200))
    check(`预览表里有全部 ${N} 个单词`, CSV_ROWS.every((row) => prevText.includes(row[0])))
    check('自动生成的题带「自动」标记', prevText.includes('自动'))
    check('拼写题在预览里显示为「拼写」', prevText.includes('拼写'))

    // 直接读预览表「答案」列的字母，确认位置真是随机的。
    // 只断言"不全落在同一个字母"：8 次抽样里全同的概率约 2.4e-4。
    // （别要求"4 个字母都出现"——7 次抽样里只出现 ≤2 个字母的概率有 4.6%，会变成随机红灯。）
    const ansLetters = await evaluate(`
      (() => {
        const blk = document.querySelector('.imp-block');
        if (!blk) return [];
        return JSON.stringify([...blk.querySelectorAll('tbody tr')].map((tr) => {
          const tds = tr.querySelectorAll('td');
          const txt = (tds[tds.length - 1].innerText || '').trim();
          const m = txt.match(/^[A-D]/);
          return m ? m[0] : txt.split('\\n')[0];
        }));
      })()
    `)
    const autoLetters = (ansLetters || []).filter((x) => /^[A-D]$/.test(x))
    check('预览里正确项位置分散（不是全落在同一个字母）',
      autoLetters.length === N_CHOICE && new Set(autoLetters).size >= 2,
      `${autoLetters.length}/${N_CHOICE} 个选项字母 = ${JSON.stringify(ansLetters)}`)
    await shot('03_解析预览')

    // ---------- 确认导入 ----------
    r = await clickText(`确认导入（${N} 条）`)
    check(`点击「确认导入（${N} 条）」`, r === 'OK', r)
    for (let i = 0; i < 30; i++) {
      const t = await evaluate(`
        (() => {
          const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
          return d ? d.innerText : '';
        })()
      `)
      if (t.includes('导入结果') && t.includes('已写入')) break
      await sleep(400)
    }
    const resText = await evaluate(`
      (() => {
        const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
        return d ? d.innerText : '';
      })()
    `)
    check('结果区切换为「导入结果」（不再写"尚未写入"）',
      resText.includes('导入结果') && !resText.includes('尚未写入题库'), resText.slice(0, 160))
    check('统计条显示已写入 ' + N + ' 条', new RegExp(`已写入\\s*${N}`).test(resText), resText.slice(0, 200))
    check('失败 0 条', /失败\s*0/.test(resText))
    await shot('04_导入结果')

    // ---------- 后台列表核对（回到数据本身） ----------
    const qs = await api('GET', `/api/admin/vocab/questions?pageNum=1&pageSize=50&levelId=${levelId}`)
    const rows = (qs.data || {}).list || []
    check(`后台接口查到 ${N} 道导入的题`, rows.length === N, rows.length)
    // 先断言数量再断言内容：every() 对空数组恒为 true，
    // 少了这一步，没查到任何题时后面两条会"假装通过"。
    const choiceRows = rows.filter((x) => x.type === 'CHOICE')
    const spellRows = rows.filter((x) => x.type === 'SPELL')
    check(`${N} 道题里 ${N_CHOICE} 道单选 + ${N_SPELL} 道拼写`,
      choiceRows.length === N_CHOICE && spellRows.length === N_SPELL,
      `CHOICE=${choiceRows.length} SPELL=${spellRows.length}`)
    check('留空选项的单选都被自动补成了 4 个选项',
      choiceRows.length === N_CHOICE && choiceRows.every((x) => x.optionA && x.optionB && x.optionC && x.optionD),
      choiceRows.map((x) => [x.word, x.optionA, x.optionB, x.optionC, x.optionD]))
    check('拼写题的答案是单词本身',
      spellRows.length === N_SPELL && spellRows.every((x) => x.answer === x.word),
      spellRows.map((x) => [x.word, x.answer]))

    // ---------- 顺手断言难度枚举修好了 ----------
    r = await clickText('关闭')
    check('点「关闭」收起导入对话框', r === 'OK', r)
    await sleep(900)
    r = await clickText('关卡管理')
    check('点「关卡管理」打开关卡列表', r === 'OK', r)
    await sleep(1300)
    const lvText = await evaluate(`
      (() => {
        const d = [...document.querySelectorAll('.el-dialog')].filter((x) => x.offsetParent !== null).pop();
        return d ? d.innerText : '';
      })()
    `)
    check('关卡管理里难度显示中文（INTERMEDIATE -> 中等）',
      lvText.includes('中等') && !lvText.includes('INTERMEDIATE') && !lvText.includes('MEDIUM'),
      lvText.slice(0, 200))
    await shot('05_关卡管理难度列')
  } finally {
    // ---------- 清理：必须有，否则每次跑都会往真实题库里塞一个演示关卡 ----------
    if (levelId && !KEEP) {
      const qs = await api('GET', `/api/admin/vocab/questions?pageNum=1&pageSize=100&levelId=${levelId}`)
      const rows = (qs.data || {}).list || []
      for (const row of rows) await api('DELETE', `/api/admin/vocab/questions/${row.id}`)
      const del = await api('DELETE', `/api/admin/vocab/levels/${levelId}`)
      const after = await api('GET', '/api/admin/vocab/levels')
      const still = (after.data || []).some((x) => x.id === levelId)
      check(`清理：删掉演示题 ${rows.length} 道、并删除临时关卡`, del.code === 200 && !still, `${del.msg} still=${still}`)
    } else if (KEEP) {
      console.log(`  （--keep：保留临时关卡 id=${levelId}，请自行清理）`)
    }
    const dl2 = readdirSync(downloadDir)
    check('下载目录里只有模板那 1 个文件（没有多余下载）', dl2.length <= 1, dl2)

    // 兜底：确认没有一行被误写进别的关卡
    if (baseTotal !== null) {
      const total2 = (await api('GET', '/api/admin/vocab/questions?pageNum=1&pageSize=1')).data.total
      check('题库总题数回到开跑前（没有误写进别的关卡）', total2 === baseTotal, `${baseTotal} -> ${total2}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`${pass} 项通过 / ${fail} 项失败` + (fail ? '' : '  ——  全部通过'))
  console.log(`截图目录：${OUTDIR}`)
  console.log('='.repeat(60))

  ws.close()
  chrome.kill()
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(1)
})
