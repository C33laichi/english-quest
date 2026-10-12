<template>
  <div class="page">
    <!-- 顶部横幅：等级 / 积分 / 连续打卡 -->
    <section class="hero">
      <div class="hero-main">
        <div class="hero-row">
          <div>
            <div class="hero-name">Hi，{{ userStore.displayName || '同学' }}</div>
            <div class="hero-sub">
              <span class="hero-level">
                Lv.{{ overview.level ?? 1 }} {{ overview.levelName || '' }}
              </span>
              <!--
                等级说明入口：悬浮出 6 级清单。
                等级表由后端随概览一起下发（PointService 的 LEVEL_THRESHOLD/LEVEL_NAME），
                前端不再抄一份 —— 门槛一改，提示文案必须跟着改，抄一份必然对不上。
                用 el-tooltip 而不是自己写悬浮层：.hero 有 overflow:hidden，
                组件内自绘的浮层会被裁掉，而 tooltip 会被 teleport 到 body。
              -->
              <el-tooltip placement="bottom-start" :show-after="60" popper-class="level-tip-popper">
                <span class="level-help" tabindex="0" aria-label="等级说明">?</span>
                <template #content>
                  <div class="level-tip">
                    <div class="level-tip-head">等级名称与所需积分</div>
                    <div
                      v-for="lv in levels"
                      :key="lv.level"
                      class="level-tip-row"
                      :class="{ current: lv.level === (overview.level ?? 1) }"
                    >
                      <span>Lv.{{ lv.level }} {{ lv.name }}</span>
                      <b>{{ lv.minPoints }} 分</b>
                    </div>
                  </div>
                </template>
              </el-tooltip>
              <span class="hero-dot">·</span>
              <span>今日已得 {{ overview.todayPoints ?? 0 }} 分</span>
            </div>
          </div>
        </div>

        <div class="level-progress">
          <div class="level-progress-bar">
            <div class="level-progress-inner" :style="{ width: levelPercent + '%' }"></div>
          </div>
          <div class="level-progress-text">
            <span v-if="isMaxLevel">已达到最高等级</span>
            <span v-else>距下一级还差 {{ nextGap }} 分</span>
            <span v-if="!isMaxLevel">
              {{ overview.currentLevelPoints ?? 0 }} / {{ overview.nextLevelPoints ?? 0 }}
            </span>
          </div>
        </div>
      </div>

      <div class="hero-stats">
        <div class="hero-stat">
          <b>{{ overview.totalPoints ?? 0 }}</b>
          <span>总积分</span>
        </div>
        <div class="hero-stat">
          <b>{{ overview.streakDays ?? 0 }}</b>
          <span>连续天数</span>
        </div>
        <div class="hero-stat">
          <b>{{ overview.rankNo ?? '-' }}</b>
          <span>排名</span>
        </div>
      </div>
    </section>

    <div class="home-grid">
      <!-- ---------- 主栏 ---------- -->
      <div>
        <div class="card checkin-card">
          <div>
            <div class="card-title" style="margin-bottom:4px">每日打卡</div>
            <div class="muted">
              {{ overview.checkedToday ? `已打卡，连续 ${overview.streakDays} 天，继续保持！` : '打卡 +5 积分，别断了连续记录' }}
            </div>
          </div>
          <el-button
            :type="overview.checkedToday ? 'info' : 'primary'"
            round
            :disabled="overview.checkedToday"
            :loading="checkinLoading"
            @click="doCheckin"
          >
            {{ overview.checkedToday ? '已打卡' : '打卡' }}
          </el-button>
        </div>

        <div class="entry-grid">
          <div class="entry-card entry-card--lead" @click="router.push('/vocab')">
            <div class="entry-head">
              <span class="entry-icon">📚</span>
              <span class="entry-title">词汇闯关</span>
            </div>
            <div class="entry-figure">
              <b>{{ vocabPassed }}</b><i>/6</i>
            </div>
            <div class="entry-foot">
              <div class="entry-line">
                <span :style="{ width: (vocabPassed / 6) * 100 + '%' }"></span>
              </div>
              <span class="entry-sub">关已通关</span>
            </div>
          </div>

          <div class="entry-card" @click="router.push('/grammar')">
            <div class="entry-head">
              <span class="entry-icon">🧭</span>
              <span class="entry-title">28 天语法</span>
            </div>
            <div class="entry-figure">
              <b>{{ grammarPassed }}</b><i>/28</i>
            </div>
            <div class="entry-foot">
              <div class="entry-line">
                <span :style="{ width: (grammarPassed / 28) * 100 + '%' }"></span>
              </div>
              <span class="entry-sub">天已通过</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">
            <span>今日任务</span>
            <span class="muted" style="font-weight:400">完成 {{ doneTaskCount }}/{{ tasks.length }}</span>
          </div>
          <div v-for="t in tasks" :key="t.code" class="task-row">
            <div class="task-info">
              <div class="task-title">{{ t.title }}</div>
              <div class="task-bar">
                <div
                  class="task-bar-inner"
                  :style="{ width: Math.min(100, (t.progress / t.targetValue) * 100) + '%' }"
                ></div>
              </div>
              <div class="muted" style="font-size:12px">
                {{ Math.min(t.progress, t.targetValue) }}/{{ t.targetValue }} · 奖励 {{ t.rewardPoints }} 积分
              </div>
            </div>
            <el-button
              size="small"
              round
              :type="t.claimed ? 'info' : (t.finished ? 'primary' : 'default')"
              :disabled="t.claimed || !t.finished"
              @click="claimTask(t)"
            >
              {{ t.claimed ? '已领' : (t.finished ? '领取' : '未完成') }}
            </el-button>
          </div>
          <div v-if="!tasks.length && !loading" class="empty" style="padding:20px">暂无今日任务</div>
        </div>
      </div>

      <!-- ---------- 侧栏 ---------- -->
      <div>
        <div class="card">
          <div class="card-title">学习工具</div>
          <div class="quick-grid">
            <div class="quick-item" @click="router.push('/error-book')">
              <span class="quick-icon">📕</span><span>错题本</span>
              <em v-if="errorCount > 0">{{ errorCount }}</em>
            </div>
            <div class="quick-item" @click="router.push('/ai')">
              <span class="quick-icon">🤖</span><span>AI 同型题</span>
            </div>
            <div class="quick-item" @click="router.push('/stats')">
              <span class="quick-icon">📊</span><span>学习看板</span>
            </div>
            <div class="quick-item" @click="router.push('/profile')">
              <span class="quick-icon">⚙️</span><span>个人中心</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">积分规则</div>
          <div class="rule-row"><span>答对一题</span><b>+2</b></div>
          <div class="rule-row"><span>通过关卡</span><b>+10</b></div>
          <div class="rule-row"><span>单关满分</span><b>+20</b></div>
          <div class="rule-row"><span>每日首次登录</span><b>+5</b></div>
          <div class="rule-row"><span>每日打卡</span><b>+5</b></div>
          <div class="muted" style="font-size:12px;margin-top:10px">每日积分上限 200，答题类上限 100</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { gameApi, vocabApi, grammarApi, listenApi, errorBookApi } from '@/api'
