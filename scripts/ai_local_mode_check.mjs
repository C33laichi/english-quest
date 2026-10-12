/**
 * 「无 Key 交付模式」验证 —— 证明没填 API Key 时 AI 功能全部由本地代码生成，
 * 且**根本不发起网络请求**（断网 / 答辩现场无网 / 打包送人 都不会空窗）。
 *
 * ── 判定依据（关键，别再靠"能出内容就算过"）─────────────────
 *   source = MOCK     → 命中 LlmClient.isMock() 短路分支，压根没联网
 *   source = FALLBACK → 尝试联网后失败才降级（说明 Key 又回来了 / 网络不通）
 *   source = LLM      → 真调了大模型
 *
 * 因此本脚本对 source 做**严格 === 'MOCK'** 的断言：
 * 一旦有人把 Key 填回 application.yml 或设了 AI_API_KEY 环境变量，这里立刻报红。
 *
 * ── 为什么错题讲解要先"挑冷键"──────────────────────────────
 * t_wrong_explain 按 (module, questionId, chosen) 全站缓存，且**缓存键不含 userId**。
 * 历史行可能是当初真调大模型时写的（source=LLM）。必须找到一个 cached=false
 * 的 (题号, 错选) 组合，才是"本次现生成"的真实来源。
 *
 * 用法：node scripts/ai_local_mode_check.mjs
 * 前置：后端 8090 已启动（env -u SERVER__PORT -u SERVER__PORT_0 启动）
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
    /* 非 JSON 响应 */
  }
  return { status: res.status, json }
}

/** 严格断言：这一条内容必须是"没联网就本地生成" */
function assertOffline(label, source, extra = '') {
  if (source === 'MOCK') {
    ok(label, true, `source=MOCK（未联网）${extra ? '  ' + extra : ''}`)
    return true
  }
  const why =
    source === 'LLM'
      ? 'source=LLM → 真的调用了大模型，Key 还在！'
      : source === 'FALLBACK'
        ? 'source=FALLBACK → 尝试联网后失败降级，说明 Key 又回来了'
        : `source=${source}（未知来源）`
  ok(label, false, why)
  return false
}

/** 找一个 cached=false 的 (题号, 错选)，确保是本次现生成 */
async function pickColdKey(token, budget = 60) {
  let probed = 0
  const seen = []
  for (let qid = 1; qid <= 60 && probed < budget; qid++) {
    for (const chosen of ['A', 'B', 'C', 'D']) {
      if (probed >= budget) break
      probed++
      const r = await api('/ai/wrong-explain', {
        method: 'POST',
        token,
        body: { questionId: qid, chosen }
      })
      if (r.json?.code !== 200) {
        if (/正确/.test(r.json?.msg || '')) continue // 选的是正确答案，换一个
        break // 题号不存在之类 → 换下一题
      }
      if (r.json.data.cached === false) {
        return { qid, chosen, data: r.json.data, probed, seen }
      }
      seen.push(`${qid}${chosen}`)
    }
  }
  return null
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

  /* ---------------- 1. 配额应为不限 ---------------- */
  section('1. 次数限制（交付模式也不该被限流）')
  const quota = await api('/ai/quota', { token })
  ok('出题配额 -1（不限）', quota.json?.data?.remaining === -1,
    `remaining=${quota.json?.data?.remaining}`)
  ok('讲解配额 -1（不限）', quota.json?.data?.explainRemaining === -1,
    `explainRemaining=${quota.json?.data?.explainRemaining}`)

  /* ---------------- 2. 错题本取料 ---------------- */
  section('2. 错题本取料')
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

  /* ---------------- 3. 同型题 ---------------- */
  section('3. 能力一：同型题')
  const sim = await api('/ai/similar-question', {
    method: 'POST',
    token,
    body: { errorId: grammar[0].id }
  })
  ok('接口返回成功', sim.json?.code === 200, `code=${sim.json?.code} msg=${sim.json?.msg || ''}`)
  const sd = sim.json?.data || {}
  ok('题干非空', (sd.stem || '').trim().length > 0, `长度=${(sd.stem || '').length}`)
  ok('选项齐全', Array.isArray(sd.options) && sd.options.length >= 2, `options=${sd.options?.length}`)
  ok('给了答案与解析', !!sd.answer && !!sd.analysis, `answer=${sd.answer}`)
  assertOffline('同型题为离线生成', sd.source)

  /* ---------------- 4. 错题讲解（冷键） ---------------- */
  section('4. 能力二：错题针对性讲解（挑冷键，确保是现生成）')
  const cold = await pickColdKey(token)
  if (!cold) {
    ok('找到缓存为冷的 (题号, 错选)', false, `已探测 ${'60题×A~D'} 仍全是热键`)
  } else {
    ok('找到缓存为冷的 (题号, 错选)', true,
      `题 ${cold.qid} 选 ${cold.chosen}（探测 ${cold.probed} 次）`)
    ok('首次请求确实未命中缓存', cold.data.cached === false, `cached=${cold.data.cached}`)
    ok('回显了学生所选项文本', !!cold.data.chosenText, `chosenText=${cold.data.chosenText}`)
    ok('讲解正文非空', (cold.data.content || '').trim().length > 60,
      `长度=${(cold.data.content || '').length}`)
    ok('讲解确实针对「你选的那个错项」',
      !!cold.data.content && !!cold.data.chosenText &&
        cold.data.content.includes(cold.data.chosenText),
      `考点对照 chosenText=${cold.data.chosenText}`)
    assertOffline('讲解为离线生成', cold.data.source)
  }

  /* ---------------- 5. 单词串烧 ---------------- */
  section('5. 能力三：词汇多选 → 短文')
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
  assertOffline('短文为离线生成', pd.source)

  /* ---------------- 6. 语法拓展 ---------------- */
  section('6. 能力四：语法考点拓展')
  const ex = await api('/ai/expand', { method: 'POST', token, body: { errorId: grammar[0].id } })
  ok('接口返回成功', ex.json?.code === 200, `code=${ex.json?.code} msg=${ex.json?.msg || ''}`)
  const ed = ex.json?.data || {}
  ok('返回了考点名称', !!ed.knowledgePoint, `knowledgePoint=${ed.knowledgePoint}`)
  ok('拓展正文非空', (ed.content || '').trim().length > 60, `长度=${(ed.content || '').length}`)
  ok('正文确实在讲这个考点',
    !!ed.knowledgePoint && (ed.content || '').includes(String(ed.knowledgePoint).trim()),
    `考点="${ed.knowledgePoint}"`)
  assertOffline('拓展为离线生成', ed.source)

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
