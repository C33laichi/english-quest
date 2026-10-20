<template>
  <div class="quiz-wrap">
    <div class="quiz-bar">
      <button class="quiz-bar-back" @click="goBack">← 返回路线</button>
      <div class="quiz-bar-title">Day {{ day }} · {{ lesson.title || '语法关卡' }}</div>
      <!--
        题数指示：测验中显示「当前 / 总数」的进度，其余状态显示总题数。
        与词汇关、听力关的头部保持一致 —— 只写总数看不出还剩几题。
      -->
      <div v-if="quizTotal" class="quiz-bar-count">
        <template v-if="inQuiz">{{ Math.min(current, quizTotal) }} / {{ quizTotal }}</template>
        <template v-else>{{ quizTotal }} 题</template>
      </div>
    </div>

    <div v-loading="loading">
      <!-- ---------- 讲义 ---------- -->
      <template v-if="!started">
        <div class="card">
          <div class="card-title">
            <span>今日讲义</span>
            <span class="chip">{{ lesson.mode }}</span>
          </div>
          <div v-if="points.length" class="points">
            <div v-for="(p, i) in points" :key="i" class="point-item">
              <div class="point-text">{{ p.text }}</div>
              <div v-if="p.example" class="point-example">例：{{ p.example }}</div>
            </div>
          </div>
          <div v-else class="empty" style="padding:24px">暂无讲义内容</div>
        </div>

        <div class="card">
          <div class="card-title">测验说明</div>
          <div class="muted" style="line-height:1.95">
            · 共 {{ questions.length }} 道单选题，满分 100 分<br />
            · 及格分数 {{ lesson.passScore }} 分，通过后解锁 Day {{ day + 1 }}<br />
            · 答对每题得 2 积分，通过关卡额外 +10 积分<br />
            · 测验中按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> 选择，按 <kbd>Enter</kbd> 下一题
          </div>
        </div>

        <div class="btn-row">
          <el-button class="btn-primary" :disabled="questions.length === 0" @click="start">
            开始测验（{{ questions.length }} 题）
          </el-button>
        </div>
        <div v-if="lesson.passed" class="muted" style="margin-top:12px">
          历史最高分 {{ lesson.bestScore }} 分，可重复挑战刷新纪录
        </div>
      </template>

      <!-- ---------- 测验 ---------- -->
      <template v-else-if="!result">
        <div class="quiz-progress">
          <div class="quiz-progress-inner" :style="{ width: progressPercent + '%' }"></div>
        </div>

        <div class="card">
          <div class="quiz-type-tag">{{ q.knowledgePoint || '语法单选' }}</div>
          <div class="quiz-stem" style="font-size:22px">{{ q.stem }}</div>
          <div class="quiz-hint">
            按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> 选出最恰当的一项
          </div>
          <div
            v-for="(opt, idx) in q.optionList"
            :key="opt.key"
            class="option"
            :class="{ selected: curAnswer === opt.key }"
            @click="choose(idx)"
          >
            <span class="option-key">{{ idx + 1 }}</span>
            <span>{{ opt.value }}</span>
          </div>
        </div>

        <div class="btn-row">
          <el-button class="btn-primary" :disabled="!curAnswer" @click="next">
            {{ current >= questions.length ? '提交答卷' : '下一题' }}
          </el-button>
          <el-button v-if="current > 1" class="btn-ghost" @click="current--">上一题</el-button>
        </div>
      </template>

      <!-- ---------- 结算 ---------- -->
      <template v-else>
        <div class="card result-card">
          <div class="result-emoji">{{ result.passed ? '🎉' : '💪' }}</div>
          <div class="result-score">{{ result.score }}<span>分</span></div>
          <div class="stars" style="font-size:22px">
            {{ '★'.repeat(result.stars) }}{{ '☆'.repeat(3 - result.stars) }}
          </div>
          <div class="result-line">
            <span class="chip" :class="result.passed ? 'green' : 'gold'">
              {{ result.passed ? '通过本关' : `未达及格线 ${result.passScore} 分` }}
            </span>
            <span v-if="result.unlockNext" class="chip gold">已解锁 Day {{ day + 1 }}</span>
          </div>
          <div class="result-stats">
            <div><b>{{ result.correctCount }}/{{ result.totalCount }}</b><span>答对</span></div>
            <div><b>+{{ result.gainPoints }}</b><span>获得积分</span></div>
            <div><b>{{ result.score }}%</b><span>得分</span></div>
          </div>
        </div>

        <div v-if="result.wrongQuestions?.length" class="card">
          <div class="card-title">错题回顾（已自动收录错题本）</div>
          <div v-for="w in reviewList" :key="w.questionId" class="wrong-item">
            <div class="wrong-stem">{{ w.stem }}</div>
            <!--
              回顾错题要展示选项**内容**而不是 A/B/C/D ——
              只给字母，用户既想不起当时选了什么，也没法和正确答案对照。
              后端已下发 userAnswerText / correctAnswerText；
              key 仅作降级兜底（老数据或异常情况下退化为字母）。
            -->
            <div class="wrong-line">
              <span class="muted">你的答案：</span>
              <span class="bad">{{ answerText(w.userAnswerText, w.userAnswer) }}</span>
            </div>
            <div class="wrong-line">
              <span class="muted">正确答案：</span>
              <span class="good">{{ answerText(w.correctAnswerText, w.correctAnswer) }}</span>
            </div>

            <!--
              针对性讲解：讲解内容跟着「你实际选中的那一项」走。
              同一道题选 B 和选 C 是两种不同的错法，用同一段通用解析等于没讲。
              拉取失败/超配额时静默降级，页面下方仍有通用解析兜底。
            -->
            <div class="explain-box">
              <div class="explain-head">
                <span class="explain-title">
                  为什么「{{ answerText(w.userAnswerText, w.userAnswer) }}」不对
                </span>
                <span v-if="w.explain && w.explain.source === 'MOCK'" class="explain-tag">本地生成</span>
                <span v-else-if="w.explain && w.explain.source === 'FALLBACK'" class="explain-tag">
                  降级生成
                </span>
              </div>
              <div v-if="w.explain && w.explain.loading" class="explain-loading">
                正在针对你选的选项生成讲解…
              </div>
              <div v-else-if="w.explain && w.explain.content" class="explain-body">
                {{ w.explain.content }}
              </div>
              <div v-else class="explain-fallback">
                {{ w.explain && w.explain.error ? w.explain.error + '，' : '' }}可参考下方通用解析。
              </div>
            </div>

            <div v-if="w.analysis" class="wrong-analysis">{{ w.analysis }}</div>
          </div>
        </div>

        <div class="btn-row">
          <el-button
            v-if="result.passed && result.unlockNext"
            class="btn-primary"
            @click="goToDay(day + 1)"
          >
            进入 Day {{ day + 1 }}
          </el-button>
          <el-button :class="result.passed && result.unlockNext ? 'btn-ghost' : 'btn-primary'" @click="restart">
            重新挑战
          </el-button>
          <el-button class="btn-ghost" @click="goBack">返回路线</el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { grammarApi, aiApi } from '@/api'
