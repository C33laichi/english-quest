<template>
  <div class="quiz-wrap">
    <!-- 顶部条 -->
    <div class="quiz-bar">
      <button class="quiz-bar-back" @click="onBack">← 退出</button>
      <div class="quiz-bar-title">{{ levelName }}</div>
      <div v-if="!result && questions.length" class="quiz-bar-count">
        {{ Math.min(current, questions.length) }} / {{ questions.length }}
      </div>
    </div>

    <div v-loading="loading">
      <!-- ---------- 答题中 ---------- -->
      <template v-if="!result && questions.length > 0">
        <div class="quiz-progress">
          <div class="quiz-progress-inner" :style="{ width: progressPercent + '%' }"></div>
        </div>

        <div class="card">
          <div class="quiz-type-tag">{{ q.type === 'SPELL' ? '拼写题' : '词义选择' }}</div>

          <!-- 选择题：按 A/B/C/D 直接选中并进入下一题 -->
          <template v-if="q.type === 'CHOICE'">
            <div class="quiz-stem">{{ q.stem }}</div>
            <div v-if="q.phonetic" class="muted" style="margin-bottom:2px">/{{ q.phonetic }}/</div>
            <div class="quiz-hint">
              按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> 选择正确的中文释义
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
          </template>

          <!-- 拼写题：直接敲字母 -->
          <template v-else>
            <div class="quiz-stem">{{ q.hint || q.stem }}</div>
            <div v-if="q.phonetic" class="muted" style="margin-bottom:2px">/{{ q.phonetic }}/</div>
            <div class="quiz-hint">
              键入英文单词后按 <kbd>Enter</kbd> 提交
            </div>

            <div class="spell-box">
              <el-input
                ref="spellRef"
                v-model="spellInput"
                class="spell-input"
                placeholder="在此输入…"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
              />
              <div class="spell-meta">
                <span>已输入 <b>{{ spellInput.trim().length }}</b> 个字母</span>
                <span v-if="!spellInput.trim()" class="muted">光标已就位，直接打字即可</span>
              </div>
            </div>
          </template>
        </div>

        <div class="btn-row">
          <el-button class="btn-primary" :disabled="!canNext" @click="next">
            {{ isLast ? '提交答卷' : '下一题' }}
          </el-button>
          <el-button v-if="current > 1" class="btn-ghost" @click="prev">上一题</el-button>
        </div>
      </template>

      <!-- ---------- 成绩结算 ---------- -->
      <template v-else-if="result">
        <div class="card result-card">
          <div class="result-emoji">{{ result.passed ? (result.stars === 3 ? '🏆' : '🎉') : '💪' }}</div>
          <div class="result-score">{{ result.score }}<span>分</span></div>
          <div class="stars" style="font-size:22px">
            {{ '★'.repeat(result.stars) }}{{ '☆'.repeat(3 - result.stars) }}
          </div>
          <div class="result-line">
            <span class="chip" :class="result.passed ? 'green' : 'gold'">
              {{ result.passed ? '恭喜通关' : `未达及格线 ${result.passScore} 分` }}
            </span>
            <span v-if="result.newRecord" class="chip">新纪录</span>
          </div>
          <div class="result-stats">
            <div><b>{{ result.correctCount }}/{{ result.totalCount }}</b><span>答对</span></div>
            <div><b>+{{ result.gainPoints }}</b><span>获得积分</span></div>
            <div>
              <b>{{ Math.round((result.correctCount / result.totalCount) * 100) }}%</b><span>正确率</span>
            </div>
          </div>
        </div>

        <div v-if="result.wrongQuestions?.length" class="card">
          <div class="card-title">错题回顾（已自动收录错题本）</div>
          <div v-for="w in reviewList" :key="w.questionId" class="wrong-item">
            <div class="wrong-stem">{{ w.stem }}</div>
            <div class="wrong-line">
              <span class="muted">你的答案：</span><span class="bad">{{ w.userAnswer || '未作答' }}</span>
            </div>
            <div class="wrong-line">
              <span class="muted">正确答案：</span><span class="good">{{ w.correctAnswer }}</span>
            </div>

            <!--
              针对性讲解：跟着「你实际选中的那一项」走。
              词汇关卡混有选择题（选 A/B/C/D）与拼写题：
              · 选择题：错项内容由后端下发，模型能讲清为什么这个词不对；
              · 拼写题：没有选项，错的就是拼写本身，只提示拼写错误，不请求针对性讲解。
              拉取失败/超配额时静默降级，页面下方仍有通用解析兜底。
            -->
            <div v-if="w.explain" class="explain-box">
              <div class="explain-head">
                <span class="explain-title">为什么「{{ w.userAnswer || '未作答' }}」不对</span>
                <span v-if="w.explain.source === 'MOCK'" class="explain-tag">本地生成</span>
                <span v-else-if="w.explain.source === 'FALLBACK'" class="explain-tag">降级生成</span>
              </div>
              <div v-if="w.explain.loading" class="explain-loading">
                正在针对你选的选项生成讲解…
              </div>
              <div v-else-if="w.explain.content" class="explain-body">{{ w.explain.content }}</div>
              <div v-else class="explain-fallback">
                {{ w.explain.error ? w.explain.error + '，' : '' }}可参考下方通用解析。
              </div>
            </div>

            <div v-if="w.analysis" class="wrong-analysis">{{ w.analysis }}</div>
          </div>
        </div>

        <div class="btn-row">
          <el-button class="btn-primary" @click="goBack">返回关卡</el-button>
          <el-button class="btn-ghost" @click="retryAll">再来一次</el-button>
        </div>
      </template>

      <div v-else-if="!loading" class="empty">
        <span class="icon">📭</span>本关暂无题目
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { vocabApi, aiApi } from '@/api'
import { useHotkey } from '@/composables/useHotkey'
import { useKeyHints } from '@/composables/useKeyHints'

