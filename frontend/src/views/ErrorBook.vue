<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">错题本</h2>
        <div class="page-desc">
          共 {{ list.length }} 道 · 重练答对后可标记为已掌握，掌握后不再计入待攻克
        </div>
      </div>
      <el-radio-group v-model="module" @change="load">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="VOCAB">词汇</el-radio-button>
        <el-radio-button value="GRAMMAR">语法</el-radio-button>
        <el-radio-button value="LISTENING">听力</el-radio-button>
      </el-radio-group>
    </div>

    <div v-loading="loading">
      <div class="error-list">
        <div v-for="item in list" :key="item.id" class="card error-card">
          <div class="error-head">
            <span class="chip" :class="moduleClass(item.module)">{{ moduleLabel(item.module) }}</span>
            <span class="chip gray">错 {{ item.wrongTimes }} 次</span>
            <span class="chip" :class="item.status === 1 ? 'green' : 'gray'">
              {{ item.status === 1 ? '已掌握' : '待攻克' }}
            </span>
            <button
              v-if="speakTextOf(item)"
              class="speak-btn"
              :class="{ on: activeSpeakId === item.id && speaking }"
              :title="activeSpeakId === item.id && speaking ? '停止朗读' : '朗读这道题的英文'"
              @click="toggleSpeak(item)"
            >
              {{ activeSpeakId === item.id && speaking ? '🔊' : '🔈' }}
            </button>
          </div>

          <div class="error-stem">{{ item.stem }}</div>

          <div class="muted" style="font-size:12px;margin-bottom:10px">
            知识点：{{ item.knowledgePoint || '未标注' }}
          </div>

          <div class="error-line">
            <span class="muted">上次错答：</span><span class="bad">{{ item.wrongAnswer || '-' }}</span>
          </div>
          <div class="error-line">
            <span class="muted">正确答案：</span><span class="good">{{ item.correctAnswer }}</span>
          </div>
          <div v-if="item.analysis" class="wrong-analysis">{{ item.analysis }}</div>

          <!-- 重练输入 -->
          <div v-if="retryId === item.id" class="retry-box">
            <el-input
              v-model="retryAnswer"
              :placeholder="retryPlaceholder(item)"
              @keyup.enter="doRetry(item)"
            />
            <div style="display:flex;gap:8px;margin-top:9px">
              <el-button type="primary" size="small" round :loading="retryLoading" @click="doRetry(item)">
                提交
              </el-button>
              <el-button size="small" round @click="retryId = null">取消</el-button>
            </div>
          </div>

          <div class="error-actions">
            <el-button size="small" round type="primary" plain @click="openRetry(item)">重练</el-button>
            <el-button size="small" round type="success" plain :disabled="item.status === 1" @click="markMaster(item)">
              标记已掌握
            </el-button>
            <el-button size="small" round type="danger" plain @click="removeItem(item)">移除</el-button>
          </div>
        </div>
      </div>

      <div v-if="!loading && list.length === 0" class="empty">
        <span class="icon">🎊</span>
        错题本是空的，继续保持！
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { errorBookApi } from '@/api'
import { useSpeech } from '@/composables/useSpeech'

const { supported, speak, speaking, stop } = useSpeech()

const list = ref([])
const module = ref('')
const loading = ref(true)
const retryId = ref(null)
const retryAnswer = ref('')
const retryLoading = ref(false)
/** 正在朗读的错题 id（只用于按钮态） */
const activeSpeakId = ref(null)

const MODULE_LABEL = { VOCAB: '词汇', GRAMMAR: '语法', LISTENING: '听力' }

function moduleLabel(m) {
  return MODULE_LABEL[m] || m
}

function moduleClass(m) {
  if (m === 'GRAMMAR') return 'gold'
  if (m === 'LISTENING') return 'green'
  return ''
}

const HAS_ZH = /[\u4e00-\u9fa5]/

/**
 * 这道题「该读什么」——按模块取，取不到英文就返回空串（按钮不渲染）。
 *
 * 错题记录里的字段并不都适合朗读：
 *  - 词汇：knowledgePoint 恰好就是那个单词，而 stem 带着中文释义
 *  - 听力：correctAnswer 是英文原句，而 stem 是中文翻译
 *  - 语法：stem 本身是英文句子，但空位写作 ______，不抹平会念出怪音
 */
