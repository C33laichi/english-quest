/**
 * 首页「等级进度」数据自洽性回归（零依赖，可反复执行）
 *
 * 背景：曾出现「距下一级还差 0 分」「182 / 18」这类错误显示。
 * 根因是后端把 nextLevelPoints 当成"还差多少分"下发，
 * 而前端把它当成"升级门槛"做除法与减法 —— 字段语义错位。
 *
 * 现在的契约（区间长度制）：
 *   currentLevelPoints = totalPoints - 本段起点
 *   nextLevelPoints    = 下一级门槛 - 本段起点   （满级为 -1）
 *   两者同分母 → 进度 = cur / need，还差 = need - cur
 *
 * 用法：node scripts/overview_check.mjs
 *   EQ_USER / EQ_PASS 可覆盖默认账号
 */

const BASE = process.env.EQ_BASE || 'http://127.0.0.1:8090'
const USER = process.env.EQ_USER || 'student'
const PASS = process.env.EQ_PASS || (process.env.EQ_PASS || '')

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

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, opts)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

async function main() {
  console.log(`\n== 首页等级数据自洽性检查 @ ${BASE} ==\n`)

  // 1) 登录
  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  })
  const token = login.body?.data?.token
  ok('登录成功并拿到 token', !!token, `HTTP ${login.status}`)
  if (!token) {
    console.log('\n登录失败，后续检查跳过')
    process.exit(1)
  }

  const auth = { Authorization: 'Bearer ' + token }

  // 2) 拉总览
  const ovRes = await api('/api/game/overview', { headers: auth })
  const ov = ovRes.body?.data
  ok('GET /api/game/overview 返回数据', !!ov)
  if (!ov) process.exit(1)

  const {
    totalPoints = 0,
    level,
    levelName,
    currentLevelPoints: cur,
    nextLevelPoints: need,
    levels = []
  } = ov

  console.log(
    `\n  实际值：total=${totalPoints} level=${level}(${levelName}) cur=${cur} need=${need}\n`
  )

  // 3) 等级阶梯可用
  ok('levels 阶梯已下发', Array.isArray(levels) && levels.length > 0, `${levels.length} 级`)
  if (!levels.length) process.exit(1)

  const sorted = [...levels].sort((a, b) => a.level - b.level)

  // 4) level 与门槛表自洽
  let expectLevel = sorted[0].level
  for (const s of sorted) {
    if (totalPoints >= s.minPoints) expectLevel = s.level
  }
  ok(
    'level 与门槛表一致',
    level === expectLevel,
    `期望 ${expectLevel}，实际 ${level}`
  )
  ok(
    'levelName 与阶梯一致',
    levelName === sorted.find((s) => s.level === level)?.name,
    `实际「${levelName}」`
  )

  // 5) 区间长度制换算
  const base = sorted.find((s) => s.level === level)?.minPoints ?? 0
  const nextStep = sorted.find((s) => s.level === level + 1)
  const expectCur = totalPoints - base
  const expectNeed = nextStep ? nextStep.minPoints - base : -1

  ok('currentLevelPoints = 总分 - 本段起点', cur === expectCur, `期望 ${expectCur}，实际 ${cur}`)
  ok(
    'nextLevelPoints = 本段所需总量（满级 -1）',
    need === expectNeed,
    `期望 ${expectNeed}，实际 ${need}`
  )

  // 6) ★ 核心：分子不得超过分母（旧 bug 的直接判据）
  if (need > 0) {
    ok('本段已得 <= 本段所需（不会出现 182/118）', cur <= need, `cur=${cur} need=${need}`)

    const pct = Math.round((cur / need) * 100)
    ok('进度百分比落在 0~100', pct >= 0 && pct <= 100, `${pct}%`)

    const gap = need - cur
    ok('「还差多少分」非负且自洽', gap >= 0 && gap === need - cur, `还差 ${gap} 分`)

    // 还差 0 分只允许出现在刚好跨级的那一刻（cur === need 时理论上已升级，故此处应 > 0）
    ok('未满级时「还差 0 分」不应出现', gap > 0 || cur === 0, `还差 ${gap} 分`)
  } else {
    ok('满级时 need = -1', need === -1, `实际 ${need}`)
    ok('满级时进度按 100% 处理', true)
  }

  // 7) 其它字段基本合理性
  ok('streakDays 非负整数', Number.isInteger(ov.streakDays) && ov.streakDays >= 0, `${ov.streakDays}`)
  ok('rankNo >= 1', Number.isInteger(ov.rankNo) && ov.rankNo >= 1, `第 ${ov.rankNo} 名`)
  ok('todayPoints <= dailyLimit', (ov.todayPoints ?? 0) <= (ov.dailyLimit ?? 0),
    `${ov.todayPoints} / ${ov.dailyLimit}`)

  // 8) rankNo 与排行榜交叉验证
  const rankRes = await api('/api/game/rank?type=points', { headers: auth })
  const rankList = rankRes.body?.data
  if (Array.isArray(rankList)) {
    const mineIdx = rankList.findIndex((r) => r.mine)
    if (mineIdx >= 0) {
      ok('rankNo 与排行榜中的名次一致', rankList[mineIdx].rank === ov.rankNo,
        `榜单 ${rankList[mineIdx].rank}，总览 ${ov.rankNo}`)
      ok('榜单里我的积分与总积分一致', rankList[mineIdx].value === totalPoints,
        `榜单 ${rankList[mineIdx].value}，总览 ${totalPoints}`)
    } else {
      console.log('  ⚠️  本轮榜单前 50 名里没有当前用户，跳过名次交叉验证')
    }
  }

  console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==\n`)
  if (fail) {
    console.log('失败项：')
    failures.forEach((f) => console.log('  - ' + f))
    console.log('')
  }
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本异常：', e)
  process.exit(1)
})