import { useHotkey } from '@/composables/useHotkey'
import { useKeyHints } from '@/composables/useKeyHints'

const route = useRoute()
const router = useRouter()
const { setHints, setStatus, clearHints } = useKeyHints()

/*
 * 必须是 computed，不能写 `const day = Number(route.params.day)`。
 *
 * 后者只在 setup 时取一次快照。本组件的路由是 /lesson/:day，
 * 而 <router-view> 没有 :key，所以从 /lesson/2 走到 /lesson/3 时
 * Vue Router 会**复用同一个组件实例**、setup 不会重跑 ——
 * day 会永远停在 2，表现为「点 Day3 却进了 Day2」。
 * （典型触发路径：结算页的「进入 Day N+1」按钮，lesson → lesson 跳转。）
 *
 * 改成 computed 后，day 会跟随路由变化，下面的 watch 再负责重新拉取数据。
 */
const day = computed(() => Number(route.params.day))

const lesson = ref({})
const points = ref([])
const questions = ref([])
const answers = ref([])
const current = ref(1)
const started = ref(false)
const loading = ref(true)
const result = ref(null)
const startTime = ref(Date.now())

let advancing = false

const q = computed(() => questions.value[current.value - 1] || {})
const curAnswer = computed(() => answers.value[current.value - 1]?.userAnswer || '')
const progressPercent = computed(() =>
  questions.value.length ? Math.min(100, (current.value / questions.value.length) * 100) : 0
)

/* 题数以实际下发的题目为准，lesson.questionCount 只作兜底 ——
   两者不一致时以题目数组为准，避免头尾数字对不上。 */
