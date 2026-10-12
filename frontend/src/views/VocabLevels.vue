<template>
  <div class="page">
    <div class="hero">
      <div class="hero-row">
        <div>
          <div class="hero-name">词汇闯关</div>
          <div class="hero-sub">通过本关才解锁下一关，满分可得三星</div>
        </div>
        <div class="chip" style="background:rgba(255,255,255,.2);color:#fff">
          已通关 {{ passedCount }}/{{ levels.length }}
        </div>
      </div>
    </div>

    <div v-loading="loading" style="margin-top:20px">
      <div class="level-list">
        <div
          v-for="(lv, idx) in levels"
          :key="lv.id"
          class="level-item"
          :class="{ locked: lv.locked }"
          @click="enterLevel(lv)"
        >
          <div class="level-badge" :class="lv.passed ? 'done' : (lv.locked ? 'lock' : '')">
            {{ lv.locked ? '🔒' : (lv.passed ? '✓' : idx + 1) }}
          </div>
          <div class="level-info">
            <div class="level-name">{{ lv.name }}</div>
            <div class="muted" style="font-size:12px;margin-bottom:5px">
              {{ lv.description || '词汇量 ' + (lv.bankSize || 0) }}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="chip" :class="difficultyClass(lv.difficulty)">{{ difficultyLabel(lv.difficulty) }}</span>
              <span class="muted" style="font-size:12px">
                {{ lv.questionCount }} 题 / 及格 {{ lv.passScore }} 分
              </span>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="stars">{{ starText(lv.stars) }}</div>
            <div class="muted" style="font-size:12px;margin-top:4px">
              {{ lv.bestScore ? lv.bestScore + '分' : '未挑战' }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && levels.length === 0" class="empty">
        <span class="icon">📚</span>暂无词汇关卡数据
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { vocabApi } from '@/api'

const router = useRouter()
const levels = ref([])
const loading = ref(true)

const passedCount = computed(() => levels.value.filter((l) => l.passed).length)

function starText(stars) {
  const n = stars || 0
  return '★'.repeat(n) + '☆'.repeat(3 - n)
}

/**
 * 难度文案。库里的规范枚举是 BASIC / INTERMEDIATE / ADVANCED
 * （早期还写过 MEDIUM 和中文），这里统一收敛成三种中文标签。
 */
function difficultyLabel(d) {
  const map = {
    BASIC: '基础', INTERMEDIATE: '中等', ADVANCED: '进阶',
    MEDIUM: '中等', 简单: '基础', 中等: '中等', 困难: '进阶'
  }
  return map[d] || d || '—'
}

function difficultyClass(d) {
  const label = difficultyLabel(d)
  if (label === '基础') return 'green'
  if (label === '中等') return ''
  return 'gold'
}

function enterLevel(lv) {
  if (lv.locked) {
    ElMessage.warning('请先通过上一关')
    return
  }
  router.push(`/quiz/vocab/${lv.id}`)
}

onMounted(async () => {
  try {
    levels.value = (await vocabApi.levels()) || []
  } finally {
    loading.value = false
  }
})
</script>
