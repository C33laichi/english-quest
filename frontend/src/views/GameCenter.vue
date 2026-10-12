<template>
  <div class="page">
    <div class="hero">
      <div class="hero-row">
        <div>
          <div class="hero-name">Lv.{{ overview.level ?? 1 }} {{ overview.levelName || '' }}</div>
          <div class="hero-sub">
            总积分 {{ overview.totalPoints ?? 0 }} · 今日 {{ overview.todayPoints ?? 0 }}/{{ overview.dailyLimit ?? 200 }}
          </div>
        </div>
        <div class="chip gold" style="background:rgba(255,255,255,.22);color:#fff">
          连续 {{ overview.streakDays ?? 0 }} 天
        </div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><b>{{ overview.totalPoints ?? 0 }}</b><span>我的积分</span></div>
        <div class="hero-stat"><b>{{ overview.rankNo ?? '-' }}</b><span>当前排名</span></div>
        <div class="hero-stat"><b>{{ overview.streakDays ?? 0 }}</b><span>连续打卡</span></div>
      </div>
    </div>

    <div class="game-grid">
      <!-- ---------- 左栏 ---------- -->
      <div>
        <div class="card checkin-card">
          <div>
            <div class="card-title" style="margin-bottom:4px">每日打卡</div>
            <div class="muted">
              {{ overview.checkedToday ? `今天已打卡，已连续 ${overview.streakDays} 天` : '每天打卡 +5 积分，中断则连续天数归零' }}
            </div>
          </div>
          <el-button
            :type="overview.checkedToday ? 'info' : 'primary'"
            round
            :disabled="overview.checkedToday"
            :loading="checkinLoading"
            @click="doCheckin"
          >
            {{ overview.checkedToday ? '已打卡' : '立即打卡' }}
          </el-button>
        </div>

        <div class="card">
          <div class="card-title">
            <span>今日任务</span>
            <span class="muted" style="font-weight:400">
              {{ tasks.filter((t) => t.finished).length }}/{{ tasks.length }} 已完成
            </span>
          </div>
          <div v-for="t in tasks" :key="t.code" class="task-row">
            <div class="task-info">
              <div class="task-title">{{ t.title }}</div>
              <div class="task-bar">
                <div class="task-bar-inner" :style="{ width: taskPercent(t) + '%' }"></div>
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
              {{ t.claimed ? '已领取' : (t.finished ? '领 取' : '未完成') }}
            </el-button>
          </div>
          <div v-if="tasks.length === 0" class="empty" style="padding:20px">今日暂无任务</div>
        </div>

        <div class="card">
          <div class="card-title">积分规则</div>
          <div class="rule-grid">
            <div class="rule-item"><span>📝 答对一题</span><b>+2</b></div>
            <div class="rule-item"><span>🏅 通过关卡</span><b>+10</b></div>
            <div class="rule-item"><span>💯 关卡满分</span><b>+20</b></div>
            <div class="rule-item"><span>📅 每日首登</span><b>+5</b></div>
            <div class="rule-item"><span>🔥 每日打卡</span><b>+5</b></div>
            <div class="rule-item"><span>🎁 完成任务</span><b>见任务</b></div>
          </div>
          <div class="muted" style="margin-top:12px;font-size:12px">
            每日最多获得 {{ overview.dailyLimit ?? 200 }} 积分，答题类每日上限 100 分（防止刷分）
          </div>
        </div>
      </div>

      <!-- ---------- 右栏 ---------- -->
      <div>
        <div class="card">
          <div class="card-title">
            <span>排行榜</span>
            <el-radio-group v-model="rankType" size="small" @change="loadRank">
              <el-radio-button value="points">积分榜</el-radio-button>
              <el-radio-button value="streak">连续榜</el-radio-button>
            </el-radio-group>
          </div>
          <div v-loading="rankLoading">
            <div v-for="r in ranks" :key="r.userId" class="rank-row" :class="{ me: r.mine }">
              <div class="rank-no" :class="'top' + r.rank">{{ rankIcon(r.rank) }}</div>
              <div class="avatar">{{ (r.nickname || '?').slice(0, 1) }}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:600">
                  {{ r.nickname }}<span v-if="r.mine" class="chip" style="margin-left:6px">我</span>
                </div>
              </div>
              <div style="text-align:right">
                <b style="font-size:16px">{{ r.value }}</b>
                <span class="muted" style="font-size:11px;margin-left:2px">
                  {{ rankType === 'points' ? '积分' : '天' }}
                </span>
              </div>
            </div>
            <div v-if="!rankLoading && ranks.length === 0" class="empty" style="padding:20px">暂无排行数据</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { gameApi } from '@/api'

const overview = ref({})
const tasks = ref([])
const ranks = ref([])
const rankType = ref('points')
const checkinLoading = ref(false)
const rankLoading = ref(false)

function taskPercent(t) {
  if (!t.targetValue) return 0
  return Math.min(100, Math.round((t.progress / t.targetValue) * 100))
}

function rankIcon(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return rank
}

async function loadOverview() {
  const [ov, tk] = await Promise.allSettled([gameApi.overview(), gameApi.tasks()])
  if (ov.status === 'fulfilled') overview.value = ov.value || {}
  if (tk.status === 'fulfilled') tasks.value = tk.value || []
}

async function loadRank() {
  rankLoading.value = true
  try {
    ranks.value = (await gameApi.rank(rankType.value)) || []
  } finally {
    rankLoading.value = false
  }
}

async function doCheckin() {
  checkinLoading.value = true
  try {
    const res = await gameApi.checkin()
    ElMessage.success(`打卡成功，连续 ${res.streakDays} 天`)
    await Promise.all([loadOverview(), loadRank()])
  } finally {
    checkinLoading.value = false
  }
}

async function claimTask(t) {
  const res = await gameApi.claim(t.code)
  ElMessage.success(`领取成功，+${res.rewardPoints ?? t.rewardPoints} 积分`)
  await loadOverview()
}

onMounted(() => {
  loadOverview()
  loadRank()
})
</script>

<style scoped>
.game-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 16px;
  margin-top: 20px;
}

.rule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.rule-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--eq-surface-sunken);
  border-radius: 9px;
  padding: 9px 12px;
  font-size: 13px;
}
.rule-item b {
  color: var(--eq-accent);
  font-size: 13px;
}

.checkin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px dashed var(--eq-border);
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
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}
.task-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--eq-border-soft);
  overflow: hidden;
  margin-bottom: 4px;
}
.task-bar-inner {
  height: 100%;
  background: var(--eq-gradient);
  transition: width 0.3s;
}

@media (max-width: 1024px) {
  .game-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
