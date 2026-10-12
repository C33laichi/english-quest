/**
 * 错题针对性讲解 —— 接口验证
 *
 * 验证目标（对应需求"解析要按学生实际选的那个错项来解答"）：
 *   1. 接口能正常返回讲解
 *   2. **讲解必须提到学生所选的那个错项**（这是需求的核心，不是"接口通就算过"）
 *   3. 同一道题选不同的错项，拿到的讲解必须不同（否则等于还是通用解析）
 *   4. 二次请求命中缓存（不再消耗额度），且正文与首次一致
 *   5. 所选即正确答案时要被拒绝
 *   6. 非法参数 / 不存在的题目要被拦下
 *   7. 讲解配额与出题配额分开可读
 *
 * ── 为什么"题号 + 错选"是动态挑的，不写死 ──────────────────────────
 * 讲解按 (题号, 错选) **全站缓存**。若脚本把 QID=7 / chosen=B 写死，
 * 那么第二遍运行时这一对已经被上一遍跑热了，"首次请求未命中缓存"就必然失败 ——
 * 那是**脚本自己没清场**，不是产品缺陷（同类问题见 overview 第十四节）。
 * 因此这里先探测、挑一个"缓存还是冷的"组合，再在它上面做完整的
 * 「未命中 → 生成 → 落库 → 二次命中」闭环断言。
 *
 * 用法：node scripts/ai_explain_check.mjs
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

function skipped(label, why) {
  skip++
  console.log(`   ⚠ 跳过 ${label}  （${why}）`)
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
 * 挑一个用于断言的 (题号, 错选)。
 *
 * 逐题把 A~D 都探一遍：被"你选的正是正确答案"拒绝的就是正确答案，
 * 其余是可用的错项。优先挑**缓存是冷的**错项（这样才能验"未命中"分支），
 * 并且凑到两个错项就收手 —— 每多探一个冷选项就多一次真实生成、多耗一份额度。
 */
async function pickTarget(token) {
  const log = []
  let fallback = null

  for (let qid = 1; qid <= 40; qid++) {
    const wrongs = []
    let correctKey = null
    let missing = null

    for (const chosen of ['A', 'B', 'C', 'D']) {
      const r = await api('/ai/wrong-explain', {
        method: 'POST',
        token,
        body: { questionId: qid, chosen }
      })

      if (r.json?.code !== 200) {
        if (/正确/.test(r.json?.msg || '')) {
          correctKey = chosen
          continue // 这是正确选项，换下一个
        }
        missing = r.json?.msg || `code=${r.json?.code}`
        break // 题号不存在之类的硬错误 → 换下一题
      }

      wrongs.push({ chosen, cached: r.json.data.cached, data: r.json.data })
      // 凑齐「一个冷键 + 另一个错项」就够跑完全部断言了
      if (wrongs.length >= 2 && wrongs.some((w) => w.cached === false)) break
    }

    if (missing) {
      log.push(`题 ${qid}：${missing}`)
      continue
    }
    if (wrongs.length < 2) {
      log.push(`题 ${qid}：只探到 ${wrongs.length} 个错项，不足 2 个`)
      continue
    }

    const cold = wrongs.find((w) => w.cached === false)
    const primary = cold || wrongs[0]
    log.push(
      `题 ${qid}（正确答案 ${correctKey || '?'}）：` +
        wrongs.map((w) => `${w.chosen}${w.cached ? '热' : '冷'}`).join(' / ')
    )

    const cand = {
      qid,
      correctKey,
      primary,
      other: wrongs.find((w) => w.chosen !== primary.chosen),
      coldFound: !!cold
    }

    if (cold) return { ...cand, log }
    if (!fallback) fallback = cand // 记下备选，继续往后找冷键
  }

  return fallback ? { ...fallback, log } : null
}