import { useUserStore } from '@/store/user'

const router = useRouter()
const userStore = useUserStore()

const overview = ref({})
const tasks = ref([])
const vocabPassed = ref(0)
const grammarPassed = ref(0)
const listenPassed = ref(0)
const errorCount = ref(0)
const checkinLoading = ref(false)
const loading = ref(true)

/** 等级清单（后端下发，用于等级悬浮说明） */
const levels = computed(() => overview.value.levels || [])

/*
 * 等级进度：后端下发的是「本段已得 / 本段所需」，两个数同分母，
 * 所以直接相除就是进度、相减就是还差多少。
 * 满级时 nextLevelPoints = -1（没有下一级）→ 进度按 100% 处理且不显示差值。
 */
const isMaxLevel = computed(() => (overview.value.nextLevelPoints ?? 0) < 0)

const levelPercent = computed(() => {
  const cur = overview.value.currentLevelPoints ?? 0
  const need = overview.value.nextLevelPoints ?? 0
  if (need <= 0) return 100
  return Math.min(100, Math.round((cur / need) * 100))
})

const nextGap = computed(() => {
  const cur = overview.value.currentLevelPoints ?? 0
  const need = overview.value.nextLevelPoints ?? 0
  return need > 0 ? Math.max(0, need - cur) : 0
})

const doneTaskCount = computed(() => tasks.value.filter((t) => t.finished).length)

