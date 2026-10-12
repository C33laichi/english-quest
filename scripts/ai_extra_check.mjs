/**
 * AI 练习「单词串烧 + 语法考点拓展 + 不限次数」接口验证
 *
 * 对应本轮 3 项需求：
 *   ① 取消 AI 练习次数限制（配额字段返回 -1 表示不限）
 *   ② 词汇错题多选 → 生成把它们串起来的短文
 *   ③ 语法错题 → 拓展考点
 *
 * ── 断言取向 ─────────────────────────────────────────────
 * 不满足于"接口 200 就算过"：
 *   · 短文必须真的**包含勾选的每个单词**（否则"串烧"名不副实）
 *   · 拓展正文必须真的**提到该考点名称**
 *   · 归属/模块校验必须生效（拿语法 id 去串烧、拿词汇 id 去拓展都要被拒）
 *
 * 用法：node scripts/ai_extra_check.mjs
 * 前置：后端 8090 已启动（env -u SERVER__PORT 启动）
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

  /* ---------------- 1. 不限次数 ---------------- */
  section('1. 次数限制已解除（-1 = 不限）')
  const quota = await api('/ai/quota', { token })
  ok('出题配额为 -1（不限次数）',
    quota.json?.data?.remaining === -1, `remaining=${quota.json?.data?.remaining}`)
  ok('讲解配额为 -1（不限次数）',
    quota.json?.data?.explainRemaining === -1,
    `explainRemaining=${quota.json?.data?.explainRemaining}`)

  const errsRes = await api('/error-book/list', { token })
  const all = errsRes.json?.data || []
  const vocab = all.filter((e) => e.module === 'VOCAB')
  const grammar = all.filter((e) => e.module === 'GRAMMAR')
  ok('错题本可读', Array.isArray(all), `共 ${all.length} 条（词汇 ${vocab.length} / 语法 ${grammar.length}）`)

  if (vocab.length < 2 || grammar.length < 1) {
    console.log('\n⚠ 错题不足（需 ≥2 词汇 + ≥1 语法），先去做几道题再来验证')
    process.exitCode = 1
    return
  }

  /* ---------------- 2. 单词串烧 ---------------- */
  section('2. 词汇多选 → 生成短文')
  const pick = vocab.slice(0, 3)
  const p = await api('/ai/passage', {
    method: 'POST',
    token,
    body: { errorIds: pick.map((e) => e.id) }
  })
  ok('接口返回成功', p.json?.code === 200, `code=${p.json?.code} msg=${p.json?.msg || ''}`)
  const pd = p.json?.data || {}
  ok('返回了单词列表', Array.isArray(pd.words) && pd.words.length >= 2, `words=${JSON.stringify(pd.words)}`)
  ok('短文正文非空', (pd.content || '').trim().length > 40, `长度=${(pd.content || '').length}`)
  ok('正文确实包含每一个勾选的单词',
    (pd.words || []).every((w) => new RegExp(`\\b${w}\\b`, 'i').test(pd.content || '')),
    `未覆盖=${JSON.stringify((pd.words || []).filter((w) => !new RegExp(`\\b${w}\\b`, 'i').test(pd.content || '')))}`)
  ok('source 已标注', ['MOCK', 'LLM', 'FALLBACK'].includes(pd.source), `source=${pd.source}`)

  section('3. 单词串烧的边界校验')
  const one = await api('/ai/passage', { method: 'POST', token, body: { errorIds: [pick[0].id] } })
  ok('只勾 1 个单词被拒', one.json?.code !== 200, `msg=${one.json?.msg}`)

  const mixed = await api('/ai/passage', {
    method: 'POST',
    token,
    body: { errorIds: [pick[0].id, grammar[0].id] }
  })
  ok('混入语法错题被拒', mixed.json?.code !== 200, `msg=${mixed.json?.msg}`)

  const bogus = await api('/ai/passage', {
    method: 'POST',
    token,
    body: { errorIds: [pick[0].id, 99999999] }
  })
  ok('不存在的错题 id 被拒', bogus.json?.code !== 200, `msg=${bogus.json?.msg}`)

  /* ---------------- 4. 语法考点拓展 ---------------- */
  section('4. 语法错题 → 考点拓展')
  const g = grammar[0]
  const ex = await api('/ai/expand', { method: 'POST', token, body: { errorId: g.id } })
  ok('接口返回成功', ex.json?.code === 200, `code=${ex.json?.code} msg=${ex.json?.msg || ''}`)
  const ed = ex.json?.data || {}
  ok('返回了考点名称', !!ed.knowledgePoint, `knowledgePoint=${ed.knowledgePoint}`)
  ok('拓展正文非空', (ed.content || '').trim().length > 60, `长度=${(ed.content || '').length}`)
  ok('正文确实在讲这个考点',
    !!ed.knowledgePoint && (ed.content || '').includes(String(ed.knowledgePoint).trim()),
    `考点="${ed.knowledgePoint}"`)
  ok('source 已标注', ['MOCK', 'LLM', 'FALLBACK'].includes(ed.source), `source=${ed.source}`)

  section('5. 语法拓展的边界校验')
  const gv = await api('/ai/expand', { method: 'POST', token, body: { errorId: vocab[0].id } })
  ok('拿词汇错题去拓展被拒', gv.json?.code !== 200, `msg=${gv.json?.msg}`)

  const gn = await api('/ai/expand', { method: 'POST', token, body: { errorId: 99999999 } })
  ok('不存在的错题 id 被拒', gn.json?.code !== 200, `msg=${gn.json?.msg}`)

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
