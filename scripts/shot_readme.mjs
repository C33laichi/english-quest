/**
 * 重拍 README 里因本次改动而过时的几张图（零依赖 CDP）
 *
 * 为什么单独写：
 *   1. 主题存在 localStorage，换主题后必须 **reload** 才会整页应用；而带 `?t=` 的深链
 *      在当前 dev server 下会被兜底到 /home（见 debug_route.mjs 的结论），
 *      所以这里用「先切 hash → 改 theme → Page.reload」的顺序，等价于用户手动刷新。
 *   2. 一批图要跑同一个登录态，逐个起浏览器太慢。
 *
 * 几何固定 1440x900、scale=1，与仓库里原有截图一致。
 *
 * 用法：
 *   node scripts/shot_readme.mjs                 # 全部重拍
 *   node scripts/shot_readme.mjs --only 02,09    # 只拍指定几项
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9363
const BASE = 'http://127.0.0.1:5173'
const OUT_DIR = 'D:/WorkBuddy/WorkPlace/english-quest/screenshots'
const USER = 'student'
const PASS = (process.env.EQ_PASS || '')
const PASS_ADMIN = (process.env.EQ_ADMIN_PASS || '')
const W = 1440
const H = 900

/**
 * 每一项：key 用于 --only 过滤；file 是输出文件名；
 * alsoCopy 是同内容另存（README 里首页出现了两次）。
 */
const JOBS = [
  { key: '02', route: '/home', theme: 'light', file: '02-首页.png', alsoCopy: ['43-主题-浅色-首页.png'] },
  { key: '36', route: '/home', theme: 'dark', file: '36-主题-深色-首页.png' },
  { key: '09', route: '/profile', theme: 'light', file: '09-个人中心.png' },
  // 游戏中心顶部横幅会显示等级/总积分/排行榜，数字要跟其它几张对得上才不显得矛盾
  { key: '05', route: '/game', theme: 'light', file: '05-游戏中心.png' },
  // 后台用户列表 2026-11 新增了「重算积分」按钮，操作列也加宽了，旧图缺这一列
  { key: '16', route: '/admin/users', theme: 'light', file: '16-用户管理.png', user: 'admin', pass: PASS_ADMIN },
]

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return def
  return process.argv[i + 1] ?? def
}

let msgId = 0
const pending = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function send(ws, method, params = {}) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('CDP 超时 ' + method)) }
    }, 30000)
  })
}

const udd = mkdtempSync(join(tmpdir(), 'eq-readme-'))

async function main() {
  const only = arg('only', null)
  const jobs = only
    ? JOBS.filter((j) => String(only).split(',').map((s) => s.trim()).includes(j.key))
    : JOBS
  if (!jobs.length) throw new Error('--only 没匹配到任何项')
  mkdirSync(OUT_DIR, { recursive: true })

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
    `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ])
  await sleep(2500)
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    }
  }
  const ev = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    return r.result?.value
  }
  await send(ws, 'Page.enable')
  await send(ws, 'Runtime.enable')

  // 1. 先把站点加载起来（后面每个 job 都在这上面 fetch 登录取 token）
  await send(ws, 'Page.navigate', { url: `${BASE}/` })
  await sleep(2200)

  for (const job of jobs) {
    // 每个 job 按自己的账号登录（16 是管理员，其余是学生）
    const u = job.user || USER
    const pw = job.pass || PASS
    const ok = await ev(`
      (async () => {
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: '${u}', password: '${pw}' })
        });
        const b = await r.json();
        if (b.code !== 200) return 'FAIL ' + b.msg;
        const d = b.data;
        localStorage.setItem('eq_token', d.token);
        localStorage.setItem('eq_user', JSON.stringify({
          userId: d.userId, username: d.username, nickname: d.nickname,
          role: d.role, avatar: d.avatar, totalPoints: d.totalPoints, streakDays: d.streakDays
        }));
        return 'OK role=' + d.role;
      })()
    `)
    if (String(ok).indexOf('OK') !== 0) throw new Error(`登录失败(${u})：` + ok)

    // 2. 切 hash（不整页跳转，绕开深链兜底）
    await ev(`location.hash = '#${job.route}'; 'ok'`)
    await sleep(300)
    // 3. 写主题 + reload，让主题整页生效
    await ev(`localStorage.setItem('eq_theme', '${job.theme}'); 'ok'`)
    await send(ws, 'Page.reload', { ignoreCache: false })
    await sleep(3000)
    await sleep(800)

    const st = await ev(`JSON.stringify({
      hash: location.hash,
      theme: document.documentElement.getAttribute('data-theme'),
      banner: (document.querySelector('.top-banner, .hero, .level-progress-text') || {}).innerText || null
    })`)
    const s = JSON.parse(st)
    if (s.hash !== `#${job.route}`) throw new Error(`路由没停在 ${job.route}，实际 ${s.hash}`)
    if (job.theme === 'dark' && s.theme !== 'dark') throw new Error('深色主题没生效：' + s.theme)
    console.log(`  ${job.file}  hash=${s.hash} theme=${s.theme} user=${u}`)

    const shot = await send(ws, 'Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: W, height: H, scale: 1 }
    })
    const out = join(OUT_DIR, job.file)
    writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log('    写出', job.file)
    for (const extra of job.alsoCopy || []) {
      copyFileSync(out, join(OUT_DIR, extra))
      console.log('    同内容另存', extra)
    }
  }

  ws.close()
  chrome.kill()
  console.log('\n完成')
}
main().catch((e) => { console.error('脚本异常:', e.message); process.exit(1) })