async function loadAll() {
  const [ov, tk, vocab, grammar, err] = await Promise.allSettled([
    gameApi.overview(),
    gameApi.tasks(),
    vocabApi.levels(),
    grammarApi.lessons(),
    errorBookApi.count()
  ])
  if (ov.status === 'fulfilled') overview.value = ov.value || {}
  if (tk.status === 'fulfilled') tasks.value = tk.value || []
  if (vocab.status === 'fulfilled') vocabPassed.value = (vocab.value || []).filter((l) => l.passed).length
  if (grammar.status === 'fulfilled') grammarPassed.value = (grammar.value || []).filter((l) => l.passed).length
  if (err.status === 'fulfilled') errorCount.value = err.value?.unmastered ?? 0
  loading.value = false
}

async function doCheckin() {
  checkinLoading.value = true
  try {
    const res = await gameApi.checkin()
    ElMessage.success(`打卡成功，+${res.gainPoints ?? 5} 积分，连续 ${res.streakDays} 天`)
    await loadAll()
  } finally {
    checkinLoading.value = false
  }
}

async function claimTask(t) {
  const res = await gameApi.claim(t.code)
  ElMessage.success(`领取成功，+${res.rewardPoints ?? t.rewardPoints} 积分`)
  await loadAll()
}

onMounted(loadAll)
</script>

<style scoped>
/*
 * 首页：主栏承载「今日要做的事」，侧栏承载「工具与规则」。
 * 两栏比例刻意不取 1fr / 1fr —— 等分栏会让视线没有落点。
 */
.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.62fr) minmax(0, 1fr);
  gap: 18px;
  margin-top: 18px;
  align-items: start;
}

/* ---------- 顶部横幅 ---------- */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 28px;
  align-items: end;
  padding: 22px 24px;
  border-radius: var(--eq-radius);
  /* 底色/字色/描边全部走 --eq-hero-*：浅色主题下是淡强调底 + 深字，
     深色主题下才是原来的深炭底 + 白字。
     以前这里写死 var(--eq-side) 和 color:#fff，切到白天会留一整块黑。 */
  background: var(--eq-hero-bg);
  color: var(--eq-hero-text);
  /* 描边两套主题都占 1px（深色下透明），这样切换主题时盒子尺寸不跳 */
  border: 1px solid var(--eq-hero-border);
  position: relative;
  overflow: hidden;
}
/* 单侧同色相光晕，替代原先的整块紫渐变。
   光晕强度也按主题分档：浅底上必须很淡，否则会糊成一块脏紫。 */
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(520px 240px at 88% 118%, var(--eq-hero-glow-a), transparent 68%),
    radial-gradient(360px 200px at 4% -30%, var(--eq-hero-glow-b), transparent 70%);
  pointer-events: none;
}
.hero > * {
  position: relative;
  z-index: var(--z-base);
}

.hero-name {
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.015em;
}
.hero-sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0 5px;
  font-size: 12.5px;
  color: var(--eq-hero-sub);
  margin-top: 3px;
}
.hero-dot {
  opacity: 0.6;
}

/* 等级说明的问号徽标：小圆形，颜色跟着横幅的次级字色走 */
.level-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1;
  cursor: help;
  user-select: none;
  opacity: 0.7;
  transition: opacity var(--eq-dur) var(--eq-ease);
}
.level-help:hover,
.level-help:focus-visible {
  opacity: 1;
  outline: none;
  box-shadow: var(--eq-focus);
}

.level-progress {
  margin-top: 20px;
}
.level-progress-bar {
  height: 5px;
  border-radius: var(--eq-radius-pill);
  background: var(--eq-hero-track);
  overflow: hidden;
}
.level-progress-inner {
  height: 100%;
  border-radius: var(--eq-radius-pill);
  background: var(--eq-primary-bright);
  transition: width var(--eq-dur) var(--eq-ease);
}
.level-progress-text {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--eq-hero-sub);
  margin-top: 7px;
}

/* 三个数据点用细竖分隔，不做成三张并排卡片 */
.hero-stats {
  display: flex;
  align-items: flex-end;
  gap: 0;
  padding-bottom: 2px;
  margin-top: 0;
  flex-shrink: 0;
}
.hero-stat {
  /*
   * 三处都要显式压掉全局 .hero-stat（global.css §四）：
   *   1. 它有 background: rgba(255,255,255,.15) —— 那是给渐变横幅上的页面用的，
   *      会在这里叠出三层灰方块，和"细竖分隔"打架；
   *   2. 它 flex:1 + max-width:160px，会把三格拉成不等宽；
   *   3. 不设下限时，padding 吃掉宽度会让「连续天数」这类长标签溢出。
   * 另外把对齐从 right 改成 center：数值是个位数时贴右边缘，
   * 会看着和下方标签对不上（本次用户反馈的第 2 条）。
   */
  background: none;
  flex: 0 0 auto;
  min-width: 96px;
  max-width: none;
  padding: 0 18px;
  border-left: 1px solid var(--eq-hero-line);
  text-align: center;
}
.hero-stat:first-child {
  border-left: none;
}
.hero-stat b {
  display: block;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--eq-hero-text);
  font-variant-numeric: tabular-nums;
}
.hero-stat span {
  font-size: 11.5px;
  color: var(--eq-hero-sub);
  white-space: nowrap;
}

