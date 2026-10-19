<template>
  <div class="dictation-wrap">
    <!-- ---------- 顶部条 ---------- -->
    <div class="quiz-bar">
      <button class="quiz-bar-back" @click="onBack">← 退出</button>
      <div class="quiz-bar-title">{{ levelName }}</div>
      <span class="mode-tag" :class="isHard ? 'hard' : 'easy'">
        {{ isHard ? '困难模式 · 无长度提示' : '简单模式 · 有长度提示' }}
      </span>
      <div v-if="!result" class="quiz-bar-count">
        {{ Math.min(current, sentences.length) }} / {{ sentences.length }}
      </div>
    </div>

    <div v-loading="loading">
      <!-- ---------- 练习中 ---------- -->
      <template v-if="!result && sentences.length > 0">
        <div class="quiz-progress">
          <div class="quiz-progress-inner" :style="{ width: progressPercent + '%' }"></div>
        </div>

        <div class="stage">
          <!-- 中文提示 -->
          <div v-show="showChinese" class="stage-chinese">{{ cur.chinese }}</div>
          <div v-show="!showChinese" class="stage-chinese hidden-tip">
            中文提示已隐藏 · <kbd>Ctrl</kbd>+<kbd>T</kbd> 可恢复
          </div>

          <!-- 逐词输入格：一个格子填一个单词 -->
          <div class="word-slots" :class="{ hard: isHard }">
            <div
              v-for="(w, i) in slots"
              :key="i"
              class="slot"
              :class="[
                slotState(i),
                { active: !judged && i === activeIndex, pending: !judged && !w }
              ]"
              :style="{ width: slotWidth(i) + 'px' }"
            >
              <!-- 简单模式：底衬短横表示词长（与格宽同口径，空白处即还没打满） -->
              <span v-if="!isHard" class="slot-hint" aria-hidden="true">
                <i v-for="n in hintLen(i)" :key="n"></i>
              </span>
              <input
                :ref="(el) => setSlotRef(el, i)"
                v-model="slots[i]"
                class="slot-input"
                :readonly="judged"
                type="text"
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                @input="onInput(i)"
                @keydown="onSlotKeydown($event, i)"
                @focus="onSlotFocus(i)"
              />
            </div>
          </div>

          <!-- 格子用法提示 -->
          <div v-if="!judged" class="slots-tip">
            <template v-if="isHard">
              每听出一个词就多一格 · 按 <kbd>空格</kbd> 分出新词 · 不给词数与词长提示
            </template>
            <template v-else>
              底衬短横表示词长 · 一个格子填一个单词 · 填满自动跳到下一格
            </template>
          </div>

          <!-- 播放控制 -->
          <div class="play-row">
            <button class="play-btn" :class="{ playing }" @click="play">
              <span class="play-ico">{{ playing ? '🔊' : '🔈' }}</span>
              <span>{{ playing ? '播放中' : '播放发音' }}</span>
              <span class="play-keys"><kbd>Ctrl</kbd><kbd>Space</kbd></span>
            </button>

            <div class="rate-group">
              <span class="muted">语速</span>
              <button
                v-for="r in RATES"
                :key="r"
                class="rate-btn"
                :class="{ active: rate === r }"
                @click="setRate(r)"
              >
                {{ r }}x
              </button>
            </div>

            <span class="muted played-times">已听 {{ curPlayedTimes }} 次</span>
          </div>

          <div v-if="audioNotice === 'blocked'" class="audio-warn">
            ⚠️ 浏览器拦截了这次播放。请点上方「播放发音」，或按 <kbd>Ctrl</kbd>+<kbd>Space</kbd>。
          </div>
          <div v-else-if="audioNotice === 'missing'" class="audio-warn">
            ⚠️ 本句音频加载失败。请确认已运行 <code>python scripts/gen_listen_audio.py</code> 生成音频，或直接按 <kbd>Ctrl</kbd>+<kbd>;</kbd> 查看答案。
          </div>

          <!-- ---------- 判分面板 ---------- -->
          <div v-if="judged" class="judge" :class="judgedClass">
            <div class="judge-head">
              <span class="judge-ico">{{ judgedIcon }}</span>
              <span class="judge-title">{{ judgedTitle }}</span>
              <span class="judge-meta">{{ check.matchedCount }}/{{ check.totalWords }} 词</span>
            </div>

            <div class="diff-row">
              <span class="diff-label">正确答案</span>
              <div class="diff-words">
                <b
                  v-for="(w, i) in check.answerWords"
                  :key="i"
                  class="dw"
                  :class="revealed ? 'plain' : (w.matched ? 'ok' : 'miss')"
                >{{ w.text }}</b>
              </div>
            </div>

            <div v-if="revealed" class="judge-note">
              已查看答案，本题不计分
            </div>
            <div v-else-if="!check.correct" class="judge-note">
              <span class="legend"><i class="dot ok"></i>听对</span>
              <span class="legend"><i class="dot miss"></i>漏掉 / 听错</span>
              <span class="muted">上面格子里标红的词没听准</span>
            </div>
          </div>
        </div>

        <div class="btn-row">
          <el-button v-if="!judged" class="btn-primary" :disabled="!hasInput" @click="submitCurrent">
            提交 <span class="btn-key">Enter</span>
          </el-button>
          <el-button v-else class="btn-primary" @click="nextQuestion">
            {{ isLast ? '查看成绩' : '下一句' }} <span class="btn-key">Enter</span>
          </el-button>

          <el-button v-if="!judged" class="btn-ghost" @click="reveal">
            显示答案 <span class="btn-key">Ctrl+;</span>
          </el-button>
          <el-button v-if="current > 1" class="btn-ghost" @click="goTo(current - 1)">
            上一句 <span class="btn-key">Ctrl+←</span>
          </el-button>
        </div>
      </template>

      <!-- ---------- 成绩结算 ---------- -->
      <template v-else-if="result">
        <div class="card result-card">
          <div class="result-emoji">{{ result.stars === 3 ? '🏆' : result.passed ? '🎉' : '💪' }}</div>
          <div class="result-score">{{ result.score }}<span>分</span></div>
          <div class="stars" style="font-size: 22px">
            {{ '★'.repeat(result.stars) }}{{ '☆'.repeat(3 - result.stars) }}
          </div>
          <div class="result-line">
            <span class="chip" :class="result.passed ? 'green' : 'gold'">
              {{ result.passed ? '恭喜通过' : `未达及格线 ${result.passScore} 分` }}
            </span>
            <span class="chip">{{ isHard ? '困难模式' : '简单模式' }}</span>
            <span v-if="result.newRecord" class="chip gold">新纪录</span>
          </div>
          <div v-if="result.unlockNext" class="result-unlock">
            🔓 已解锁下一关
          </div>
          <div class="result-stats">
            <div><b>{{ result.correctCount }}/{{ result.totalCount }}</b><span>完整听对</span></div>
            <div><b>+{{ result.gainPoints }}</b><span>获得积分</span></div>
            <div><b>{{ Math.round(result.avgAccuracy * 100) }}%</b><span>平均准确率</span></div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">
            <span>逐句回顾</span>
            <span class="muted" style="font-weight: 400">错句已自动收录错题本</span>
          </div>
          <div
            v-for="d in reviewList"
            :key="d.sentenceId"
            class="review-row"
            :class="{ bad: !d.correct }"
          >
            <span class="review-ico">{{ d.correct ? '✓' : '✗' }}</span>
            <div class="review-body">
              <div class="review-en">{{ d.english }}</div>
              <div class="review-zh">{{ d.chinese }}</div>
              <div v-if="!d.correct" class="review-your">
                你的输入：<span class="bad-text">{{ d.userAnswer || '（未作答）' }}</span>
                <span v-if="d.revealed" class="chip gold" style="margin-left: 8px">查看过答案</span>
              </div>

              <!--
                针对性讲解：听力句没有选项，chosen 就是学生敲出的整句。
                后端用 LCS 对齐后能说出漏了/多了哪些词，这正是听力最需要的反馈。
                拉取失败/超配额时静默降级，上方仍有逐词红绿对照兜底。
              -->
              <div v-if="d.explain" class="explain-box">
                <div class="explain-head">
                  <span class="explain-title">这句你为什么没听对</span>
                  <span v-if="d.explain.source === 'MOCK'" class="explain-tag">本地生成</span>
                  <span v-else-if="d.explain.source === 'FALLBACK'" class="explain-tag">降级生成</span>
                </div>
                <div v-if="d.explain.loading" class="explain-loading">
                  正在对照原句分析你写错的地方…
                </div>
                <div v-else-if="d.explain.content" class="explain-body">{{ d.explain.content }}</div>
                <div v-else class="explain-fallback">
                  {{ d.explain.error ? d.explain.error + '，' : '' }}可参考逐词对照。
                </div>
              </div>
            </div>
            <span class="review-score">{{ d.score }}<i>/10</i></span>
          </div>
        </div>

        <!-- 通过后：非最后一关给「下一关」；最后一关不出现该按钮，改用收尾文案 -->
        <div v-if="allCleared" class="all-cleared">
          Congratulations！You cleared the level.
          <i>你已通关全部 {{ levels.length }} 个听力关卡</i>
        </div>

        <div class="btn-row">
          <el-button v-if="showNext" class="btn-primary" @click="goNext">
            下一关 · {{ nextLevel.name }} <span class="btn-key">n</span>
          </el-button>
          <el-button :class="showNext ? 'btn-ghost' : 'btn-primary'" @click="goBack">返回关卡</el-button>
          <el-button class="btn-ghost" @click="retryAll">再来一次 <span class="btn-key">r</span></el-button>
        </div>
      </template>

      <div v-else-if="!loading" class="empty">
        <span class="icon">🎧</span>本关暂无听力语料
      </div>
    </div>

    <!-- 最后一关通关：弹窗庆祝（中间关有「下一关」，不打断节奏） -->
    <LevelClearedDialog
      v-model="celebrateVisible"
      kind="听力"
      :level-count="levels.length"
      @back="goBack"
      @retry="retryAll"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listenApi, aiApi } from '@/api'
