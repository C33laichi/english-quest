<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">AI 智能练习</h2>
        <div class="page-desc">
          从错题本里挑题：① 生成同型题，检验你是真懂了还是只记住了答案；
          ② 勾选多个单词，让 AI 把它们编成一篇短文；③ 语法题可让 AI 拓展考点
        </div>
      </div>

      <!--
        AI 对话入口：是否可用取决于服务端有没有配 Key。
        刻意**不做置灰禁用**——需求是"看起来正常、但明确告知不可使用"，
        所以状态只体现在那个小圆点与「可使用 / 不可使用」文字上，
        鼠标悬停给完整原因，点击时若不可用则弹提示（见 openChat）。
      -->
      <el-tooltip
        :content="chatTip"
        placement="bottom-end"
        effect="dark"
        :show-after="80"
      >
        <button class="ai-chat-entry" type="button" @click="openChat">
          <span class="ai-chat-dot" :class="{ on: chatReady }"></span>
          <span class="ai-chat-name">AI 对话</span>
          <span class="ai-chat-state">{{ chatStateText }}</span>
        </button>
      </el-tooltip>
    </div>

    <div class="ai-grid">
      <!-- ---------- 左：选错题 ---------- -->
      <div class="card">
        <div class="card-title">
          <span>第一步 · 选择错题</span>
          <span class="muted" style="font-weight:400">{{ errors.length }} 道可选</span>
        </div>
        <div v-if="errors.length" class="pick-list">
          <div
            v-for="e in errors"
            :key="e.id"
            class="pick-item"
            :class="{ active: selectedId === e.id }"
            @click="onPick(e)"
          >
            <!--
              勾选框只给词汇错题：勾选是「串成短文」专用的多选，
              与点击整行选中（生成同型题 / 拓展考点）是两套互不干扰的交互。
            -->
            <label v-if="e.module === 'VOCAB'" class="pick-check" title="勾选后可串成短文" @click.stop>
              <input
                type="checkbox"
                :checked="checkedIds.includes(e.id)"
                @change="toggleCheck(e)"
              />
            </label>
            <span class="chip" :class="moduleMeta(e.module).cls">{{ moduleMeta(e.module).label }}</span>
            <span class="pick-stem">{{ e.stem }}</span>
          </div>
        </div>
        <div v-else class="empty" style="padding:24px">
          错题本里还没有词汇或语法错题，先去闯关吧
        </div>

        <div class="btn-row pick-actions">
          <el-button
            class="btn-primary"
            :loading="loading"
            :disabled="!selectedId"
            @click="generate"
          >
            {{ loading ? 'AI 正在出题…' : '生成同型题' }}
          </el-button>

          <el-button
            v-if="selectedIsGrammar"
            class="btn-ghost"
            :loading="expandLoading"
            @click="loadExpand"
          >
            {{ expandLoading ? 'AI 正在拓展…' : '拓展这个考点' }}
          </el-button>

          <el-button
            v-if="checkedIds.length"
            class="btn-ghost"
            :loading="passageLoading"
            :disabled="checkedIds.length < 2"
            @click="makePassage"
          >
            {{ passageLoading ? 'AI 正在写…' : `串成短文（已选 ${checkedIds.length}）` }}
          </el-button>
        </div>
        <div v-if="checkedIds.length === 1" class="pick-tip">
          再勾一个单词，就能让 AI 把它们编成一篇短文
        </div>
      </div>

      <!-- ---------- 右：结果 ---------- -->
      <div class="card">
        <!-- ① 单词串烧 -->
        <template v-if="passage">
          <div class="card-title">
            <span class="chip">单词串烧</span>
            <span class="muted" style="font-weight:400;font-size:12px">
              {{ sourceTextOf(passage.source) }}
            </span>
          </div>
          <div class="passage-title">{{ passage.title }}</div>
          <div class="word-chips">
            <span v-for="w in passage.words" :key="w" class="word-chip">{{ w }}</span>
          </div>
          <div class="passage-body">{{ passage.content }}</div>
          <div v-if="passage.translation" class="passage-trans">{{ passage.translation }}</div>
          <div class="btn-row" style="margin-top:14px">
            <el-button class="btn-ghost" @click="clearResult">清空</el-button>
          </div>
        </template>

        <!-- ② 语法考点拓展 -->
        <template v-else-if="expandResult">
          <div class="card-title">
            <span class="chip gold">{{ expandResult.knowledgePoint || '考点拓展' }}</span>
            <span class="muted" style="font-weight:400;font-size:12px">
              {{ sourceTextOf(expandResult.source) }}
            </span>
          </div>
          <div class="expand-stem">{{ expandResult.stem }}</div>
          <div class="expand-body">{{ expandResult.content }}</div>
          <div v-if="expandResult.analysis" class="expand-analysis">
            <b>原题解析：</b>{{ expandResult.analysis }}
          </div>
          <div class="btn-row" style="margin-top:14px">
            <el-button class="btn-ghost" @click="clearResult">清空</el-button>
          </div>
        </template>

        <!-- ③ 同型题 -->
        <template v-else-if="question">
          <div class="card-title">
            <span class="chip">{{ question.knowledgePoint || '同型题' }}</span>
            <span class="muted" style="font-weight:400;font-size:12px">{{ sourceTextOf(question.source) }}</span>
          </div>

          <div class="quiz-stem" style="font-size:19px">{{ question.stem }}</div>
          <div class="quiz-hint">
            按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> 作答
          </div>

          <div
            v-for="(opt, i) in question.options"
            :key="i"
            class="option"
            :class="optionClass(i)"
            @click="choose(i)"
          >
            <span class="option-key">{{ i + 1 }}</span>
            <span>{{ opt }}</span>
          </div>

          <div v-if="chosen !== null" class="analysis-box">
            <div class="analysis-head">
              <span v-if="isCorrect" style="color:var(--eq-success);font-weight:700">✓ 答对了</span>
              <span v-else style="color:var(--eq-danger);font-weight:700">
                ✗ 答错了，正确答案是 {{ question.answer }}
              </span>
            </div>
            <div v-if="question.analysis" class="wrong-analysis">{{ question.analysis }}</div>
            <div class="btn-row" style="margin-top:12px">
              <el-button class="btn-ghost" @click="reset">再选一道错题</el-button>
            </div>
          </div>
        </template>

        <div v-else class="empty" style="padding:34px 20px">
          <span class="icon">🤖</span>
          左侧选一道错题按 <kbd>Enter</kbd> 生成同型题；<br />
          勾选两个以上词汇错题可串成短文；语法错题可点「拓展这个考点」
        </div>
      </div>
    </div>

    <!-- ---------- AI 对话弹窗（仅服务端配了 Key 时可打开） ---------- -->
    <el-dialog
      v-model="chatVisible"
      class="ai-chat-dialog"
      width="620px"
      :close-on-click-modal="false"
      append-to-body
      @closed="onChatClosed"
    >
      <template #header>
        <div class="chat-head">
          <span class="chat-head-title">AI 对话</span>
          <span v-if="chatModel" class="chat-head-sub">{{ chatModel }}</span>
        </div>
      </template>

      <div ref="chatScroll" class="chat-body">
        <div v-if="!chatTurns.length" class="chat-empty">
          <div class="chat-empty-title">专升本英语学习中遇到什么都可以问</div>
          <div class="chat-empty-sub">比如辨析近义词、讲清一个语法点、问作文怎么写开头</div>
          <div class="chat-samples">
            <button
              v-for="s in CHAT_SAMPLES"
              :key="s"
              class="chat-sample"
              type="button"
              @click="useSample(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <div v-for="(t, i) in chatTurns" :key="i" class="chat-row" :class="t.role">
          <div class="chat-bubble">{{ t.content }}</div>
        </div>

        <div v-if="chatSending" class="chat-row assistant">
          <div class="chat-bubble chat-typing">正在思考…</div>
        </div>
      </div>

      <div class="chat-input">
        <el-input
          ref="chatInputRef"
          v-model="chatDraft"
          type="textarea"
          :rows="2"
          resize="none"
          maxlength="500"
          show-word-limit
          placeholder="输入问题，Enter 发送，Shift + Enter 换行"
          @keydown="onChatKeydown"
        />
        <div class="chat-actions">
          <span class="chat-quota">{{ chatQuotaText }}</span>
          <el-button
            class="btn-ghost"
            :disabled="!chatTurns.length || chatSending"
            @click="clearChat"
          >
            清空对话
          </el-button>
          <el-button
            class="btn-primary"
            :loading="chatSending"
            :disabled="!chatDraft.trim()"
            @click="sendChat"
          >
            发送
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { aiApi, errorBookApi } from '@/api'
import { useHotkey } from '@/composables/useHotkey'
import { useKeyHints } from '@/composables/useKeyHints'