function speakTextOf(item) {
  if (!item) return ''
  if (item.module === 'VOCAB') {
    const kp = (item.knowledgePoint || '').trim()
    if (kp && !HAS_ZH.test(kp)) return kp
    // 兜底：摘掉题干里的中文括注，剩下的确实是纯英文才读
    const en = String(item.stem || '').replace(/[（(][^）)]*[）)]/g, '').trim()
    return en && !HAS_ZH.test(en) ? en : ''
  }
  if (item.module === 'LISTENING') {
    return String(item.correctAnswer || '').trim()
  }
  const s = String(item.stem || '')
    .replace(/_{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s && !HAS_ZH.test(s) ? s : ''
}

/** 同一条再点一次 = 停止；点另一条 = 改读那一条 */
function toggleSpeak(item) {
  if (!supported) {
    ElMessage.warning('当前浏览器不支持语音朗读')
    return
  }
  if (activeSpeakId.value === item.id && speaking.value) {
    stop()
    activeSpeakId.value = null
    return
  }
  const text = speakTextOf(item)
  if (!text) return
  activeSpeakId.value = item.id
  speak(text)
}

// 自然读完或被系统打断后，按钮要自己回到「未播放」
watch(speaking, (v) => {
  if (!v) activeSpeakId.value = null
})

function retryPlaceholder(item) {
  if (item.module === 'LISTENING') return '重听并敲出完整句子（少一个词也算部分正确）'
  // 语法题一律要求填选项内容：ABCD 只是题面上的标记，写进答案毫无复习价值
  if (item.module === 'GRAMMAR') return '输入正确选项的内容（敲 A/B/C/D 也认）'
  return '输入正确拼写（选择题填 A/B/C/D）'
}

async function load() {
  loading.value = true
  try {
    list.value = (await errorBookApi.list(module.value || undefined)) || []
  } finally {
    loading.value = false
  }
}

function openRetry(item) {
  retryId.value = item.id
  retryAnswer.value = ''
}

async function doRetry(item) {
  if (!retryAnswer.value.trim()) {
    ElMessage.warning('请先输入答案')
    return
  }
  retryLoading.value = true
  try {
    const res = await errorBookApi.retry(item.id, retryAnswer.value.trim())
    if (res.correct) {
      ElMessage.success('答对了！可以标记为已掌握')
    } else {
      ElMessage.error(`答错了，正确答案是「${item.correctAnswer}」，再想想`)
    }
    retryId.value = null
    await load()
  } finally {
    retryLoading.value = false
  }
}

async function markMaster(item) {
  await errorBookApi.master(item.id)
  ElMessage.success('已标记为掌握')
  await load()
}

async function removeItem(item) {
  await ElMessageBox.confirm('确定从错题本中移除这道题吗？', '提示', {
    confirmButtonText: '移除',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await errorBookApi.remove(item.id)
  ElMessage.success('已移除')
  await load()
}

onMounted(load)
</script>

<style scoped>
.error-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 14px;
  align-items: start;
}

.error-card {
  padding: 18px;
  margin-bottom: 0;
}

.error-head {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

/* 朗读按钮：贴在卡片头部右侧。圆形轻边框，别和下方三个操作按钮抢视觉 */
.speak-btn {
  margin-left: auto;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--eq-border);
  background: transparent;
  color: var(--eq-text-sub);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: border-color var(--eq-dur) var(--eq-ease),
    background var(--eq-dur) var(--eq-ease), color var(--eq-dur) var(--eq-ease);
}
.speak-btn:hover {
  border-color: var(--eq-accent);
  color: var(--eq-accent);
}
.speak-btn.on {
  border-color: var(--eq-accent);
  background: var(--eq-primary-soft);
  color: var(--eq-accent);
}

.error-stem {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  margin-bottom: 6px;
}

.error-line {
  font-size: 13px;
  margin-bottom: 4px;
}
.error-line .bad {
  color: var(--eq-danger);
  font-family: var(--eq-mono);
}
.error-line .good {
  color: var(--eq-success);
  font-weight: 600;
  font-family: var(--eq-mono);
}

.wrong-analysis {
  font-size: 12.5px;
  color: var(--eq-text-sub);
  background: var(--eq-surface-sunken);
  border-radius: 8px;
  padding: 9px 12px;
  margin-top: 8px;
  line-height: 1.65;
}

.retry-box {
  margin-top: 13px;
  padding: 13px;
  background: var(--eq-surface-sunken);
  border-radius: 10px;
}

.error-actions {
  display: flex;
  gap: 8px;
  margin-top: 13px;
  padding-top: 13px;
  border-top: 1px dashed var(--eq-border);
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .error-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