import { useHotkey } from '@/composables/useHotkey'
import { useKeyHints } from '@/composables/useKeyHints'
import LevelClearedDialog from '@/components/LevelClearedDialog.vue'

const route = useRoute()
const router = useRouter()
const { setHints, setStatus, clearHints } = useKeyHints()

/*
 * 必须用 computed，不能写 `const levelId = route.params.levelId`。
 *
 * 本组件的路由是 /listen/:levelId/:mode，而 <router-view> 没有 :key，
 * 组件实例会被复用、setup 不会重跑 —— 只取一次的 levelId / mode
 * 会停在上一次的值上（典型触发：同一关切换 EASY <-> HARD，
 * 听力关卡页是 push('/listen/{id}/{mode}') 进来的）。
 */
const levelId = computed(() => route.params.levelId)
const mode = computed(() => String(route.params.mode || 'EASY').toUpperCase())
const isHard = computed(() => mode.value === 'HARD')

const RATES = [0.7, 0.9, 1.1]

// 格子宽度 = 字母数 × LETTER_W + 内边距（与等宽字体的实际字宽对齐）
const LETTER_W = 11.5
const SLOT_PAD = 26

const levelName = ref('听力听写')
/** 关卡列表（用于判断「还有没有下一关」以及下一关叫什么） */
const levels = ref([])
const sentences = ref([])
const answers = ref([])
const current = ref(1)
/** 逐词输入格的内容，一个元素 = 一个单词 */
const slots = ref([''])
const slotRefs = ref([])
const activeIndex = ref(0)
const judged = ref(false)
const revealed = ref(false)
const check = ref({})
const result = ref(null)
const loading = ref(true)
const rate = ref(0.9)
const showChinese = ref(true)
const playing = ref(false)
/** 提示状态：'' 正常 | 'blocked' 浏览器拦了播放 | 'missing' 音频文件真的缺失/解码失败 */
const audioNotice = ref('')