const { setHints, setStatus, clearHints } = useKeyHints()

const errors = ref([])
const selectedId = ref(null)
const selectedError = ref(null)
const checkedIds = ref([])

const question = ref(null)
const passage = ref(null)
const expandResult = ref(null)

const chosen = ref(null)
const loading = ref(false)
const passageLoading = ref(false)
const expandLoading = ref(false)

const selectedIsGrammar = computed(() => selectedError.value?.module === 'GRAMMAR')

/*
 * 错题本里有 VOCAB / GRAMMAR / LISTENING 三种模块。
 * 原来这里写成 `module === 'VOCAB' ? '词汇' : '语法'`，把**听力错题也标成了语法** ——
 * 现在按模块查表，并只把词汇/语法收进本页（AI 练习对听力错题没有对应能力，
 * 与其列出来却点不出有效动作，不如不列）。
 */
const MODULE_META = {
  VOCAB: { label: '词汇', cls: '' },
  GRAMMAR: { label: '语法', cls: 'gold' }
}
function moduleMeta(module) {
  return MODULE_META[module] || { label: module || '其他', cls: 'gray' }
}

const SOURCE_TEXT = {
  MOCK: '本地生成',
  LLM: 'AI 大模型',
  FALLBACK: '降级生成'
}
function sourceTextOf(source) {
  return SOURCE_TEXT[source] || source || ''
}