const route = useRoute()
const router = useRouter()
const { setHints, setStatus, clearHints } = useKeyHints()

/*
 * 必须是 computed，不能写 `const levelId = route.params.levelId`。
 *
 * 本组件的路由是 /quiz/vocab/:levelId，而 <router-view> 没有 :key，
 * 所以 levelId 变化时 Vue Router 会复用组件实例、setup 不重跑，
 * 只取一次的 levelId 会停在上一个关卡上（URL 变了、内容没变）。
 * 目前没有 vocab → vocab 的跳转，所以暂不会触发，
 * 但这是一颗地雷，改成 computed 成本极低。
 */
const levelId = computed(() => route.params.levelId)
const levelName = ref('词汇闯关')
const questions = ref([])
const answers = ref([])
const current = ref(1)
const spellInput = ref('')
const loading = ref(true)
const result = ref(null)
const startTime = ref(Date.now())
const spellRef = ref()

/*
 * 错题针对性讲解的状态表，key = 「题目 + 学生选的错项」。
 * 与语法关卡同一套约定：同一题选 B 与选 C 是两种错法，讲解不能互相复用。
 */
const explainMap = ref({})

function explainKey(w) {
  return `${w.questionId}:${w.userAnswer || ''}`
}

/** 把错题明细与它的讲解状态配成对，模板里直接遍历这个 */
const reviewList = computed(() =>
  (result.value?.wrongQuestions || []).map((w) => {
    const entry = explainMap.value[explainKey(w)]
    // 拼写题没有选项，无从生成「为什么这个选项不对」的针对性讲解，只展示通用解析
    const isChoice = /^[A-Da-d]$/.test(w.userAnswer || '')
    return { ...w, explain: isChoice ? entry || null : null }
  })
)

/** 限制并发地跑一批任务：全并发会打满后端，串行又让学生等太久 */
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
  const pending = []
  for (const w of wrongs) {
    // 只对选择题请求：拼写题的「答案」是拼写本身，不是 A/B/C/D
    if (!/^[A-Da-d]$/.test(w.userAnswer || '')) continue
    const key = explainKey(w)
    if (explainMap.value[key]) continue
    explainMap.value[key] = { loading: true, content: '', source: '', error: '' }
    pending.push(w)
  }
  if (!pending.length) return

  await runWithConcurrency(pending, 3, async (w) => {
    const key = explainKey(w)
    try {
      const data = await aiApi.explainWrong({
        questionId: w.questionId,
        chosen: w.userAnswer,
        module: 'VOCAB'
      })
      explainMap.value[key] = {
        loading: false,
        content: data?.content || '',
        source: data?.source || '',
        error: ''
      }
    } catch (e) {
      // 配额用尽、断网、后端异常……都只是「这次没有针对性讲解」，
      // 下方还有通用解析兜底，所以这里绝不弹错、也不阻塞其它题
      explainMap.value[key] = {
        loading: false,
        content: '',
        source: '',
        error: e?.message || '讲解获取失败'
      }
    }
  })
}

/** 自动前进期间的锁，防止连按重复提交 */
let advancing = false

const q = computed(() => questions.value[current.value - 1] || {})
const isLast = computed(() => current.value >= questions.value.length)
const curAnswer = computed(() => answers.value[current.value - 1]?.userAnswer || '')
const answeredCount = computed(() => answers.value.filter((a) => a.userAnswer).length)

const progressPercent = computed(() =>
  questions.value.length ? Math.min(100, (current.value / questions.value.length) * 100) : 0
)