const startTime = ref(Date.now())
let audio = null
let busy = false

/*
 * 错句针对性讲解的状态表，key = 「句子 id」。
 * 听力句没有选项，同一个句子只有一种错法来源（学生敲出的整句），
 * 所以 key 不必带 chosen（与语法/词汇按选项区分不同）。
 */
const explainMap = ref({})

/** 把逐句明细与讲解状态配成对；只听错的句子才请求讲解 */
const reviewList = computed(() =>
  (result.value?.details || []).map((d) => ({
    ...d,
    explain: d.correct ? null : explainMap.value[d.sentenceId] || null
  }))
)

/**
 * 当前关卡的后一关；已经是最后一关（或关卡列表没取到）时为 null。
 * 沿用后端返回的关卡顺序，不依赖 id 递增。
 */
const nextLevel = computed(() => {
  const arr = levels.value
  if (!arr.length) return null
  const i = arr.findIndex((l) => String(l.id) === String(levelId.value))
  return i >= 0 && i < arr.length - 1 ? arr[i + 1] : null
})

/** 通过且还有下一关 → 给「下一关」按钮 */
const showNext = computed(() => !!result.value?.passed && !!nextLevel.value)

/** 通过且已经是最后一关 → 用收尾文案替代「下一关」 */
const allCleared = computed(
  () => !!result.value?.passed && !nextLevel.value && levels.value.length > 0
)

/**
 * 最后一关通关时弹一次庆祝框。
 * 用 watch 而不是直接写在 submit 里：allCleared 依赖 levels 与 result 两处数据，
 * 谁先到齐不固定；盯着它翻成 true 才不会漏弹，也不会重复弹。
 */
const celebrateVisible = ref(false)
watch(allCleared, (v) => {
  if (v) celebrateVisible.value = true
})

/** 限制并发地跑一批任务，避免一次性打满后端 */
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
  const wrongs = (result.value?.details || []).filter((d) => !d.correct)
  const pending = []
  for (const d of wrongs) {
    // 查看过答案 / 未作答 → 说明学生根本没听，讲解没有针对性
    if (d.revealed || !d.userAnswer) {
      continue
    }
    if (explainMap.value[d.sentenceId]) continue
    explainMap.value[d.sentenceId] = { loading: true, content: '', source: '', error: '' }
    pending.push(d)
  }
  if (!pending.length) return

  await runWithConcurrency(pending, 3, async (d) => {
    try {
      const data = await aiApi.explainWrong({
        questionId: d.sentenceId,
        chosen: d.userAnswer,
        module: 'LISTENING'
      })
      explainMap.value[d.sentenceId] = {
        loading: false,
        content: data?.content || '',
        source: data?.source || '',
        error: ''
      }
    } catch (e) {
      // 配额用尽、断网、后端异常……都只是「这次没有针对性讲解」，
      // 上方逐词对照仍在，所以这里绝不弹错、也不阻塞其它句
      explainMap.value[d.sentenceId] = {
        loading: false,
        content: '',
        source: '',
        error: e?.message || '讲解获取失败'
      }
    }
  })
}

