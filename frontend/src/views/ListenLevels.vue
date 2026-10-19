<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">🎧 听力听写</h2>
        <div class="page-desc">
          听英文发音，用键盘把整句敲出来。共 {{ levels.length }} 个关卡、{{ totalBank }} 句语料；通过本关才解锁下一关。
        </div>
      </div>
      <div class="head-chip-group">
        <span class="chip">已通过 {{ passedCount }}/{{ levels.length }}</span>
        <span v-if="lockedCount" class="chip gray">已解锁 {{ unlockedCount }}/{{ levels.length }}</span>
        <span class="chip gray">最高分 {{ bestScore }}</span>
      </div>
    </div>

    <!-- 模式说明 -->
    <div class="card mode-card">
      <div class="card-title">两种难度模式</div>
      <div class="mode-explain">
        <div class="mode-box easy">
          <div class="mode-box-head">
            <span class="mode-dot"></span>
            <b>简单模式</b>
            <span class="chip green">推荐入门</span>
          </div>
          <div class="muted">屏幕上会显示每个单词的长度，照着格子敲就行。</div>
          <div class="mode-demo">
            <span class="demo-block" style="width: 26px"></span>
            <span class="demo-block" style="width: 48px"></span>
            <span class="demo-block" style="width: 26px"></span>
            <span class="demo-block" style="width: 48px"></span>
          </div>
        </div>

        <div class="mode-box hard">
          <div class="mode-box-head">
            <span class="mode-dot"></span>
            <b>困难模式</b>
            <span class="chip gold">每题 +3 分</span>
          </div>
          <div class="muted">不显示任何长度信息，只有一条空线，完全靠耳朵。</div>
          <div class="mode-demo">
            <span class="demo-line"></span>
          </div>
        </div>
      </div>
      <div class="mode-tip">
        判分按<strong>单词</strong>逐个比对，大小写、标点、缩写撇号（don't / dont）都不算错；
        漏掉一个词也不会导致后面全部判错。
        <br />
        关卡<strong>逐关解锁</strong>：第 1 关默认开放，成绩达到及格分即可解锁下一关；已通过的关卡可随时回来重练刷分。
      </div>
    </div>

    <!-- 关卡列表 -->
    <div class="listen-grid">
      <div
        v-for="(lv, i) in levels"
        :key="lv.id"
        class="listen-card"
        :class="{ passed: lv.passed, locked: lv.locked }"
      >
        <div class="listen-top">
          <span class="listen-idx" :class="{ lock: lv.locked }">
            {{ lv.locked ? '🔒' : (lv.passed ? '✓' : i + 1) }}
          </span>
          <span class="chip" :class="difficultyClass(lv.difficulty)">{{ difficultyText(lv.difficulty) }}</span>
          <span v-if="lv.passed" class="chip green">已通过</span>
          <span v-else-if="lv.locked" class="chip gray">未解锁</span>
        </div>

        <div class="listen-name">{{ lv.name }}</div>
        <div class="listen-desc">{{ lv.description }}</div>

        <div class="listen-meta">
          <span>{{ lv.bankSize }} 句语料</span>
          <span>每次抽 {{ lv.questionCount }} 句</span>
          <span>及格 {{ lv.passScore }} 分</span>
        </div>

        <div class="listen-best">
          <div class="listen-best-bar">
            <div class="listen-best-inner" :style="{ width: (lv.bestScore || 0) + '%' }"></div>
          </div>
          <span class="muted">最高 {{ lv.bestScore || 0 }} 分</span>
        </div>

        <div v-if="lv.locked" class="listen-lock-tip">
          🔒 通过「{{ prevNameOf(i) }}」后解锁
        </div>

        <div class="listen-actions">
          <button class="mode-btn easy" :disabled="lv.locked" @click="start(lv, 'EASY')">
            <span class="mode-btn-name">简单模式</span>
            <span class="mode-btn-sub">有长度提示</span>
          </button>
          <button class="mode-btn hard" :disabled="lv.locked" @click="start(lv, 'HARD')">
            <span class="mode-btn-name">困难模式</span>
            <span class="mode-btn-sub">全靠听</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="!levels.length && !loading" class="empty">
      <span class="icon">🎧</span>暂无听力语料
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listenApi } from '@/api'
import { useHotkey } from '@/composables/useHotkey'
import { useKeyHints } from '@/composables/useKeyHints'

const router = useRouter()
const { setHints, setStatus, clearHints } = useKeyHints()

const levels = ref([])
const loading = ref(true)

const totalBank = computed(() => levels.value.reduce((s, l) => s + (l.bankSize || 0), 0))
const passedCount = computed(() => levels.value.filter((l) => l.passed).length)
const lockedCount = computed(() => levels.value.filter((l) => l.locked).length)
const unlockedCount = computed(() => levels.value.length - lockedCount.value)
const bestScore = computed(() =>
  levels.value.reduce((m, l) => Math.max(m, l.bestScore || 0), 0)
)

/** 锁定关卡的前置关卡名（按关卡顺序取上一关） */
function prevNameOf(i) {
  const prev = levels.value[i - 1]
  return prev ? prev.name : '上一关'
}

function difficultyText(d) {
  if (d === 'BASIC') return '入门'
  if (d === 'INTERMEDIATE') return '进阶'
  return '挑战'
}

function difficultyClass(d) {
  if (d === 'BASIC') return 'green'
  if (d === 'INTERMEDIATE') return 'gold'
  return 'gray'
}

function start(level, mode) {
  if (level.locked) {
    ElMessage.warning(`请先通过「${prevNameOf(levels.value.indexOf(level))}」再挑战本关`)
    return
  }
  router.push(`/listen/${level.id}/${mode}`)
}

