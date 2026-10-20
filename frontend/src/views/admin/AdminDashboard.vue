<template>
  <div v-loading="loading">
    <div class="stat-grid">
      <div class="stat-card">
        <span class="muted">注册用户</span>
        <b>{{ stats.userCount ?? 0 }}</b>
      </div>
      <div class="stat-card">
        <span class="muted">今日活跃</span>
        <b style="color:var(--eq-success)">{{ stats.activeToday ?? 0 }}</b>
      </div>
      <div class="stat-card">
        <span class="muted">题库总量</span>
        <b>{{ stats.questionCount ?? 0 }}</b>
      </div>
      <div class="stat-card">
        <span class="muted">累计答题</span>
        <b>{{ stats.answerCount ?? 0 }}</b>
      </div>
      <div class="stat-card">
        <span class="muted">今日答题</span>
        <b style="color:var(--eq-warning)">{{ stats.todayAnswerCount ?? 0 }}</b>
      </div>
      <div class="stat-card">
        <span class="muted">AI 调用次数</span>
        <b>{{ stats.aiCallCount ?? 0 }}</b>
      </div>
    </div>

    <div class="two-col">
      <div class="card" style="margin-bottom:0">
        <div class="card-title">内容资源</div>
        <div class="res-row">
          <span>词汇关卡</span>
          <b>{{ stats.vocabLevelCount ?? 0 }} 关</b>
        </div>
        <div class="res-row">
          <span>语法关卡</span>
          <b>{{ stats.grammarLessonCount ?? 0 }} 天</b>
        </div>
        <div class="res-row">
          <span>词汇题目</span>
          <b>{{ stats.vocabQuestionCount ?? 0 }} 题</b>
        </div>
        <div class="res-row" style="border-bottom:none">
          <span>语法题目</span>
          <b>{{ stats.grammarQuestionCount ?? 0 }} 题</b>
        </div>
      </div>

      <div class="card" style="margin-bottom:0">
        <div class="card-title">系统说明</div>
        <div class="muted" style="line-height:2;font-size:13px">
          技术栈：Spring Boot 3.5 + MyBatis-Plus + MySQL 8 / Vue 3 + Element Plus<br />
          鉴权方式：JWT 无状态令牌（有效期 7 天）<br />
          积分引擎：每日上限 200 分，答题类上限 100 分<br />
          AI 出题：Mock 本地题库 / 大模型双通道，按日限流
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminApi } from '@/api'

const stats = ref({})
const loading = ref(true)

onMounted(async () => {
  try {
    stats.value = (await adminApi.stats()) || {}
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.two-col {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 16px;
}
@media (max-width: 900px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}
.res-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px dashed var(--eq-border);
  font-size: 14px;
}
.res-row b {
  color: var(--eq-accent);
}
</style>