const cur = computed(() => sentences.value[current.value - 1] || {})
const isLast = computed(() => current.value >= sentences.value.length)
const curPlayedTimes = computed(() => answers.value[current.value - 1]?.playedTimes || 0)
const hasInput = computed(() => slots.value.some((s) => (s || '').trim()))

const progressPercent = computed(() =>
  sentences.value.length ? Math.min(100, (current.value / sentences.value.length) * 100) : 0
)

const showedCorrect = computed(() => judged.value && !revealed.value && check.value.correct)

const judgedClass = computed(() => {
  if (revealed.value) return 'neutral'
  return check.value.correct ? 'ok' : 'bad'
})

const judgedIcon = computed(() => {
  if (revealed.value) return '👁'
  return check.value.correct ? '✓' : '✗'
})

const judgedTitle = computed(() => {
  if (revealed.value) return '已查看答案'
  if (check.value.correct) return `完全正确，+${check.value.score} 分`
  return `准确率 ${Math.round((check.value.accuracy || 0) * 100)}%，得 ${check.value.score} 分`
})

/* ============================================================
   逐词输入格
   ============================================================ */

/**
 * 与后端 ListenService.normalize 保持一致的归一化。
 * 必须同口径，否则 "don't"（原文 5 字符 / 归一化后 4 字符）会被误判为「已打满」而提前跳格。
 */
function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normWords(s) {
  const n = normalizeText(s)
  return n ? n.split(' ') : []
}

function normLen(s) {
  return normalizeText(s).replace(/\s/g, '').length
}

function setSlotRef(el, i) {
  if (el) slotRefs.value[i] = el
}

/** 格子宽度：简单模式由词长决定（长度提示的视觉化），困难模式只随用户输入变化 */
function slotWidth(i) {
  const val = slots.value[i] || ''
  if (isHard.value) {
    // 困难模式绝不能携带原文信息，宽度只反映用户自己敲了什么
    return Math.max(84, val.length * LETTER_W + SLOT_PAD)
  }
  const expected = (cur.value.wordLens || [])[i] || 4
  return Math.max(46, Math.max(expected, val.length) * LETTER_W + SLOT_PAD)
}

/**
 * 简单模式的词长提示：返回该格应该画几条底衬短横。
 * 用后端下发的真实 wordLens（字母数），与格宽计算完全同口径 ——
 * 否则 don't（原文 5 字符 / 字母数 4）这类词会多铺一位。
 */
function hintLen(i) {
  if (isHard.value) return 0
  return (cur.value.wordLens || [])[i] || 0
}

/** 判分后把「听对 / 听错」直接染到格子上 */
const slotStates = computed(() => {
  if (!judged.value) return []
  const flat = check.value.userWords || []
  let idx = 0
  return slots.value.map((s) => {
    const n = normWords(s).length
    if (n === 0) return 'empty'
    const seg = flat.slice(idx, idx + n)
    idx += n
    return seg.length > 0 && seg.every((w) => w.matched) ? 'ok' : 'bad'
  })
})

function slotState(i) {
  return slotStates.value[i] || ''
}

async function focusSlot(i, toEnd = true) {
  if (i < 0 || i >= slots.value.length) return
  activeIndex.value = i
  await nextTick()
  const el = slotRefs.value[i]
  if (!el) return
  el.focus()
  const len = el.value.length
  try {
    el.setSelectionRange(toEnd ? len : 0, len)
  } catch (e) {
    /* 忽略：部分浏览器在只读态下不允许设置选区 */
  }
}

function onSlotFocus(i) {
  activeIndex.value = i
}

/** 简单模式下打满一个词就自动前进，全程不用碰空格 */
function onInput(i) {
  if (judged.value || isHard.value) return
  const expected = (cur.value.wordLens || [])[i]
  if (!expected) return
  if (normLen(slots.value[i]) >= expected && i < slots.value.length - 1) {
    focusSlot(i + 1)
  }
}

/** 困难模式：空格分出新词；简单模式：空格跳到下一格 */
function goNextSlot(i) {
  if (i < slots.value.length - 1) {
    focusSlot(i + 1)
    return
  }
  if (isHard.value) {
    slots.value.push('')
    focusSlot(i + 1)
  }
}

function onSlotKeydown(e, i) {
  if (judged.value) return
  // 组合键（Ctrl+Space 重听、Ctrl+; 看答案）交还给全局快捷键处理
  if (e.ctrlKey || e.metaKey || e.altKey) return

  const k = e.key

  if (k === ' ') {
    e.preventDefault()
    goNextSlot(i)
    return
  }

  if (k === 'Backspace') {
    if ((slots.value[i] || '').length) return // 有内容 → 交给默认删除
    e.preventDefault()
    if (i > 0) {
      // 困难模式尾部多余的空格直接回收，界面不留空壳
      if (isHard.value && i === slots.value.length - 1) slots.value.splice(i, 1)
      focusSlot(i - 1, true)
    }
    return
  }

  // 光标已在边界时才跨格，格内编辑不受影响
  if (k === 'ArrowLeft' && i > 0) {
    const el = e.target
    if (el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault()
      focusSlot(i - 1, true)
    }
    return
  }
  if (k === 'ArrowRight' && i < slots.value.length - 1) {
    const el = e.target
    if (el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
      e.preventDefault()
      focusSlot(i + 1, true)
    }
  }
}