const isCorrect = computed(() => {
  if (chosen.value === null || !question.value) return false
  return String.fromCharCode(65 + chosen.value) === String(question.value.answer)
})

function optionClass(i) {
  if (chosen.value === null) return {}
  const key = String.fromCharCode(65 + i)
  if (key === question.value.answer) return { correct: true }
  if (i === chosen.value) return { wrong: true }
  return {}
}

function onPick(e) {
  selectedId.value = e.id
  selectedError.value = e
  // 切换选中项时清掉「属于上一道题」的结果，但保留短文（多选产物，与单点选中无关）
  question.value = null
  expandResult.value = null
  chosen.value = null
}

function toggleCheck(e) {
  const i = checkedIds.value.indexOf(e.id)
  if (i >= 0) {
    checkedIds.value.splice(i, 1)
  } else {
    checkedIds.value.push(e.id)
  }
}

function choose(i) {
  if (chosen.value !== null || !question.value) return
  chosen.value = i
}

function clearResult() {
  question.value = null
  passage.value = null
  expandResult.value = null
  chosen.value = null
}

function reset() {
  clearResult()
  selectedId.value = null
  selectedError.value = null
}

async function generate() {
  if (!selectedId.value) {
    ElMessage.warning('请先选择一道错题')
    return
  }
  loading.value = true
  chosen.value = null
  passage.value = null
  expandResult.value = null
  try {
    question.value = await aiApi.similar({ errorId: selectedId.value })
  } finally {
    loading.value = false
  }
}

async function makePassage() {
  if (checkedIds.value.length < 2) {
    ElMessage.warning('至少勾选两个单词')
    return
  }
  passageLoading.value = true
  question.value = null
  expandResult.value = null
  chosen.value = null
  try {
    passage.value = await aiApi.passage({ errorIds: [...checkedIds.value] })
  } finally {
    passageLoading.value = false
  }
}

async function loadExpand() {
  if (!selectedId.value) return
  expandLoading.value = true
  question.value = null
  passage.value = null
  chosen.value = null
  try {
    expandResult.value = await aiApi.expand({ errorId: selectedId.value })
  } finally {
    expandLoading.value = false
  }
}

/* ---------------- AI 对话 ---------------- */

/*
 * 可用性由服务端给：没配 Key 时 chatAvailable=false + reason。
 * 这里刻意**不把入口置灰禁用**（需求是"看起来正常、但明确告知不可使用"）：
 * 状态只体现在小圆点与文字上，悬停给完整原因，点击时再弹提示。
 */
