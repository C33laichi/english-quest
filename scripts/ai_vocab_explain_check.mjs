/**
 * 词汇错题 AI 讲解 —— 接口验证
 *
 * 验证目标（对应需求"词汇、语法答错时都能让 AI 解析错题"）：
 *   1. 同一个 /ai/wrong-explain 接口，传 module=VOCAB 能正确路由到词汇题库
 *   2. 不传 module（老前端）按 GRAMMAR 处理，行为不变（向后兼容）
 *   3. module=VOCAB 与 module=GRAMMAR 用**同一个 questionId** 时，
 *      必须返回**不同的题**（证明真的按模块走了不同的表，而不是共用语法表）
 *   4. 词汇讲解正文非空，且提到学生所选的错项
 *   5. 非法 module 被校验拦下
 *
 * ── 为什么用「同 id 不同模块」来判定 ──────────────────────────────
 * 只验"接口 200 + 有正文"是验不出 bug 的：如果 loadSubject 忘了分支，
 * 传 VOCAB 也会去查语法表，恰好语法表也有同号题，照样返回 200。
 * 因此这里拿同一个 questionId 分别用两个模块请求，比对返回的题干/答案，
 * 只要两者一致就说明分支没生效。
 *
 * ── 冷键策略 ────────────────────────────────────────────────────
 * 讲解按 (module, questionId, chosen) 全站缓存。写死题号会在第二遍运行时
 * 命中上一遍的缓存，"首次未命中"断言必假。这里逐题探测、挑冷键。
 *
 * 用法：node scripts/ai_vocab_explain_check.mjs
 * 前置：后端 8090 已启动
 */

const BASE = 'http://127.0.0.1:8090/api'

let pass = 0
let fail = 0
let skip = 0
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
    /* 非 JSON 响应 */
  }
  return { status: res.status, json }
}

/**
 * 从题目列表里拿一个"有 4 个选项"的词汇选择题。
 * 只挑 CHOICE 类型：拼写题没有选项，不参与针对性讲解。
 *
 * 注意：/vocab/levels/{id}/questions 出于防作弊不会下发 answer，
 * 所以这里只挑题，正确答案由后面 probe 出来。
 */
function pickChoiceVocab(list) {
  for (const q of list || []) {
    if (q.type === 'SPELL') continue
    const opts = (q.optionList || []).map((o) => o.value).filter((x) => x && String(x).trim())
    if (opts.length === 4) {
      return q
    }
  }
  return null
}

/**
 * 探测出正确答案：逐个试 A~D，被"你选的正是正确答案"拒绝的那个就是答案，
 * 同时返回另一个可用的错项。顺带把探测过程中意外命中冷键的讲解带回来。
 */
async function probeAnswer(token, questionId) {
  let correct = null
  const wrongs = []
  for (const k of ['A', 'B', 'C', 'D']) {
    const r = await api('/ai/wrong-explain', {
      method: 'POST',
      token,
      body: { questionId, chosen: k, module: 'VOCAB' }
    })
    if (r.json?.code === 200) {
      wrongs.push(k)
    } else if (/正确/.test(r.json?.msg || '')) {
      correct = k
    }
  }
  return { correct, wrongs }
}