/* 数字键 1~9 快速以「简单模式」开始第 N 关（锁定关卡提示解锁条件、不进入） */
const numberHandlers = {}
for (let i = 1; i <= 9; i++) {
  numberHandlers[String(i)] = () => {
    const lv = levels.value[i - 1]
    if (!lv) return false
    if (lv.locked) {
      ElMessage.warning(`请先通过「${prevNameOf(i - 1)}」再挑战本关`)
      return true
    }
    start(lv, 'EASY')
    return true
  }
}
useHotkey(numberHandlers)

async function load() {
  loading.value = true
  try {
    levels.value = (await listenApi.levels()) || []
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  setHints([
    { keys: ['1', '9'], label: '快速开始简单模式' },
    { keys: ['Shift', '?'], label: '全部快捷键' }
  ])
  await load()
  setStatus(`${levels.value.length} 个关卡 · 已解锁 ${unlockedCount.value} · ${totalBank.value} 句语料`)
})

onUnmounted(clearHints)
</script>

<style scoped>
.head-chip-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-card {
  background: var(--eq-surface);
}
.mode-explain {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.mode-box {
  border: 1px solid var(--eq-border);
  border-radius: 10px;
  padding: 16px 18px;
  background: var(--eq-surface);
}
.mode-box.easy {
  border-color: var(--eq-success-line);
  background: var(--eq-success-bg);
}
.mode-box.hard {
  border-color: var(--eq-warning-line);
  background: var(--eq-warning-bg);
}
.mode-box-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}
.mode-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--eq-text-sub);
}
.mode-box.easy .mode-dot {
  background: var(--eq-success);
}
.mode-box.hard .mode-dot {
  background: var(--eq-warning);
}
.mode-demo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  height: 22px;
}
.demo-block {
  height: 3px;
  border-radius: 2px;
  background: var(--eq-success);
  opacity: 0.55;
}
.demo-line {
  display: block;
  width: 190px;
  height: 3px;
  border-radius: 2px;
  background: var(--eq-warning);
  opacity: 0.55;
}
.mode-tip {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--eq-border);
  font-size: 12.5px;
  color: var(--eq-text-sub);
  line-height: 1.75;
}
.mode-tip strong {
  color: var(--eq-accent);
}

.listen-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.listen-card {
  background: var(--eq-surface);
  border: 1px solid var(--eq-border);
  border-radius: var(--eq-radius);
  box-shadow: var(--eq-shadow);
  padding: 18px;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.18s, transform 0.18s;
}
.listen-card:hover {
  box-shadow: var(--eq-shadow-md);
  transform: translateY(-2px);
}
.listen-card.passed {
  border-color: var(--eq-success-line);
}
.listen-card.locked {
  background: var(--eq-surface-sunken);
  opacity: 0.68;
}
.listen-card.locked:hover {
  transform: none;
  box-shadow: var(--eq-shadow);
}

.listen-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.listen-idx {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--eq-primary-soft);
  color: var(--eq-accent);
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.listen-idx.lock {
  background: var(--eq-border-soft);
  color: var(--eq-text-mute);
  font-size: 12px;
}

.listen-lock-tip {
  margin-bottom: 12px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--eq-surface);
  border: 1px dashed var(--eq-border);
  font-size: 12px;
  color: var(--eq-text-sub);
  line-height: 1.6;
}

.listen-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.1px;
}
.listen-desc {
  font-size: 12.5px;
  color: var(--eq-text-sub);
  margin-top: 5px;
  line-height: 1.65;
  min-height: 40px;
}

.listen-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 12px;
  color: var(--eq-text-mute);
  margin: 12px 0 10px;
}

.listen-best {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.listen-best-bar {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: var(--eq-border-soft);
  overflow: hidden;
}
.listen-best-inner {
  height: 100%;
  border-radius: 3px;
  background: var(--eq-gradient);
  transition: width 0.4s;
}
.listen-best .muted {
  font-size: 11.5px;
  white-space: nowrap;
}

.listen-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: auto;
}
.mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 9px 6px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: var(--eq-surface-sunken);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.mode-btn:hover {
  transform: translateY(-1px);
}
.mode-btn:focus-visible {
  outline: none;
  box-shadow: var(--eq-focus);
}
.mode-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.mode-btn-name {
  font-size: 13px;
  font-weight: 600;
}
.mode-btn-sub {
  font-size: 11px;
  color: var(--eq-text-sub);
}
.mode-btn.easy:hover {
  background: var(--eq-success-bg);
  border-color: var(--eq-success-line);
}
.mode-btn.easy .mode-btn-name {
  color: var(--eq-success);
}
.mode-btn.hard:hover {
  background: var(--eq-warning-bg);
  border-color: var(--eq-warning-line);
}
.mode-btn.hard .mode-btn-name {
  color: var(--eq-warning);
}

/*
 * 锁定关卡的禁用态要压掉上面 .mode-btn.easy/.hard 的配色。
 * 那两条规则与这里的 :disabled 版同特异性，只能靠源码顺序取胜，
 * 所以必须写在它们之后（写成 .mode-btn.easy:disabled 提高特异性更稳）。
 */
.mode-btn.easy:disabled,
.mode-btn.hard:disabled,
.mode-btn.easy:disabled:hover,
.mode-btn.hard:disabled:hover {
  background: var(--eq-surface);
  border-color: transparent;
  transform: none;
}
.mode-btn.easy:disabled .mode-btn-name,
.mode-btn.hard:disabled .mode-btn-name,
.mode-btn.easy:disabled .mode-btn-sub,
.mode-btn.hard:disabled .mode-btn-sub {
  color: var(--eq-text-mute);
}

@media (max-width: 1100px) {
  .listen-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .listen-grid,
  .mode-explain {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