/* ============================================================
   音频播放
   ============================================================ */

function ensureAudio() {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.onplaying = () => {
      playing.value = true
    }
    audio.onended = () => {
      playing.value = false
    }
    audio.onpause = () => {
      playing.value = false
    }
    audio.onerror = () => {
      playing.value = false
      audioNotice.value = 'missing'
    }
  }
  return audio
}

/**
 * 播放当前句（只由「播放发音」按钮 / Ctrl+Space 触发，不再自动调用）。
 *
 * 之前 goTo() 末尾会自动调它，造成两件事：进关卡和切下一句都会冷不丁出声，
 * 而且每次自动播放还会给「已听 N 次」+1，把学情数据也带偏了。
 */
function play() {
  const s = cur.value
  if (!s || !s.id) return
  const a = ensureAudio()
  audioNotice.value = ''
  try {
    a.pause()
    a.src = `/audio/listen/${s.id}.mp3`
    a.playbackRate = rate.value
    a.currentTime = 0
    const p = a.play()
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        // 被浏览器自动播放策略拦下，和「文件确实不存在」是两回事：
        // 前者点一下按钮就能放，后者才需要去跑生成音频的脚本。
        audioNotice.value = err && err.name === 'NotAllowedError' ? 'blocked' : 'missing'
      })
    }
  } catch (e) {
    audioNotice.value = 'missing'
  }
  // 走到这里一定是用户主动播放，可以放心计数
  const item = answers.value[current.value - 1]
  if (item) item.playedTimes = (item.playedTimes || 0) + 1
}

function setRate(r) {
  rate.value = r
  if (audio) audio.playbackRate = r
}

/* ============================================================
   答题流程
   ============================================================ */

async function goTo(index) {
  if (index < 1 || index > sentences.value.length) return
  if (audio) audio.pause()
  current.value = index
  const item = answers.value[index - 1]
  // 直接引用答案数组里的格子，边打字边保存，切句不丢进度
  if (!item.slots || !item.slots.length) item.slots = ['']
  const arr = item.slots
  // 简单模式：一个单词一个格子，格子数由后端下发的词数决定
  // （困难模式绝不补齐，否则「有几个格子」就等于泄露了词数）
  if (!isHard.value) {
    const n = (sentences.value[index - 1]?.wordLens || []).length
    while (n > 0 && arr.length < n) arr.push('')
  }
  slots.value = arr
  slotRefs.value = []
  judged.value = false
  revealed.value = false
  check.value = {}
  audioNotice.value = ''

  await nextTick()
  await focusSlot(0)
}

async function submitCurrent() {
  if (busy || judged.value) return
  const text = slots.value.join(' ').trim()
  if (!text) {
    ElMessage.warning('请先敲出你听到的单词')
    return
  }
  busy = true
  try {
    const res = await listenApi.check({ sentenceId: cur.value.id, userAnswer: text, mode: mode.value })
    check.value = res || {}
    judged.value = true
    revealed.value = false
    answers.value[current.value - 1].userAnswer = text
    answers.value[current.value - 1].revealed = false
    if (audio) audio.pause()
  } finally {
    busy = false
  }
}

/** 显示答案：本题按放弃处理，不计分 */
async function reveal() {
  if (busy || judged.value) return
  busy = true
  try {
    const item = answers.value[current.value - 1]
    const res = await listenApi.check({ sentenceId: cur.value.id, userAnswer: '', mode: mode.value })
    check.value = res || {}
    judged.value = true
    revealed.value = true
    item.userAnswer = slots.value.join(' ').trim()
    item.revealed = true
    if (audio) audio.pause()
  } finally {
    busy = false
  }
}

function nextQuestion() {
  if (busy) return
  if (isLast.value) {
    finish()
  } else {
    goTo(current.value + 1)
  }
}

async function finish() {
  busy = true
  loading.value = true
  try {
    result.value = await listenApi.submit(levelId.value, {
      mode: mode.value,
      costTime: Math.round((Date.now() - startTime.value) / 1000),
      answers: answers.value.map((a) => ({
        sentenceId: a.sentenceId,
        userAnswer: a.userAnswer || '',
        playedTimes: a.playedTimes || 0,
        revealed: a.revealed === true
      }))
    })
    if (audio) audio.pause()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // 交卷后再异步拉讲解，不阻塞成绩展示
    loadExplains()
  } finally {
    loading.value = false
    busy = false
  }
}

