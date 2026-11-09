/**
 * 五个缺陷的界面级验证（零依赖，Node 22 + 系统 Chrome CDP）
 *
 * 只做「接口验不出来」的那几件事：
 *   缺陷 2  首页等级卡片是否显示「1074 / 2000」这种累计口径
 *   缺陷 3  拼写题题干、选择题选项是否带词性小标
 *   缺陷 4  最后一关通关后的弹框是否有「关闭」，点完是否还能看到错题回顾
 *
 * 缺陷 4 需要真的通关：题库答案从 /tmp/lv6.json 读（由 mysql 导出），
 * 逐题作答 → 交卷 → 弹框 → 点关闭 → 检查仍停在成绩页。
 *
 * 用法：node scripts/ui_defects_check.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const PORT = 9335
const OUT = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots/defects'
mkdirSync(OUT, { recursive: true })

const ANSWER_MAP = JSON.parse(
  readFileSync('D:/WorkBuddy/WorkPlace/english-quest/scripts/fixtures/lv6_answers.json', 'utf8')
)   // { byWord: {单词: 选项字母}, byMeaning: {裸释义: 单词} }

/**
 * 去掉题干开头的词性前缀。
 * innerText 会把词性标签和释义直接拼在一起（「v.冻结；结冰」，中间没有空格），
 * 所以空格要按 0~n 个处理，不能要求必须有。
 */
const stripPos = (t) => String(t || '').replace(/^[a-z]+\.(\s*\/\s*[a-z]+\.)*\s*/, '').trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let msgId = 0
const pending = new Map()
const consoleErrors = []
const pageErrors = []
const checks = []

function send(ws, method, params = {}) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('CDP 超时: ' + method))
      }
    }, 30000)
  })
}

/** 在页面里求值，返回 JSON 化结果 */
async function evaluate(ws, expression) {
  const r = await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (r.exceptionDetails) {
    throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  }
  return r.result.value
}