const chatStatus = ref(null)
const chatVisible = ref(false)
const chatTurns = ref([])
const chatDraft = ref('')
const chatSending = ref(false)
const chatScroll = ref(null)
const chatInputRef = ref(null)

const CHAT_SAMPLES = [
  'affect 和 effect 怎么区分？',
  '虚拟语气里的 were 什么时候用？',
  '现在完成时和一般过去时有什么区别？'
]

const chatReady = computed(() => chatStatus.value?.chatAvailable === true)
const chatModel = computed(() => (chatReady.value ? chatStatus.value?.model || '' : ''))

/** 状态文字：还没拿到状态时显示「检测中」，不要误报成「不可使用」 */
const chatStateText = computed(() => {
  if (!chatStatus.value) return '检测中'
  return chatReady.value ? '可使用' : '不可使用'
})

function quotaTextOf(n) {
  if (n === -1 || n === undefined || n === null) return '不限次数'
  return `今日剩余 ${n} 次`
}

/* 悬停时弹出的那句说明：可使用 / 不可使用 + 具体原因 */
const chatTip = computed(() => {
  if (!chatStatus.value) return '正在检查 AI 服务状态…'
  if (!chatReady.value) {
    return `不可使用：${chatStatus.value.reason || '服务端未配置 AI 能力'}`
  }
  return `可使用：${chatModel.value || 'AI 模型'} · ${quotaTextOf(chatStatus.value.remaining)}`
})

const chatQuotaText = computed(() => (chatReady.value ? quotaTextOf(chatStatus.value?.remaining) : ''))

async function loadChatStatus() {
  // 拉不到就当作不可用（served 端会正常返回，异常多为登录态问题）
  chatStatus.value = await aiApi.status().catch(() => null)
}

function openChat() {
  if (!chatStatus.value) {
    ElMessage.warning('正在检查 AI 服务状态，请稍候')
    return
  }
  if (!chatReady.value) {
    ElMessage.warning(`${chatStatus.value.reason || '服务端未配置 AI 能力'}，AI 对话不可使用`)
    return
  }
  chatVisible.value = true
  nextTick(() => chatInputRef.value?.focus())
}

function useSample(s) {
  chatDraft.value = s
  nextTick(() => chatInputRef.value?.focus())
}

async function scrollChatToEnd() {
  await nextTick()
  const el = chatScroll.value
  if (el) el.scrollTop = el.scrollHeight
}

/**
 * 输入框里的回车：中文输入法组词期间的回车是在选词，绝不能当发送，
 * 否则打拼音选词就会误发。
 */
function onChatKeydown(e) {
  if (e.key !== 'Enter') return
  if (e.isComposing || e.keyCode === 229) return
  if (e.shiftKey) return   // Shift + Enter 换行
  e.preventDefault()
  sendChat()
}

async function sendChat() {
  const text = chatDraft.value.trim()
  if (!text || chatSending.value) return

  chatTurns.value.push({ role: 'user', content: text })
  chatDraft.value = ''
  chatSending.value = true
  scrollChatToEnd()

  try {
    const res = await aiApi.chat({
      message: text,
      // 历史**不含本轮**：去掉刚 push 进去的那条提问
      history: chatTurns.value.slice(0, -1).map((t) => ({ role: t.role, content: t.content }))
    })
    chatTurns.value.push({ role: 'assistant', content: res.reply })
    // 顺手把剩余次数同步到入口提示上
    if (typeof res.remainingQuota === 'number' && chatStatus.value) {
      chatStatus.value = { ...chatStatus.value, remaining: res.remainingQuota }
    }
  } catch {
    /*
     * 失败时撤掉这条提问并把内容还给输入框：
     * 一是让历史始终保持「问-答」成对，二是用户按一下发送就能重试。
     * 具体错误提示由响应拦截器统一弹出，这里不重复提示。
     */
    chatTurns.value.pop()
    chatDraft.value = text
  } finally {
    chatSending.value = false
    scrollChatToEnd()
  }
}

function clearChat() {
  chatTurns.value = []
  chatDraft.value = ''
}

function onChatClosed() {
  // 关闭时刷新一次状态：剩余次数、以及服务端是否刚被改过配置
  loadChatStatus()
}