.checkin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

/* ---------- 进度条（任务 / 入口卡共用口径） ---------- */
.task-bar,
.entry-line {
  height: 4px;
  border-radius: var(--eq-radius-pill);
  background: var(--eq-border-soft);
  overflow: hidden;
}
.task-bar-inner,
.entry-line span {
  display: block;
  height: 100%;
  border-radius: var(--eq-radius-pill);
  background: var(--eq-primary);
  transition: width var(--eq-dur) var(--eq-ease);
}

.task-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 0;
  border-bottom: 1px solid var(--eq-border-soft);
}
.task-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.task-info {
  flex: 1;
  min-width: 0;
}
.task-title {
  font-size: 13.5px;
  font-weight: 500;
  margin-bottom: 7px;
}
.task-bar {
  margin-bottom: 5px;
}

/*
 * 入口卡：非对称双栏。
 * 词汇是主线（6 关、可快速通关），给它更大的视觉面积；
 * 语法是长线（28 天），做成次级密度。
 */
.entry-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}
.entry-card {
  border-radius: var(--eq-radius);
  padding: 18px;
  cursor: pointer;
  background: var(--eq-surface);
  border: 1px solid var(--eq-border-soft);
  transition: border-color var(--eq-dur) var(--eq-ease),
    transform var(--eq-dur) var(--eq-ease);
}
.entry-card:hover {
  border-color: var(--eq-line);
  transform: translateY(-1px);
}
.entry-card:active {
  transform: translateY(0);
}
/* 主线卡：用强调色底区分层级，而不是第二套渐变 */
.entry-card--lead {
  background: var(--eq-primary-soft);
  border-color: var(--eq-primary-line);
}
.entry-card--lead:hover {
  border-color: var(--eq-primary);
}

.entry-head {
  display: flex;
  align-items: center;
  gap: 9px;
}
.entry-icon {
  font-size: 17px;
  line-height: 1;
}
.entry-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--eq-text-sub);
}

.entry-figure {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin: 14px 0 12px;
}
.entry-figure b {
  font-size: 32px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--eq-text);
  font-variant-numeric: tabular-nums;
}
.entry-figure i {
  font-size: 14px;
  font-style: normal;
  color: var(--eq-text-mute);
  line-height: 1;
}
.entry-card--lead .entry-figure b {
  color: var(--eq-accent);
}

.entry-foot {
  display: flex;
  align-items: center;
  gap: 10px;
}
.entry-line {
  flex: 1;
  min-width: 0;
}
.entry-card--lead .entry-line {
  background: rgba(79, 70, 229, 0.16);
}
.entry-sub {
  font-size: 11.5px;
  color: var(--eq-text-mute);
  white-space: nowrap;
}

/* ---------- 侧栏：学习工具 ---------- */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.quick-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
  border-radius: var(--eq-radius-sm);
  border: 1px solid var(--eq-border-soft);
  font-size: 12.5px;
  cursor: pointer;
  transition: border-color var(--eq-dur) var(--eq-ease),
    background var(--eq-dur) var(--eq-ease);
}
.quick-item:hover {
  border-color: var(--eq-line);
  background: var(--eq-surface-sunken);
}
.quick-icon {
  font-size: 15px;
  line-height: 1;
}
.quick-item em {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  background: var(--eq-danger);
  color: #fff;
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
  line-height: 1.5;
  border-radius: var(--eq-radius-pill);
  padding: 0 6px;
  font-variant-numeric: tabular-nums;
}

.rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 12.5px;
  border-bottom: 1px solid var(--eq-border-soft);
  color: var(--eq-text-sub);
}
.rule-row:last-of-type {
  border-bottom: none;
}
.rule-row b {
  color: var(--eq-accent);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1024px) {
  .home-grid,
  .hero {
    grid-template-columns: minmax(0, 1fr);
  }
  .hero-stats {
    justify-content: flex-start;
  }
  .hero-stat:first-child {
    padding-left: 0;
  }
}
@media (max-width: 640px) {
  .entry-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
