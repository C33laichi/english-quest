/**
 * 听力错句 AI 讲解 —— 接口验证
 *
 * 验证目标：
 *   1. module=LISTENING 且 chosen 是「学生敲出的整句」时能拿到讲解（不再被 A~D 正则拦下）
 *   2. 讲解正文提到「逐词差异」——漏了/多了哪些词（这是听力模块最有价值的反馈）
 *   3. 同一句传不同错句 → 讲解不同（缓存的 key 含 chosen）
 *   4. 写出完全正确的原句 → 被拒绝（"你写的就是原句"）
 *   5. 选项题传非 A~D 仍然被拦（形状校验按模块区分）
 *   6. 错题本里听力条目的 analysis 现在带上了逐词差异
 *
 * ── 为什么用真正的听写错句，而不是随便编一串 ──────────────────
 * 讲解内容取决于 LCS 对齐结果。只有构造出"漏一个词""多一个词"这种
 * 可预期的错误，才能断言讲解里确实点出了那个词。
 *
 * 用法：node scripts/ai_listen_explain_check.mjs
 * 前置：后端 8090 已启动
 */

const BASE = 'http://127.0.0.1:8090/api'

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

function section(t) {
  console.log(`\n${'─'.repeat(64)}\n${t}\n${'─'.repeat(64)}`)
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  let json = null
  try {
    json = await res.json()
  } catch (e) {
    /* 非 JSON */
  }
  return { status: res.status, json }
}

/** 从原句里挖掉一个词，制造一段"漏词"的听写错误 */
function dropOneWord(sentence) {
  const ws = sentence.trim().split(/\s+/)
  if (ws.length < 3) return null
  const cut = Math.max(1, Math.floor(ws.length / 2))
  return ws.filter((_, i) => i !== cut).join(' ')
}