/* ---------------- 键盘操作 ---------------- */
useHotkey({
  /*
   * 对话弹窗打开时，整页快捷键必须让位：否则在弹窗里打字会触发页面动作
   * （useHotkey 只放行输入框里的字母数字键，但 Enter / Escape 在白名单里，
   *  而点击弹窗空白处后焦点会离开输入框，字母键也会漏进来）。
   * 返回 false = 不接管该键，弹窗自己的行为照常。
   */
  a: () => (chatVisible.value ? false : choose(0)),
  b: () => (chatVisible.value ? false : choose(1)),
  c: () => (chatVisible.value ? false : choose(2)),
  d: () => (chatVisible.value ? false : choose(3)),
  1: () => (chatVisible.value ? false : choose(0)),
  2: () => (chatVisible.value ? false : choose(1)),
  3: () => (chatVisible.value ? false : choose(2)),
  4: () => (chatVisible.value ? false : choose(3)),
  Enter: () => {
    // 弹窗里回车是「发送 / 换行」，交给弹窗处理
    if (chatVisible.value) return false
    if (chosen.value !== null) reset()
    else if (question.value) return false
    else generate()
    return true
  },
  Escape: () => {
    // 弹窗开着时让 el-dialog 自己关，别顺手把右侧结果也清掉
    if (chatVisible.value) return false
    if (question.value || passage.value || expandResult.value || chosen.value !== null) {
      clearResult()
    }
    return true
  },
  r: () => {
    if (chatVisible.value) return false
    if (chosen.value !== null) reset()
    return true
  }
})

watch(
  [
    () => question.value,
    () => passage.value,
    () => expandResult.value,
    chosen,
    selectedId,
    checkedIds,
    chatVisible
  ],
  () => {
    // 弹窗打开时底部提示条要说弹窗的事，否则会显示「Enter 生成同型题」而回车其实在发送
    if (chatVisible.value) {
      setHints([{ keys: ['Esc'], label: '关闭对话' }])
      setStatus('AI 对话')
      return
    }
    if (chosen.value !== null) {
      setHints([
        { keys: ['Enter'], label: '再选一道错题' },
        { keys: ['Esc'], label: '重置' }
      ])
      setStatus(isCorrect.value ? '答对了' : '答错了')
      return
    }
    if (question.value) {
      setHints([{ keys: ['1', '2', '3', '4'], label: '作答' }])
      setStatus('AI 同型题')
      return
    }
    if (passage.value) {
      setHints([{ keys: ['Esc'], label: '清空' }])
      setStatus('单词串烧完成')
      return
    }
    if (expandResult.value) {
      setHints([{ keys: ['Esc'], label: '清空' }])
      setStatus('考点拓展')
      return
    }
    if (checkedIds.value.length >= 2) {
      setHints([{ keys: ['Enter'], label: '生成同型题' }])
      setStatus(`已勾 ${checkedIds.value.length} 个单词`)
      return
    }
    setHints([{ keys: ['Enter'], label: '生成同型题' }])
    setStatus(selectedId.value ? '已选错题，按 Enter 生成' : '请先选一道错题')
  },
  { immediate: true, deep: true }
)

onMounted(async () => {
  // 先问服务端 AI 能力是否可用：决定「AI 对话」入口提示可使用还是不可使用
  loadChatStatus()
  const errs = await errorBookApi.list().catch(() => null)
  // 只保留词汇/语法：AI 练习对听力错题没有对应的生成能力（见 MODULE_META 的说明）
  errors.value = (errs || []).filter((e) => e.status !== 1 && MODULE_META[e.module])
})

onUnmounted(clearHints)
</script>

<style scoped>
.ai-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 16px;
  align-items: start;
}

.pick-list {
  max-height: 460px;
  overflow-y: auto;
}

.pick-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px;
  border-radius: 9px;
  border: 1.5px solid transparent;
  background: var(--eq-surface-sunken);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.pick-item:hover {
  background: var(--eq-border-soft);
}
.pick-item.active {
  border-color: var(--eq-primary);
  background: var(--eq-primary-soft);
}
.pick-check {
  display: flex;
  align-items: center;
  padding-top: 2px;
  cursor: pointer;
}
.pick-check input {
  width: 15px;
  height: 15px;
  accent-color: var(--eq-primary);
  cursor: pointer;
}
.pick-stem {
  font-size: 13.5px;
  line-height: 1.55;
  flex: 1;
}