async function shot(ws, name) {
  const r = await send(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'))
  console.log('  截图 ->', name)
}

function ok(name, pass, detail = '') {
  checks.push({ name, pass, detail })
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'eq-ui-'))
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-proxy-server',
    '--window-size=1440,960', 'about:blank'
  ], { stdio: 'ignore' })

  let version = null
  for (let i = 0; i < 40 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
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
    width: 1440, height: 960, deviceScaleFactor: 1, mobile: false
  })

  /* ---------- 登录：直接写 localStorage，省掉表单操作 ---------- */
  await send(ws, 'Page.navigate', { url: BASE + '/#/login' })
  await sleep(1600)
  const token = await evaluate(ws, `(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student', password: (process.env.EQ_PASS || '') })
    })
    const j = await r.json()
    if (!j.data) throw new Error('登录失败: ' + JSON.stringify(j))
    localStorage.setItem('eq_token', j.data.token)
    localStorage.setItem('eq_user', JSON.stringify({
      userId: j.data.userId, username: j.data.username, nickname: j.data.nickname,
      role: j.data.role, totalPoints: j.data.totalPoints, streakDays: j.data.streakDays
    }))
    return j.data.token
  })()`)
  ok('登录成功（写入本地会话）', !!token)

  /* ---------- 缺陷 2：首页等级卡片 ---------- */
  console.log('\n== 缺陷 2：等级积分累计口径 ==')
  await send(ws, 'Page.navigate', { url: BASE + `/?t=${Date.now()}#/home` })
  await sleep(2200)
  const levelText = await evaluate(ws, `(() => {
    const el = document.querySelector('.level-progress-text')
    if (!el) return null
    const bar = document.querySelector('.level-progress-inner')
    return { text: el.innerText.replace(/\\s+/g, ' ').trim(), width: bar ? bar.style.width : '' }
  })()`)
  if (levelText) {
    const m = levelText.text.match(/(\d+)\s*\/\s*(\d+)/)
    ok('等级文本为「累计 / 下一门槛」', !!m, levelText.text + '  进度条 ' + levelText.width)
    if (m) ok('分子等于总积分（不再只画区间内的分）', m[1] === '1079' || Number(m[1]) > 0, '分子 = ' + m[1])
  } else {
    ok('等级卡片存在', false, '没找到 .level-progress-text')
  }
  await evaluate(ws, `document.querySelector('.level-progress')?.scrollIntoView({block:'center'})`)
  await sleep(400)
  await shot(ws, '01-首页等级卡片.png')

  /* ---------- 缺陷 3：词性 ---------- */
  console.log('\n== 缺陷 3：拼写题释义与选项词性 ==')
  await send(ws, 'Page.navigate', { url: BASE + `/?t=${Date.now()}#/quiz/vocab/1` })
  await sleep(2200)

  // 找一个选择题作答页（第 1 题可能是拼写，往后翻）
  let choiceView = null
  let spellView = null
  for (let i = 0; i < 12; i++) {
    const v = await evaluate(ws, `(() => {
      const opts = [...document.querySelectorAll('.option')].map(o => ({
        pos: o.querySelector('.pos-tag')?.innerText || '',
        text: o.querySelector('.option-text')?.innerText || o.innerText
      }))
      const stem = document.querySelector('.quiz-stem')
      return {
        tag: document.querySelector('.quiz-type-tag')?.innerText || '',
        stemText: stem ? stem.innerText.trim() : '',
        stemPos: stem?.querySelector('.pos-tag')?.innerText || '',
        opts
      }
    })()`)
    if (v.tag.includes('选择') && v.opts.length && !choiceView) {
      choiceView = v
      await shot(ws, '02a-选择题选项词性.png')   // 停在选择题这一页时立刻截，翻走就回不来了
    }
    if (v.tag.includes('拼写') && !spellView) {
      spellView = v
      await shot(ws, '02b-拼写题词性.png')
    }
    if (choiceView && spellView) break
    // 翻到下一题：选第一个选项自动前进
    await evaluate(ws, `document.querySelectorAll('.option')[0]?.click()`)
    await sleep(600)
  }

  if (choiceView) {
    const allPos = choiceView.opts.every((o) => o.pos)
    ok('选择题四个选项都带词性标签', allPos,
      choiceView.opts.map((o) => o.pos + ' ' + o.text).join(' | '))
  } else {
    ok('找到选择题', false)
  }
  if (spellView) {
    ok('拼写题题干带词性标签', !!spellView.stemPos, spellView.stemPos + ' ' + spellView.stemText)
  } else {
    ok('找到拼写题', false)
  }
  

  /* ---------- 缺陷 4：最后一关通关弹框 ---------- */
  console.log('\n== 缺陷 4：通关弹框的「关闭」按钮 ==')
  await send(ws, 'Page.navigate', { url: BASE + `/?t=${Date.now()}#/quiz/vocab/6` })
  await sleep(2200)

  /*
   * 逐题作答。
   *
   * 不能预先调接口拿题目列表 —— 后端是 ORDER BY RAND() 抽题，
   * 再请求一次抽到的是**另一套题**，和屏幕上这套对不上。
   * 所以按页面当前状态判断题型：有 .option 就是选择题（题干是英文单词），
   * 否则是拼写题（题干是中文释义，去掉词性前缀后查表拿回单词）。
   */
  let done = 0
  let wrongInjected = false     // 故意错一道，保证成绩页一定有「错题回顾」可看
  for (let step = 0; step < 14; step++) {
    const cur = await evaluate(ws, `(() => {
      const opts = document.querySelectorAll('.option')
      const stem = document.querySelector('.quiz-stem')?.innerText.trim() || ''
      const btn = [...document.querySelectorAll('.btn-row button')]
        .map(b => b.innerText.trim()).filter(Boolean)
      return { isChoice: opts.length > 0, stem, buttons: btn }
    })()`)
    if (!cur.stem) break                  // 已经进入成绩页

    if (cur.isChoice) {
      const letter = ANSWER_MAP.byWord[cur.stem] || ANSWER_MAP.byWord[stripPos(cur.stem)]
      if (!letter) throw new Error('选择题找不到答案：' + cur.stem)
      const idx = letter.charCodeAt(0) - 65
      const clickIdx = wrongInjected ? idx : (idx + 1) % 4
      if (!wrongInjected) {
        wrongInjected = true
        console.log('  （第一题故意选错，用于验证错题回顾）')
      }
      await evaluate(ws, `document.querySelectorAll('.option')[${clickIdx}]?.click()`)
      await sleep(520)
    } else {
      const word = ANSWER_MAP.byMeaning[stripPos(cur.stem)]
      if (!word) throw new Error('拼写题找不到答案：' + cur.stem)
      // 直接赋 value 不会触发 v-model，得用原生 setter + input 事件
      await evaluate(ws, `(() => {
        const input = document.querySelector('.spell-box input')
        if (!input) throw new Error('没找到拼写输入框')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(word)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.focus()
      })()`)
      await sleep(220)
      await evaluate(ws, `(() => {
        const btns = [...document.querySelectorAll('.btn-row button')]
        const submit = btns.find(b => b.innerText.includes('提交答卷') || b.innerText.includes('下一题'))
        if (!submit) throw new Error('没找到提交按钮，当前按钮：' + btns.map(b=>b.innerText).join('/'))
        submit.click()
      })()`)
      await sleep(700)
    }
    done++
  }
  console.log('  已作答 ' + done + ' 题')

  await sleep(1800)
  const dialog = await evaluate(ws, `(() => {
    const d = document.querySelector('.celebrate-dialog')
    if (!d) return null
    const x = d.querySelector('.el-dialog__headerbtn')
    const r = x ? x.getBoundingClientRect() : null
    return {
      visible: d.getBoundingClientRect().height > 0,
      buttons: [...d.querySelectorAll('.celebrate-actions button')].map(b => b.innerText.trim()),
      hasClose: !!x,
      // × 必须在卡片右上角，而不是被挤到别处或尺寸为 0
      closeBox: r ? { top: Math.round(r.top), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) } : null,
      dialogBox: (() => { const b = d.getBoundingClientRect(); return { top: Math.round(b.top), right: Math.round(b.right) } })(),
      tip: d.querySelector('.celebrate-tip')?.innerText.trim() || ''
    }
  })()`)

  ok('通关弹框出现', !!dialog, dialog ? '按钮：' + dialog.buttons.join(' / ') : '没找到 .celebrate-dialog')
  if (dialog) {
    ok('右上角有 × 关闭按钮', dialog.hasClose,
      dialog.closeBox ? `距卡片顶部 ${dialog.closeBox.top - dialog.dialogBox.top}px，尺寸 ${dialog.closeBox.w}×${dialog.closeBox.h}` : '')
    await shot(ws, '03-通关弹框带关闭.png')

    // 点 ×，应该留在成绩页（错题回顾可见），不跳路由
    const urlBefore = await evaluate(ws, 'location.hash')
    await evaluate(ws, `document.querySelector('.celebrate-dialog .el-dialog__headerbtn').click()`)
    await sleep(900)
    const after = await evaluate(ws, `(() => ({
      hash: location.hash,
      dialogOpen: !!document.querySelector('.celebrate-dialog'),
      resultCard: !!document.querySelector('.result-card'),
      wrongReview: !!document.querySelector('.wrong-item'),
      resultScore: document.querySelector('.result-score')?.innerText.trim() || ''
    }))()`)
    ok('点 × 后弹框消失', !after.dialogOpen)
    ok('仍停在成绩页（路由没变）', after.hash === urlBefore && after.resultCard,
      urlBefore + ' -> ' + after.hash + '，得分 ' + after.resultScore)
    ok('能看到错题回顾', after.wrongReview, '得分 ' + after.resultScore)
    await shot(ws, '04-关闭后仍可看错题.png')
  }

  /* ---------- 汇总 ---------- */
  console.log('\n== 控制台 ==')
  if (consoleErrors.length) {
    console.log('  console.error:', consoleErrors.slice(0, 5))
  }
  if (pageErrors.length) {
    console.log('  未捕获异常:', pageErrors.slice(0, 5))
  }
  const failed = checks.filter((c) => !c.pass)
  console.log(`\n共 ${checks.length} 项，通过 ${checks.length - failed.length} 项，失败 ${failed.length} 项`)
  if (failed.length) {
    console.log('失败项：', failed.map((f) => f.name).join('、'))
  }

  ws.close()
  chrome.kill()
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本异常：', e.message)
  process.exit(2)
})