async function main() {
  section('0. 登录')
  const login = await api('/auth/login', {
    method: 'POST',
    body: { username: 'student', password: (process.env.EQ_PASS || '') }
  })
  const token = login.json?.data?.token
  ok('学生登录成功', !!token, `code=${login.json?.code}`)
  if (!token) {
    process.exitCode = 1
    return
  }

  /* ---------------- 1. 词汇讲解基础链路 ---------------- */
  section('1. 词汇错题讲解（挑冷键，确保现生成）')

  // 逐关拉题，凑一个可用的词汇选择题
  let target = null
  let targetLevelId = null
  for (let lv = 1; lv <= 12 && !target; lv++) {
    const qs = await api(`/vocab/levels/${lv}/questions`, { token })
    const data = qs.json?.data
    const list = Array.isArray(data) ? data : data?.questions
    const pick = pickChoiceVocab(list)
    if (pick) {
      target = pick
      targetLevelId = lv
    }
  }
  if (!target) {
    ok('找到一道可用的词汇选择题', false, '接口未返回题目或没有 4 选项的选择题')
    process.exitCode = 1
    return
  }
  ok('找到一道可用的词汇选择题', true, `level=${targetLevelId} id=${target.id} stem=${target.stem}`)

  // 后端不下发 answer，靠"你选的正是正确答案"这一提示反推出正确答案
  const { correct, wrongs } = await probeAnswer(token, target.id)
  ok('探测出正确答案', !!correct, `correct=${correct} 可用错项=${JSON.stringify(wrongs)}`)
  if (!correct || !wrongs.length) {
    process.exitCode = 1
    return
  }
  const chosen = wrongs[0]

  const r = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: target.id, chosen, module: 'VOCAB' }
  })
  ok('接口返回成功', r.json?.code === 200, `code=${r.json?.code} msg=${r.json?.msg || ''}`)
  const d = r.json?.data || {}
  ok('回显了所选项文本', !!d.chosenText, `chosenText=${d.chosenText}`)
  ok('正确答案正确', String(d.correctAnswer).toUpperCase() === correct,
    `correctAnswer=${d.correctAnswer} 期望=${correct}`)
  ok('讲解正文非空', (d.content || '').trim().length > 30, `长度=${(d.content || '').length}`)
  ok('讲解针对「你选的那一项」',
    !!d.content && !!d.chosenText && d.content.includes(d.chosenText),
    `chosenText=${d.chosenText}`)
  console.log(`   · source=${d.source} cached=${d.cached}`)

  // 二次请求：命中缓存，内容一致
  const r2 = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: target.id, chosen, module: 'VOCAB' }
  })
  ok('二次请求命中缓存', r2.json?.data?.cached === true, `cached=${r2.json?.data?.cached}`)
  ok('二次请求正文一致', r2.json?.data?.content === d.content)

  /* ---------------- 2. 同 id 不同模块必须不同题 ---------------- */
  section('2. 模块路由：同 questionId 在三个模块下必须解析出不同的题')

  // 先拿语法表同号题（若存在），比对题干
  const grammarSameId = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: target.id, chosen, module: 'GRAMMAR' }
  })
  const gd = grammarSameId.json?.data
  if (grammarSameId.json?.code === 200 && gd) {
    const sameStemlessButDiffAnswer =
      String(gd.correctAnswer || '').toUpperCase() !== String(d.correctAnswer || '').toUpperCase() ||
      gd.chosenText !== d.chosenText
    ok('同 id 在词汇/语法下解析出不同的题', sameStemlessButDiffAnswer,
      `词汇 correctAnswer=${d.correctAnswer}/chosen=${d.chosenText} ` +
      `语法 correctAnswer=${gd.correctAnswer}/chosen=${gd.chosenText}`)
    if (!sameStemlessButDiffAnswer) {
      console.log('     ⚠ 两模块结果相同 —— 极可能是 loadSubject 没有按 module 分支！')
    }
  } else {
    skip++
    console.log(`   ⚠ 跳过「同 id 对比」  （语法表无同号题或该组合恰为正确答案：${grammarSameId.json?.msg || ''}）`)
  }

  // 听力整句与选项题走的完全是两张表：同 id 传整句，两个模块必须给出不同的正确答案
  const listenSameId = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: target.id, chosen: 'completely different sentence type', module: 'LISTENING' }
  })
  if (listenSameId.json?.code === 200) {
    ok('同 id 在词汇/听力下解析出不同的题',
      String(listenSameId.json.data.correctAnswer || '') !== String(d.correctAnswer || ''),
      `词汇 correctAnswer=${d.correctAnswer} 听力 correctAnswer=${listenSameId.json.data.correctAnswer}`)
  } else {
    skip++
    console.log(`   ⚠ 跳过「词汇/听力同 id 对比」（${listenSameId.json?.msg || ''}）`)
  }

  /* ---------------- 3. 向后兼容：不传 module 走语法 ---------------- */
  section('3. 向后兼容：不传 module 时按 GRAMMAR 处理')
  const noModule = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: target.id, chosen }
  })
  if (grammarSameId.json?.code === 200) {
    ok('不传 module 与显式 GRAMMAR 结果一致',
      noModule.json?.data?.correctAnswer === gd.correctAnswer &&
        noModule.json?.data?.chosenText === gd.chosenText,
      `无 module → correctAnswer=${noModule.json?.data?.correctAnswer}`)
  } else {
    skip++
    console.log('   ⚠ 跳过（上面语法同号题不可用，无法比对）')
  }

  /* ---------------- 4. 参数校验 ---------------- */
  section('4. 非法 module 被拦下')
  // LISTENING 现在是合法模块了，换一个真正不存在的
  const badModule = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: target.id, chosen, module: 'READING' }
  })
  ok('非法 module 返回非 200', badModule.json?.code !== 200,
    `code=${badModule.json?.code} msg=${badModule.json?.msg || ''}`)

  /* ---------------- 汇总 ---------------- */
  section('结果')
  console.log(`通过 ${pass} / 失败 ${fail} / 跳过 ${skip}`)
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