const canNext = computed(() => {
  if (!curAnswer.value && !spellInput.value.trim()) return false
  return true
})

/** 切题：回填该题已填内容；拼写题自动把光标放到输入框 */
watch(current, async () => {
  const a = answers.value[current.value - 1]
  spellInput.value = q.value.type === 'SPELL' ? a?.userAnswer || '' : ''
  if (q.value.type === 'SPELL') {
    await nextTick()
    spellRef.value?.focus()
  }
})

function focusSpell() {
  if (q.value.type === 'SPELL') nextTick(() => spellRef.value?.focus())
}

/** 选中第 idx 个选项，短暂反馈后自动进入下一题 */
function choose(idx) {
  if (advancing || result.value) return
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
  const a = answers.value[current.value - 1]
  if (!a) return
  if (q.value.type === 'SPELL') {
    a.userAnswer = spellInput.value.trim()
  }
  if (!a.userAnswer) {
    ElMessage.warning('请先作答')
    return
  }
  if (current.value >= questions.value.length) {
    submit()
  } else {
    current.value++
  }
}

function prev() {
  if (current.value > 1) current.value--
}

function onBack() {
  if (result.value) {
    goBack()
    return
  }
  ElMessageBox.confirm('退出将丢失本次作答进度，确定退出吗？', '提示', {
    confirmButtonText: '退出',
    cancelButtonText: '继续答题',
    type: 'warning'
  })
    .then(goBack)
    .catch(() => {})
}

function goBack() {
  router.replace('/vocab')
}

async function submit() {
  loading.value = true
  try {
    result.value = await vocabApi.submit(levelId.value, {
      costTime: Math.round((Date.now() - startTime.value) / 1000),
      answers: answers.value.map((a) => ({ questionId: a.questionId, userAnswer: a.userAnswer }))
    })
    // 交卷后再异步拉讲解，不阻塞成绩展示
    loadExplains()
  } finally {
    loading.value = false
  }
}

async function retryAll() {
  result.value = null
  explainMap.value = {}
  await load()
}

async function load() {
  loading.value = true
  try {
    const list = (await vocabApi.questions(levelId.value)) || []
    questions.value = list
    answers.value = list.map((item) => ({ questionId: item.id, userAnswer: '' }))
    current.value = 1
    spellInput.value = ''
    startTime.value = Date.now()
    focusSpell()
  } finally {
    loading.value = false
  }
}

/* ---------------- 键盘操作 ---------------- */
useHotkey(
  {
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
        goBack()
        return true
      }
      next()
      return true
    },
    Escape: () => {
      onBack()
      return true
    },
    Backspace: () => {
      // 拼写题输入框里有内容时，退格要正常删字符，不能抢去当「上一题」
      if (q.value.type === 'SPELL' && spellInput.value.length > 0) return false
      prev()
      return true
    },
    ArrowLeft: () => {
      prev()
      return true
    },
    r: () => {
      if (result.value) retryAll()
      return true
    }
  },
  // Backspace 需要在输入框聚焦时也能被接管（由上面的处理函数自行决定是否放行）
  { allowInInput: ['Enter', 'Escape', 'Backspace'] }
)

/** 键位提示条内容随题型切换 */
watch(
  [() => q.value.type, () => result.value, answeredCount, () => questions.value.length],
  () => {
    if (result.value) {
      setHints([
        { keys: ['Enter'], label: '返回关卡' },
        { keys: ['r'], label: '再来一次' }
      ])
      setStatus(`得分 ${result.value.score}`)
      return
    }
    const base =
      q.value.type === 'SPELL'
        ? [{ keys: ['Enter'], label: '提交 / 下一题' }]
        : [{ keys: ['1', '2', '3', '4'], label: '选择选项' }]
    if (current.value > 1) base.push({ keys: ['Backspace'], label: '上一题' })
    base.push({ keys: ['Esc'], label: '退出' })
    setHints(base)
    setStatus(`已答 ${answeredCount.value} / ${questions.value.length}`)
  },
  { immediate: true }
)

onMounted(async () => {
  try {
    const levels = (await vocabApi.levels()) || []
    const lv = levels.find((l) => String(l.id) === String(levelId.value))
    if (lv) levelName.value = lv.name
  } catch (e) {
    /* 拿不到就用默认标题 */
  }
  await load()
})

onUnmounted(clearHints)

/*
 * 关卡变化时重新拉取（与 GrammarLesson 同一套防复用写法）。
 * 组件被复用时 setup 不会重跑，只靠 onMounted 会漏掉 levelId 的变化。
 */
watch(levelId, (next, prev) => {
  if (next !== prev && next != null) load()
})
</script>

<style scoped>
.quiz-wrap {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 32px 40px;
}
</style>
