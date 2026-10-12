<template>
  <div class="page">
    <div class="hero">
      <div class="hero-row">
        <div>
          <div class="hero-name">28 天语法路线</div>
          <div class="hero-sub">按日解锁，通过第 N 天才能进入第 N+1 天</div>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat"><b>{{ passedCount }}</b><span>已通过</span></div>
        <div class="hero-stat"><b>{{ starTotal }}</b><span>累计星星</span></div>
        <div class="hero-stat"><b>{{ progressPercent }}%</b><span>完成度</span></div>
      </div>
    </div>

    <div v-loading="loading" style="margin-top:20px">
      <!-- 按阶段分组 -->
      <div v-for="group in grouped" :key="group.stage" class="stage-block">
        <div class="stage-head">
          <span class="stage-dot"></span>
          <span class="stage-title">{{ group.stage }}</span>
          <span class="muted" style="font-size:12px">{{ group.passedInGroup }}/{{ group.items.length }}</span>
        </div>

        <div class="level-list">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="level-item"
            :class="{ locked: item.locked }"
            @click="enter(item)"
          >
            <div class="level-badge" :class="item.passed ? 'done' : (item.locked ? 'lock' : '')">
              {{ item.locked ? '🔒' : (item.passed ? '✓' : 'D' + item.dayNo) }}
            </div>
            <div class="level-info">
              <div class="level-name">Day {{ item.dayNo }} · {{ item.title }}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                <span class="chip" :class="modeClass(item.mode)">{{ item.mode }}</span>
                <span class="muted" style="font-size:12px">{{ item.questionCount }} 题 / 及格 {{ item.passScore }} 分</span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div class="stars">{{ starText(item.stars) }}</div>
              <div class="muted" style="font-size:12px;margin-top:4px">
                {{ item.bestScore ? item.bestScore + '分' : '未挑战' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && lessons.length === 0" class="empty">
        <span class="icon">🧭</span>暂无法关卡数据
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { grammarApi } from '@/api'

const router = useRouter()
const lessons = ref([])
const loading = ref(true)

const passedCount = computed(() => lessons.value.filter((l) => l.passed).length)
const starTotal = computed(() => lessons.value.reduce((s, l) => s + (l.stars || 0), 0))
const progressPercent = computed(() =>
  lessons.value.length ? Math.round((passedCount.value / lessons.value.length) * 100) : 0
)

/** 保持后端返回的天数顺序，按 stage 连续分组 */
const grouped = computed(() => {
  const groups = []
  let cur = null
  for (const item of lessons.value) {
    if (!cur || cur.stage !== item.stage) {
      cur = { stage: item.stage, items: [], passedInGroup: 0 }
      groups.push(cur)
    }
    cur.items.push(item)
    if (item.passed) cur.passedInGroup++
  }
  return groups
})

function starText(stars) {
  const n = stars || 0
  return '★'.repeat(n) + '☆'.repeat(3 - n)
}

function modeClass(mode) {
  if (mode === '学习') return ''
  if (mode === '复习') return 'green'
  return 'gold'
}

function enter(item) {
  if (item.locked) {
    ElMessage.warning(`请先通过第 ${item.dayNo - 1} 天的关卡`)
    return
  }
  router.push(`/lesson/${item.dayNo}`)
}

onMounted(async () => {
  try {
    lessons.value = (await grammarApi.lessons()) || []
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.stage-block {
  margin-bottom: 24px;
}
.stage-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 2px;
}
.stage-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--eq-gradient);
}
.stage-title {
  font-size: 14px;
  font-weight: 700;
  flex: 1;
}
</style>