.pick-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.pick-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--eq-text-sub);
}

/* ---------- 单词串烧 ---------- */
.passage-title {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 8px;
}
.word-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.word-chip {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--eq-radius-pill);
  color: var(--eq-accent);
  background: var(--eq-primary-soft);
}
.passage-body {
  font-size: 14.5px;
  line-height: 1.9;
  white-space: pre-wrap;
  color: var(--eq-text);
}
.passage-trans {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--eq-border);
  font-size: 13px;
  line-height: 1.8;
  color: var(--eq-text-sub);
  white-space: pre-wrap;
}

/* ---------- 语法拓展 ---------- */
.expand-stem {
  font-size: 14px;
  line-height: 1.6;
  color: var(--eq-text-sub);
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--eq-surface-sunken);
  margin-bottom: 12px;
}
.expand-body {
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
  color: var(--eq-text);
}
.expand-analysis {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--eq-border);
  font-size: 13px;
  line-height: 1.75;
  color: var(--eq-text-sub);
}

.analysis-box {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--eq-border);
}
.analysis-head {
  font-size: 14px;
  margin-bottom: 8px;
}
.wrong-analysis {
  font-size: 13px;
  color: var(--eq-text-sub);
  background: var(--eq-surface-sunken);
  border-radius: 8px;
  padding: 11px;
  line-height: 1.7;
}

/* ---------- AI 对话入口 ---------- */
.ai-chat-entry {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: var(--eq-radius);
  border: 1.5px solid var(--eq-border);
  background: var(--eq-surface);
  color: var(--eq-text);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.ai-chat-entry:hover {
  border-color: var(--eq-primary);
  background: var(--eq-primary-soft);
}

/* 状态点：可用=绿，不可用=灰。入口本身不置灰，只靠这个点与文字表达状态 */
.ai-chat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--eq-text-mute);
  flex: none;
}
.ai-chat-dot.on {
  background: var(--eq-success);
}

.ai-chat-state {
  font-size: 12px;
  font-weight: 400;
  color: var(--eq-text-mute);
  padding-left: 8px;
  border-left: 1px solid var(--eq-border);
}
.ai-chat-entry:hover .ai-chat-state {
  color: var(--eq-accent);
}

/* ---------- AI 对话弹窗 ---------- */
.chat-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.chat-head-title {
  font-size: 15px;
  font-weight: 600;
}
.chat-head-sub {
  font-size: 12px;
  color: var(--eq-text-mute);
}

.chat-body {
  height: 340px;
  overflow-y: auto;
  padding: 4px 2px;
}

.chat-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
}
.chat-empty-title {
  font-size: 14px;
  font-weight: 500;
}
.chat-empty-sub {
  font-size: 12.5px;
  color: var(--eq-text-sub);
  margin-bottom: 8px;
}
.chat-samples {
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 100%;
}
.chat-sample {
  padding: 9px 12px;
  border-radius: var(--eq-radius-sm);
  border: 1px solid var(--eq-border);
  background: var(--eq-surface-sunken);
  color: var(--eq-text-sub);
  font-size: 12.5px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}
.chat-sample:hover {
  border-color: var(--eq-primary-line);
  background: var(--eq-primary-soft);
  color: var(--eq-accent);
}

.chat-row {
  display: flex;
  margin-bottom: 10px;
}
.chat-row.user {
  justify-content: flex-end;
}
.chat-bubble {
  max-width: 84%;
  padding: 9px 13px;
  border-radius: var(--eq-radius);
  font-size: 13.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}
.chat-row.user .chat-bubble {
  background: var(--eq-primary);
  color: #fff;
}
.chat-row.assistant .chat-bubble {
  background: var(--eq-surface-sunken);
  border: 1px solid var(--eq-border-soft);
  color: var(--eq-text);
}
.chat-typing {
  color: var(--eq-text-mute);
  font-style: normal;
}

.chat-input {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--eq-border-soft);
}
.chat-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.chat-quota {
  margin-right: auto;
  font-size: 12px;
  color: var(--eq-text-mute);
}

@media (max-width: 1024px) {
  .ai-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