function onBack() {
  if (result.value || !answers.value.some((a) => a.userAnswer)) {
    goBack()
    return
  }
  ElMessageBox.confirm('退出将丢失本次练习进度，确定退出吗？', '提示', {
    confirmButtonText: '退出',
    cancelButtonText: '继续练习',
    type: 'warning'
  })
    .then(goBack)
    .catch(() => {})
}

function goBack() {
  router.replace('/listen')
}

/**
 * 直接进入下一关（保持当前难易模式）。
 * 路由参数变化会复用组件实例，所以先清掉结算态，避免停在上关成绩页。
 */
function goNext() {
  if (!nextLevel.value) return
  result.value = null
  explainMap.value = {}
  router.replace(`/listen/${nextLevel.value.id}/${mode.value}`)
}

/** 拉关卡列表，仅用于判断有没有下一关；失败不影响正常练习 */
async function loadLevels() {
  try {
    levels.value = (await listenApi.levels()) || []
  } catch (e) {
    /* 拿不到就当没有下一关 */
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
    const data = await listenApi.sentences(levelId.value, mode.value)
    levelName.value = data?.levelName || '听力听写'
    sentences.value = data?.sentences || []
    answers.value = sentences.value.map((s) => ({
      sentenceId: s.id,
      slots: [''],
      userAnswer: '',
      playedTimes: 0,
      revealed: false
    }))
    current.value = 1
    result.value = null
    startTime.value = Date.now()
    await goTo(1)
  } catch (e) {
    // 关卡未解锁（或语料缺失）导致取不到句子：直接退回关卡列表，不要停在空白页。
    // 具体原因由响应拦截器统一提示。
    goBack()
  } finally {
    loading.value = false
  }
}

/* ============================================================
   键盘操作
   ============================================================ */

useHotkey({
  'Ctrl+Space': () => {
    play()
    return true
  },
  Enter: () => {
    if (result.value) {
      // 弹窗还开着时，Enter 先收弹窗，别隔着一层遮罩把页面跳走
      if (celebrateVisible.value) {
        celebrateVisible.value = false
        return true
      }
      goBack()
      return true
    }
    if (judged.value) nextQuestion()
    else submitCurrent()
    return true
  },
  'Ctrl+;': () => {
    if (!judged.value && !result.value) reveal()
    return true
  },
  'Ctrl+ArrowLeft': () => {
    if (!result.value && current.value > 1) goTo(current.value - 1)
    return true
  },
  'Ctrl+ArrowRight': () => {
    if (!result.value && judged.value) nextQuestion()
    return true
  },
  'Ctrl+t': () => {
    showChinese.value = !showChinese.value
    return true
  },
  Escape: () => {
    // 庆祝弹窗开着时，Esc 只负责关弹窗，别把关卡页也一起退了
    if (celebrateVisible.value) {
      celebrateVisible.value = false
      return true
    }
    onBack()
    return true
  },
  r: (e) => {
    if (celebrateVisible.value) return false
    if (!result.value) return false
    retryAll()
    return true
  },
  // 结算页「下一关」的键盘入口；没有下一关时把 n 放行
  n: () => {
    if (!result.value || !showNext.value) return false
    goNext()
    return true
  }
})

/* ---------------- 键位提示条 ---------------- */
watch(
  [judged, revealed, () => result.value, () => sentences.value.length, isHard, curPlayedTimes, showNext],
  () => {
    if (result.value) {
      setHints([
        ...(showNext.value ? [{ keys: ['n'], label: '下一关' }] : []),
        { keys: ['Enter'], label: '返回关卡' },
        { keys: ['r'], label: '再来一次' }
      ])
      setStatus(`得分 ${result.value.score} 分`)
      return
    }
    // 还没听过就说「播放」，听过才说「重听」。现在不再自动播了，
    // 进关卡第一眼写「重听发音」会让人以为自己漏点了什么。
    const base = [
      { keys: ['Ctrl', 'Space'], label: curPlayedTimes.value > 0 ? '重听发音' : '播放发音' }
    ]
    if (judged.value) {
      base.unshift({ keys: ['Enter'], label: isLast.value ? '查看成绩' : '下一句' })
      base.push({ keys: ['Ctrl', '←'], label: '上一句' })
    } else {
      base.unshift({ keys: ['Enter'], label: '提交' })
      if (isHard.value) base.push({ keys: ['Space'], label: '分出新词' })
      base.push({ keys: ['Ctrl', ';'], label: '显示答案' })
    }
    base.push({ keys: ['Ctrl', 'T'], label: '中文提示' })
    base.push({ keys: ['Esc'], label: '退出' })
    setHints(base)
    setStatus(`${isHard.value ? '困难' : '简单'}模式 · 第 ${current.value}/${sentences.value.length} 句`)
  },
  { immediate: true }
)

onMounted(async () => {
  await loadLevels()
  await load()
})

/*
 * 同关卡切换 EASY / HARD 时路由参数变了，但组件被复用、setup 不重跑。
 * 不监听的话页面会停在旧模式的数据上 —— 且因为 isHard 已变，
 * 格宽/自动跳格等分支的走向会和新数据不一致，更像"卡住"。
 */