const quizTotal = computed(() => questions.value.length || lesson.value.questionCount || 0)
/** 是否处于答题态（讲义页 / 结算页之外的答题中状态） */
const inQuiz = computed(() => started.value && !result.value)

/**
 * 错题回顾的答案展示：优先用选项**文本**，拿不到再退化成 key（A/B/C/D）。
 * 未作答时显示「未作答」，避免出现空白行让人以为界面坏了。
 */
function answerText(text, key) {
  const t = (text || '').trim()
  if (t) return t
  const k = (key || '').trim()
  return k || '未作答'
}

/* ---------------- 针对所选错项的讲解 ---------------- */

/*
 * key = 「题目 + 学生选的错项」。
 * 必须带上 chosen：同一道题这次选 B、下次选 C 是两种错法，讲解不能复用。
 * 反过来，同一题同一错项重复遇到时可以直接复用（后端也有持久化缓存）。
 */
const explainMap = reactive({})

function explainKey(w) {
  return `${w.questionId}:${w.userAnswer || ''}`
}

/** 把错题明细与它的讲解状态配成对，模板里直接遍历这个即可 */
const reviewList = computed(() =>
  (result.value?.wrongQuestions || []).map((w) => ({
    ...w,
    explain: explainMap[explainKey(w)] || null
  }))
)

/**
 * 限制并发地跑一批任务。
 *
 * 不一次性全部打出去：一关可能有近十道错题，全并发会把后端和模型接口同时打满；
 * 也不串行：串行时最后一个要等前面全部返回，学生要盯着滚动条等很久。
 */
async function runWithConcurrency(items, limit, worker) {
  const queue = [...items]
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      await worker(queue.shift())
    }
  })
  await Promise.all(runners)
}

async function loadExplains() {
  const wrongs = result.value?.wrongQuestions || []

  // 先把占位状态建好，保证每道题都有「加载中」，不会出现空区块
  const pending = []
  for (const w of wrongs) {
    const key = explainKey(w)
    if (explainMap[key]) continue // 已有结果（含上次作答）就不再请求
    if (!w.userAnswer) {
      // 未作答没有"所选错项"，无从生成针对性讲解
      explainMap[key] = { loading: false, content: '', source: '', error: '本题未作答' }
      continue
    }
    explainMap[key] = { loading: true, content: '', source: '', error: '' }
    pending.push(w)
  }
  if (!pending.length) return

  await runWithConcurrency(pending, 3, async (w) => {
    const key = explainKey(w)
    try {
      const data = await aiApi.explainWrong({ questionId: w.questionId, chosen: w.userAnswer })
      explainMap[key] = {
        loading: false,
        content: data?.content || '',
        source: data?.source || '',
        error: ''
      }
    } catch (e) {
      // 配额用尽、断网、后端异常……都只是"这次没有针对性讲解"，
      // 页面下方还有通用解析，所以这里绝不弹错、也不阻塞其它题
      explainMap[key] = {
        loading: false,
        content: '',
        source: '',
        error: e?.message || '讲解获取失败'
      }
    }
  })
}

async function load() {
  loading.value = true
  try {
    const data = await grammarApi.lesson(day.value)
    lesson.value = data || {}
    points.value = data?.points || []
    questions.value = data?.questions || []
    answers.value = questions.value.map((item) => ({ questionId: item.id, userAnswer: '' }))
    current.value = 1
    result.value = null
    started.value = false
    // 切天后必须把答题态清干净，否则会把上一天的进行中状态带过来
    advancing = false
  } finally {
    loading.value = false
  }
}

function start() {
  if (!questions.value.length) return
  started.value = true
  startTime.value = Date.now()
}

function restart() {
  answers.value = questions.value.map((item) => ({ questionId: item.id, userAnswer: '' }))
  current.value = 1
  result.value = null
  started.value = true
  startTime.value = Date.now()
}

/** 选中后短暂反馈再自动进入下一题，适合键盘连续作答的节奏 */
function choose(idx) {
  if (!started.value || result.value || advancing) return
  const opt = (q.value.optionList || [])[idx]
  if (!opt) return
  answers.value[current.value - 1].userAnswer = opt.key
  advancing = true
  setTimeout(() => {
    advancing = false
    next()
  }, 320)
}

function next() {
  if (!answers.value[current.value - 1]?.userAnswer) {
    ElMessage.warning('请先选择一个选项')
    return
  }
  if (current.value >= questions.value.length) {
    submit()
  } else {
    current.value++
  }
}