async function main() {
  section('0. 登录拿 token')
  const login = await api('/auth/login', {
    method: 'POST',
    body: { username: 'student', password: (process.env.EQ_PASS || '') }
  })
  const token = login.json?.data?.token
  ok('学生登录成功', !!token, `code=${login.json?.code}`)
  if (!token) {
    console.log('\n登录失败，后续无法验证')
    process.exitCode = 1
    return
  }

  section('1. 挑一个「缓存还是冷的」错选组合')
  const target = await pickTarget(token)
  if (!target) {
    console.log('   ✗ 40 道题内没找到可用的错选组合，无法继续')
    process.exitCode = 1
    return
  }
  target.log.forEach((l) => console.log(`   · ${l}`))
  ok('找到可用的 (题号, 错项) 组合',
    !!target.primary && !!target.other,
    `题 ${target.qid}：主=${target.primary.chosen} 对照=${target.other?.chosen}`)

  const d1 = target.primary.data
  const d2 = target.other?.data
  const sel1 = target.primary.chosen
  const sel2 = target.other?.chosen

  section(`2. 核心：题 ${target.qid} 选 ${sel1}，讲解要针对「${d1?.chosenText}」`)
  ok('接口返回成功', !!d1, `code=200`)
  ok('讲解正文非空', !!d1?.content?.trim(), `长度=${d1?.content?.length || 0}`)
  ok('回显了学生所选项的文本', !!d1?.chosenText, `chosenText=${d1?.chosenText}`)
  ok('回显了正确答案的文本', !!d1?.correctAnswerText, `correctAnswerText=${d1?.correctAnswerText}`)
  ok('回显的正确答案与学生所选不同',
    !!d1?.correctAnswerText && d1.correctAnswerText !== d1.chosenText,
    `${d1?.chosenText} vs ${d1?.correctAnswerText}`)
  // 核心断言：讲解里必须出现"学生选的那个选项文本"
  ok(`讲解提到了学生所选的错项 ${d1?.chosenText}`,
    !!d1?.content && !!d1?.chosenText && d1.content.includes(d1.chosenText),
    `内容前 60 字：${(d1?.content || '').slice(0, 60)}`)
  ok('来源标记合法', ['LLM', 'MOCK', 'FALLBACK'].includes(d1?.source), `source=${d1?.source}`)

  if (target.coldFound) {
    ok('首次请求未命中缓存（冷键确实走了生成）', d1?.cached === false, `cached=${d1?.cached}`)
  } else {
    skipped('首次请求未命中缓存',
      '候选键在本轮已被预热，未找到冷键；不影响"二次命中"那条断言的有效性')
  }

  section(`3. 同一题（${target.qid}）改选 ${sel2}，讲解必须不同`)
  ok('接口返回成功', !!d2)
  ok(`讲解提到了学生所选的错项 ${d2?.chosenText}`,
    !!d2?.content && !!d2?.chosenText && d2.content.includes(d2.chosenText),
    `内容前 60 字：${(d2?.content || '').slice(0, 60)}`)
  // 两种错法拿到同一段讲解，说明这个功能没起作用
  ok(`选 ${sel1} 与选 ${sel2} 拿到的讲解不同`,
    !!d1?.content && !!d2?.content && d1.content !== d2.content)

  section('4. 同键二次请求 → 命中缓存且正文一致')
  // 这条与"缓存冷热"无关：刚请求过的键，此刻必然已入库，二次必命中。
  const r3 = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: target.qid, chosen: sel1 }
  })
  ok('二次请求返回成功', r3.json?.code === 200, `code=${r3.json?.code}`)
  ok('命中缓存', r3.json?.data?.cached === true, `cached=${r3.json?.data?.cached}`)
  ok('缓存返回的正文与首次一致', r3.json?.data?.content === d1?.content)

  section('5. 边界：所选即正确答案')
  if (target.correctKey) {
    const r4 = await api('/ai/wrong-explain', {
      method: 'POST',
      token,
      body: { questionId: target.qid, chosen: target.correctKey }
    })
    ok('被拒绝且给出提示',
      r4.json?.code !== 200 && /正确/.test(r4.json?.msg || ''),
      `code=${r4.json?.code} msg=${r4.json?.msg}`)
  } else {
    skipped('所选即正确答案被拒绝', '本轮未探到该题的正确选项')
  }

  section('6. 边界：非法参数')
  const r5 = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: target.qid, chosen: 'X' }
  })
  ok('非法选项被校验拦下', r5.json?.code !== 200, `code=${r5.json?.code} msg=${r5.json?.msg}`)

  const r6 = await api('/ai/wrong-explain', {
    method: 'POST',
    token,
    body: { questionId: 99999999, chosen: 'B' }
  })
  ok('不存在的题目被拦下', r6.json?.code !== 200, `code=${r6.json?.code} msg=${r6.json?.msg}`)

  section('7. 配额字段')
  const q = await api('/ai/quota', { token })
  ok('出题配额可读', typeof q.json?.data?.remaining === 'number', `remaining=${q.json?.data?.remaining}`)
  ok('讲解配额可读', typeof q.json?.data?.explainRemaining === 'number',
    `explainRemaining=${q.json?.data?.explainRemaining}`)

  section('结果')
  console.log(`  通过 ${pass} 项，失败 ${fail} 项${skip ? `，跳过 ${skip} 项` : ''}`)
  if (fail) {
    console.log('  失败清单：')
    fails.forEach((f) => console.log('   - ' + f))
    process.exitCode = 1
  } else {
    console.log('  ✓ 全部通过')
  }
  console.log()
}

main().catch((e) => {
  console.error('执行异常：', e)
  process.exitCode = 1
})