watch([levelId, mode], (next, prev) => {
  if (next[0] === prev[0] && next[1] === prev[1]) return
  if (next[0] == null) return
  // 换关卡后「下一关」的目标也变了，顺手刷新关卡列表
  if (next[0] !== prev[0]) loadLevels()
  load()
})

onUnmounted(() => {
  clearHints()
  if (audio) {
    audio.pause()
    audio.src = ''
    audio = null
  }
})
</script>

<style scoped>
.dictation-wrap {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 32px 40px;
}

.mode-tag {
  font-size: 11.5px;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.mode-tag.easy {
  background: var(--eq-success-bg);
  color: var(--eq-success);
}
.mode-tag.hard {
  background: var(--eq-warning-bg);
  color: var(--eq-warning);
}

/* ---------- 舞台 ---------- */
.stage {
  min-height: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 34px 0 10px;
}

.stage-chinese {
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-align: center;
  color: var(--eq-text);
  margin-bottom: 30px;
  line-height: 1.6;
}
.stage-chinese.hidden-tip {
  font-size: 13px;
  font-weight: 400;
  color: var(--eq-text-mute);
}

/* ---------- 逐词输入格 ---------- */
.word-slots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-end;
  gap: 12px 14px;
  max-width: 100%;
  min-height: 48px;
}

.slot {
  position: relative;
  height: 46px;
  display: flex;
  align-items: center;
  border-bottom: 2px solid var(--eq-border);
  border-radius: 6px 6px 0 0;
  background: var(--eq-surface-sunken);
  transition: border-color 0.15s, background 0.15s;
}

/*
 * 词长底衬提示：与输入文字同字体、同字号、同居中方式，
 * 于是「已打几个字母」和「这个词总共几个字母」天然对齐 ——
 * 未打满时底衬就从光标右侧透出来，一眼看出还差几位。
 * 字距必须也是 normal，与 .slot-input 保持一致，否则两者会错位。
 */
.slot-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  user-select: none;
  font-family: var(--eq-mono);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: normal;
  padding: 0 4px;
  overflow: hidden;
  color: var(--eq-hint-tick);
}
/* 每个待填字符画成一条基线短横，像纸质表格的填写位 */
.slot-hint i {
  display: inline-block;
  width: 0.62em;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  opacity: 0.55;
}
.slot.active .slot-hint {
  color: var(--eq-hint-tick-active);
}
.slot.active .slot-hint i {
  opacity: 0.8;
}
/* 判分后底衬退场，避免与红绿结果抢视觉 */
.slot.ok .slot-hint,
.slot.bad .slot-hint {
  opacity: 0;
}
.slot.active {
  border-bottom-color: var(--eq-primary);
  background: var(--eq-primary-soft);
  box-shadow: 0 2px 0 -1px var(--eq-primary);
}
.slot.pending {
  border-bottom-style: dashed;
}
.slot.empty {
  border-bottom-style: dashed;
  border-bottom-color: var(--eq-border);
}
.slot.ok {
  border-bottom-color: var(--eq-success);
  background: var(--eq-success-bg);
}
.slot.bad {
  border-bottom-color: var(--eq-danger);
  background: var(--eq-danger-bg);
}

.slot-input {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  padding: 0 4px;
  text-align: center;
  font-family: var(--eq-mono);
  font-size: 19px;
  font-weight: 600;
  /* 不能用 letter-spacing 挤字符宽度 —— 那会让底衬提示与格宽错位 */
  color: var(--eq-text);
  caret-color: var(--eq-primary);
}
.slot-input:read-only {
  cursor: default;
}
.slot.ok .slot-input {
  color: var(--eq-success);
}
.slot.bad .slot-input {
  color: var(--eq-danger);
}

.slots-tip {
  margin-top: 16px;
  font-size: 12.5px;
  color: var(--eq-text-mute);
  text-align: center;
}
.slots-tip kbd {
  font-family: var(--eq-font);
  font-size: 11px;
  padding: 1px 6px;
  margin: 0 2px;
  border-radius: 4px;
  background: var(--eq-surface-sunken);
  border: 1px solid var(--eq-border);
  color: var(--eq-text-sub);
}

/* ---------- 播放控制 ---------- */
.play-row {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 34px;
  flex-wrap: wrap;
  justify-content: center;
}
.play-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 18px;
  border-radius: 24px;
  border: 1px solid var(--eq-border);
  background: var(--eq-surface);
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--eq-text);
  transition: all 0.15s;
  font-family: inherit;
}
.play-btn:hover {
  border-color: var(--eq-primary);
  color: var(--eq-accent);
}
.play-btn.playing {
  background: var(--eq-primary-soft);
  border-color: var(--eq-primary);
  color: var(--eq-accent);
}
.play-btn:focus-visible {
  outline: none;
  box-shadow: var(--eq-focus);
}
.play-ico {
  font-size: 15px;
}
.play-keys {
  display: flex;
  gap: 3px;
  margin-left: 2px;
}
.play-keys kbd {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--eq-surface-sunken);
  border: 1px solid var(--eq-border);
  color: var(--eq-text-sub);
  font-family: var(--eq-font);
}