async function submit() {
  loading.value = true
  try {
    result.value = await grammarApi.submit(day.value, {
      costTime: Math.round((Date.now() - startTime.value) / 1000),
      answers: answers.value.map((a) => ({ questionId: a.questionId, userAnswer: a.userAnswer }))
    })
  } finally {
    loading.value = false
  }
  /*
   * 结算数据是同步返回的，针对性讲解要一个个调模型 ——
   * 这里**故意不 await**：先让学生看到分数和错题列表，讲解随后自己补上，
   * 否则要在"没有反馈的白屏"上干等模型。
   */
  loadExplains()
}

/*
 * 只负责改路由。重新加载交给下面监听 day 的 watch ——
 * 否则这里再手动 load() 会与 watch 触发的那次重复请求打架。
 */
function goToDay(d) {
  router.replace(`/lesson/${d}`)
}

function goBack() {
  router.replace('/grammar')
}

/* ---------------- 键盘操作 ---------------- */
useHotkey({
  a: () => choose(0),
  b: () => choose(1),
  c: () => choose(2),
  d: () => choose(3),
  1: () => choose(0),
  2: () => choose(1),
  3: () => choose(2),
  4: () => choose(3),
  Enter: () => {
    if (result.value) {
      // 这里必须写 day.value —— day 是 computed，直接 `day + 1` 会得到 NaN，
      // 路由变成 /lesson/NaN，页头显示「Day NaN」。
      // （模板里能写 `day + 1` 是因为模板会自动解包 ref，脚本里不会。）
      if (result.value.passed && result.value.unlockNext) goToDay(day.value + 1)
      else restart()
    } else if (!started.value) {
      start()
    } else {
      next()
    }
    return true
  },
  Escape: () => {
    goBack()
    return true
  },
  Backspace: () => {
    if (started.value && !result.value && current.value > 1) current.value--
    return true
  },
  ArrowLeft: () => {
    if (started.value && !result.value && current.value > 1) current.value--
    return true
  },
  r: () => {
    if (result.value) restart()
    return true
  }
})

/** 键位提示条随阶段切换 */
watch(
  [() => started.value, () => result.value, current, () => questions.value.length],
  () => {
    if (result.value) {
      setHints([
        { keys: ['Enter'], label: result.value.passed && result.value.unlockNext ? `Day ${day.value + 1}` : '重新挑战' },
        { keys: ['r'], label: '重新挑战' },
        { keys: ['Esc'], label: '返回路线' }
      ])
      setStatus(`得分 ${result.value.score}`)
      return
    }
    if (!started.value) {
      setHints([
        { keys: ['Enter'], label: '开始测验' },
        { keys: ['Esc'], label: '返回路线' }
      ])
      setStatus(`Day ${day.value} 讲义`)
      return
    }
    const base = [{ keys: ['1', '2', '3', '4'], label: '选择选项' }]
    if (current.value > 1) base.push({ keys: ['Backspace'], label: '上一题' })
    base.push({ keys: ['Esc'], label: '返回路线' })
    setHints(base)
    setStatus(`第 ${current.value} / ${questions.value.length} 题`)
  },
  { immediate: true }
)

onMounted(load)
onUnmounted(clearHints)

/*
 * 天数变化时重新拉取。
 *
 * 这一条是修复「点 Day3 却进了 Day2」的关键：组件的路由是 /lesson/:day，
 * 而 <router-view> 没有 :key，所以 lesson → lesson 的跳转**不会重建组件**。
 * 没有这个 watch，day 变了但数据不会重新加载，
 * 页面就停在上一天的内容上（URL 已经是新的了）。
 */
watch(day, (next, prev) => {
  if (next !== prev && Number.isFinite(next)) load()
})
</script>

<style scoped>
.quiz-wrap {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 32px 40px;
}
.points {
  columns: 2;
  column-gap: 30px;
}
.point-item {
  break-inside: avoid;
  padding: 9px 0;
  border-bottom: 1px dashed var(--eq-border);
}
.point-text {
  font-size: 13.5px;
  line-height: 1.8;
}
.point-example {
  font-size: 12.5px;
  color: var(--eq-accent);
  background: var(--eq-primary-soft);
  border-radius: 7px;
  padding: 6px 10px;
  margin-top: 6px;
  line-height: 1.65;
}

@media (max-width: 900px) {
  .quiz-wrap {
    padding: 20px 18px 36px;
  }
  .points {
    columns: 1;
  }
}
</style>