async function main() {
  section('0. 登录')
  const login = await api('/auth/login', {
    method: 'POST',
    body: { username: 'student', password: '' }
  })
  const token = login.json?.data?.token
  ok('学生登录成功', !!token, `code=${login.json?.code}`)
  if (!token) {
    process.exitCode = 1
    return
  }

  /* ---------------- 1. 拿听力句子 ---------------- */
  section('1. 取一句听力语料并构造错句')
  const lv = await api('/listen/levels', { token })
  const levels = lv.json?.data || []
  ok('听力关卡可读', Array.isArray(levels) && levels.length > 0, `共 ${levels.length} 关`)
  const level = levels.find((l) => !l.locked) || levels[0]
  if (!level) {
    ok('找到可用关卡', false, '无关卡')
    process.exitCode = 1
    return
  }

  // 练习接口不下发英文原句（防作弊），但我们能用 submit 的返回拿到英文（判分后返回）
  const sens = await api(`/listen/levels/${level.id}/sentences?mode=EASY`, { token })
  const list = sens.json?.data?.sentences || []
  ok('该关有听力句子', list.length > 0, `共 ${list.length} 句`)
  if (!list.length) {
    process.exitCode = 1
    return
  }

  // 用 submit 判分拿到英文原句：全部只答对第一句，其余故意空着（判错）
  const probe = await api(`/listen/levels/${level.id}/submit`, {
    method: 'POST',
    token,
    body: {
      mode: 'EASY',
      costTime: 1,
      answers: list.map((s, i) => ({
        sentenceId: s.id,
        userAnswer: '',
        playedTimes: 1,
        revealed: false
      }))
    }
  })
  ok('提交接口返回成功', probe.json?.code === 200, `code=${probe.json?.code} msg=${probe.json?.msg || ''}`)
  const details = probe.json?.data?.details || []
  const first = details[0]
  ok('拿到判分后的英文原句', !!first?.english, `english="${first?.english || ''}"`)
  if (!first?.english) {
    process.exitCode = 1
    return
  }

  const wrongText = dropOneWord(first.english)
  if (!wrongText) {
    ok('构造出漏词的错句', false, `原句过短：${first.english}`)
    process.exitCode = 1
    return
  }
  ok('构造出漏词的错句', true, `原句="${first.english}" 错句="${wrongText}"`)

  /* ---------------- 2. 听力讲解 ---------------- */
  section('2. 听力错句讲解（chosen 是整句，不是 A~D）')
  const r = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: first.sentenceId, chosen: wrongText, module: 'LISTENING' }
  })
  ok('整句 chosen 未被 A~D 校验拦下', r.json?.code === 200, `code=${r.json?.code} msg=${r.json?.msg || ''}`)
  const d = r.json?.data || {}
  ok('讲解正文非空', (d.content || '').trim().length > 30, `长度=${(d.content || '').length}`)
  ok('回显了正确原句', (d.correctAnswer || '').trim() === first.english.trim(),
    `correctAnswer="${d.correctAnswer}"`)
  ok('回显了学生输入', (d.chosenText || '').trim() === wrongText.trim(),
    `chosenText="${d.chosenText}"`)
  // 讲解里应出现"漏掉/听错"这类词级差异的提示
  ok('讲解点出了词级差异（漏掉/多敲）',
    /漏掉|听错|多敲|落|少/.test(d.content || ''),
    `正文：${(d.content || '').slice(0, 90)}`)
  console.log(`   · source=${d.source} cached=${d.cached}`)

  /* ---------------- 3. 不同错句 → 不同讲解 ---------------- */
  section('3. 同一句、不同错法 → 讲解必须不同')
  const other = first.english.trim().split(/\s+/).reverse().join(' ') // 词序颠倒也算错，但错法不同
  const r2 = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: first.sentenceId, chosen: other, module: 'LISTENING' }
  })
  if (r2.json?.code === 200) {
    ok('不同错句得到不同讲解',
      r2.json.data.content !== d.content,
      `第一次=${(d.content || '').slice(0, 40)}…`)
  } else {
    ok('不同错句也能拿到讲解', false, `code=${r2.json?.code} msg=${r2.json?.msg}`)
  }

  /* ---------------- 4. 写出正确原句 → 被拒绝 ---------------- */
  section('4. 写出完整正确的原句 → 拒绝讲解')
  // 注意用 first.sentenceId 定位同一句；去标点也要算"写对"（听写判分就是去标点比的）
  const exact = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: {
      questionId: first.sentenceId,
      chosen: first.english.replace(/[.?!,;:]+$/g, ''),
      module: 'LISTENING'
    }
  })
  ok('写对（含漏句号）反而被拒绝', exact.json?.code !== 200,
    `code=${exact.json?.code} msg=${exact.json?.msg || ''}`)
  ok('拒绝理由是「就是原句」', /原句/.test(exact.json?.msg || ''), `msg=${exact.json?.msg || ''}`)

  /* ---------------- 5. 形状校验按模块区分 ---------------- */
  section('5. 形状校验按模块区分')
  const badChoice = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: 1, chosen: 'THIS IS NOT A LETTER', module: 'VOCAB' }
  })
  ok('词汇题传整句被拦（只收 A~D）', badChoice.json?.code !== 200,
    `code=${badChoice.json?.code} msg=${badChoice.json?.msg || ''}`)

  /* ---------------- 6. 错题本听力条目带逐词差异 ---------------- */
  section('6. 错题本：听力条目的解析带上逐词差异（现场制造一条错题）')
  // 用第一句故意答错提交一次，确保本次写入的 analysis 是新格式
  const fresh = await api(`/listen/levels/${level.id}/submit`, {
    method: 'POST',
    token,
    body: {
      mode: 'EASY',
      costTime: 1,
      answers: [{ sentenceId: first.sentenceId, userAnswer: wrongText, playedTimes: 1, revealed: false }]
    }
  })
  ok('制造一次听力错题提交成功', fresh.json?.code === 200,
    `code=${fresh.json?.code} msg=${fresh.json?.msg || ''}`)
  const errs = await api('/error-book/list?module=LISTENING', { token })
  const items = errs.json?.data || []
  const row = items.find((e) => e.questionId === first.sentenceId)
  ok('错题本里能找到该句', !!row, `questionId=${first.sentenceId}`)
  ok('该条解析包含逐词差异', !!row && /漏掉|多敲/.test(row.analysis || ''),
    row ? `analysis="${row.analysis}"` : '')
  ok('该条记录了学生输入', !!row && (row.wrongAnswer || '').trim().length > 0,
    row ? `wrongAnswer="${row.wrongAnswer}"` : '')

  /* ---------------- 汇总 ---------------- */
  section('结果')
  console.log(`通过 ${pass} / 失败 ${fail}`)
  if (fails.length) {
    console.log('失败项：')
    fails.forEach((f) => console.log(`  · ${f}`))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