.rate-group {
  display: flex;
  align-items: center;
  gap: 5px;
}
.rate-btn {
  border: 1px solid var(--eq-border);
  background: var(--eq-surface);
  border-radius: 7px;
  padding: 4px 9px;
  font-size: 12px;
  cursor: pointer;
  color: var(--eq-text-sub);
  font-family: inherit;
  transition: all 0.15s;
}
.rate-btn.active {
  background: var(--eq-primary-soft);
  border-color: var(--eq-primary);
  color: var(--eq-accent);
  font-weight: 600;
}
.played-times {
  font-size: 12px;
}

.audio-warn {
  margin-top: 20px;
  padding: 11px 16px;
  border-radius: 9px;
  background: var(--eq-warning-bg);
  color: var(--eq-warning);
  font-size: 12.5px;
  line-height: 1.7;
}
.audio-warn code {
  background: var(--eq-code-bg);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
}
.audio-warn kbd {
  background: var(--eq-invert-bg);
  border: 1px solid var(--eq-invert-border);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 11px;
}

/* ---------- 判分面板 ---------- */
.judge {
  width: 100%;
  max-width: 720px;
  margin-top: 30px;
  border-radius: var(--eq-radius);
  border: 1px solid var(--eq-border);
  background: var(--eq-surface);
  padding: 18px 20px;
  box-shadow: var(--eq-shadow);
  animation: judge-in 0.22s ease-out;
}
@keyframes judge-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.judge.ok {
  border-color: rgba(22, 163, 74, 0.32);
  background: linear-gradient(180deg, rgba(22, 163, 74, 0.045), var(--eq-surface) 60%);
}
.judge.bad {
  border-color: rgba(220, 38, 38, 0.28);
  background: linear-gradient(180deg, rgba(220, 38, 38, 0.04), var(--eq-surface) 60%);
}

.judge-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px dashed var(--eq-border);
}
.judge-ico {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.judge.ok .judge-ico {
  background: var(--eq-success);
}
.judge.bad .judge-ico {
  background: var(--eq-danger);
}
.judge.neutral .judge-ico {
  background: var(--eq-text-sub);
}
.judge-title {
  font-size: 14px;
  font-weight: 700;
  flex: 1;
}
.judge-meta {
  font-size: 12px;
  color: var(--eq-text-sub);
  font-variant-numeric: tabular-nums;
}

.diff-row {
  display: flex;
  gap: 14px;
  padding: 7px 0;
  align-items: flex-start;
}
.diff-label {
  width: 64px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--eq-text-sub);
  padding-top: 3px;
}
.diff-words {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;
}
.dw {
  font-family: var(--eq-mono);
  font-size: 14px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--eq-surface-sunken);
  color: var(--eq-text);
}
.dw.ok {
  background: var(--eq-success-bg);
  color: var(--eq-success);
}
.dw.miss {
  background: var(--eq-danger-bg);
  color: var(--eq-danger);
  text-decoration: line-through;
  text-decoration-color: var(--eq-strike);
}
.dw.bad {
  background: var(--eq-danger-bg);
  color: var(--eq-danger);
}
.dw.plain {
  background: var(--eq-success-bg);
  color: var(--eq-success);
}

.judge-note {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--eq-border);
  font-size: 12px;
  color: var(--eq-text-sub);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.legend {
  display: flex;
  align-items: center;
  gap: 5px;
}
.legend .dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  display: inline-block;
}
.legend .dot.ok {
  background: var(--eq-success);
}
.legend .dot.miss {
  background: var(--eq-danger);
}

/* ---------- 结算 ---------- */
.review-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px dashed var(--eq-border);
}
.review-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.review-ico {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--eq-success);
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.review-row.bad .review-ico {
  background: var(--eq-danger);
}
.review-body {
  flex: 1;
  min-width: 0;
}
.review-en {
  font-family: var(--eq-mono);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  word-break: break-word;
}
.review-zh {
  font-size: 12.5px;
  color: var(--eq-text-sub);
  margin-top: 3px;
}
.review-your {
  font-size: 12.5px;
  color: var(--eq-text-sub);
  margin-top: 6px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.bad-text {
  font-family: var(--eq-mono);
  color: var(--eq-danger);
  text-decoration: line-through;
  text-decoration-color: var(--eq-strike-soft);
  margin-left: 2px;
}
.review-score {
  font-size: 15px;
  font-weight: 700;
  color: var(--eq-accent);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.review-score i {
  font-style: normal;
  font-size: 11px;
  font-weight: 400;
  color: var(--eq-text-mute);
}

.btn-key {
  font-size: 10.5px;
  opacity: 0.7;
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
}

.btn-row {
  justify-content: center;
}

@media (max-width: 760px) {
  .dictation-wrap {
    padding: 18px 16px 32px;
  }
  .slot-input {
    font-size: 16px;
  }
  .slot {
    height: 40px;
  }
  .stage-chinese {
    font-size: 17px;
  }
}
</style>
