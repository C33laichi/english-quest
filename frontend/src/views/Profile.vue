<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">个人中心</h2>
        <div class="page-desc">账号信息、学习数据与安全设置</div>
      </div>
      <el-button class="btn-ghost" @click="doLogout">退出登录</el-button>
    </div>

    <div class="profile-grid">
      <!-- ---------- 左栏 ---------- -->
      <div>
        <div class="card profile-card">
          <div class="avatar" style="width:56px;height:56px;font-size:22px">
            {{ (form.nickname || userStore.user?.username || '?').slice(0, 1) }}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:17px;font-weight:700">
              {{ form.nickname || userStore.user?.username }}
            </div>
            <div class="muted" style="font-size:12px;margin-top:4px">
              @{{ userStore.user?.username }}
              <span class="chip" :class="userStore.isAdmin ? 'gold' : 'gray'" style="margin-left:6px">
                {{ userStore.isAdmin ? '管理员' : '学生' }}
              </span>
            </div>
          </div>
        </div>

        <div class="stat-grid4">
          <!-- 点「总积分」打开明细：数字旁边就要有「可以点」的暗示，否则没人会点 -->
          <div class="mini-stat stat-clickable" role="button" tabindex="0" @click="openLogs">
            <div class="mini-val">{{ userStore.user?.totalPoints ?? 0 }}</div>
            <div class="mini-label">总积分 <span class="mini-more">明细 ›</span></div>
          </div>
          <div class="mini-stat">
            <div class="mini-val">{{ userStore.user?.streakDays ?? 0 }}</div>
            <div class="mini-label">连续天数</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">修改资料</div>
          <el-form label-position="top">
            <el-form-item label="昵称">
              <el-input
                v-model="form.nickname"
                placeholder="给自己起个昵称"
                maxlength="20"
                show-word-limit
                clearable
              />
            </el-form-item>
          </el-form>
          <div class="btn-row">
            <el-button class="btn-primary" :loading="saving" @click="saveProfile">保存资料</el-button>
          </div>
        </div>

        <div v-if="userStore.isAdmin" class="card admin-entry-card" @click="router.push('/admin/dashboard')">
          <span>🛠 进入管理后台</span>
          <span class="muted">→</span>
        </div>
      </div>

      <!-- ---------- 右栏 ---------- -->
      <div>
        <div class="card">
          <div class="card-title">修改密码</div>
          <el-form :model="pwdForm" :rules="pwdRules" ref="pwdRef" label-position="top">
            <el-form-item label="原密码" prop="oldPassword">
              <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入原密码" />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="6-20 位" />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirm">
              <el-input v-model="pwdForm.confirm" type="password" show-password placeholder="再次输入新密码" />
            </el-form-item>
          </el-form>
          <div class="btn-row">
            <el-button class="btn-primary" :loading="pwdSaving" @click="savePassword">修改密码</el-button>
          </div>
        </div>

      </div>
    </div>

    <!--
      「关于」不再占一张卡片：它是版权信息，不是需要操作的功能块，
      放在右栏中部会和「修改密码」争夺注意力。改为页面最底部的低透明度页脚。
    -->
    <div class="about-foot">
      英语闯关 v1.0 · 毕业设计作品 · 技术栈 Spring Boot 3 + Vue 3 + MySQL
      <br />
      湖南网络工程职业学院 · 信息工程学院
    </div>

    <!--
      积分明细抽屉。
      学生看到「总积分」和心里预期不一致时，需要能查到每一笔的来源 ——
      只给一个总数、不给账目，任何加减分都会显得像凭空发生的。
    -->
    <el-drawer v-model="logsVisible" title="积分明细" size="420px" append-to-body>
      <div v-loading="logsLoading" class="log-body">
        <div v-if="logs.length" class="log-sum">
          最近 <b>{{ logs.length }}</b> 笔共
          <b>{{ logsSum > 0 ? '+' : '' }}{{ logsSum }}</b> 分
        </div>

        <div v-for="l in logs" :key="l.id" class="log-row">
          <div class="log-main">
            <span class="chip gray log-type">{{ l.typeName }}</span>
            <span class="log-remark">{{ l.remark || '—' }}</span>
          </div>
          <div class="log-side">
            <b class="log-delta" :class="{ minus: l.changePoints < 0 }">
              {{ l.changePoints > 0 ? '+' : '' }}{{ l.changePoints }}
            </b>
            <span class="log-time">{{ l.createTime }}</span>
          </div>
        </div>

        <div v-if="!logsLoading && !logs.length" class="muted" style="padding:24px 0;text-align:center">
          还没有积分记录，去答几道题吧
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { authApi, gameApi } from '@/api'
import { useUserStore } from '@/store/user'

const router = useRouter()
const userStore = useUserStore()

const form = reactive({ nickname: '', avatar: '' })
const saving = ref(false)

/* ---------------- 积分明细 ---------------- */
const logsVisible = ref(false)
const logsLoading = ref(false)
const logs = ref([])

/** 当前列出这几笔的合计。只统计已加载的部分，标题里写清是「最近 N 笔」，不冒充总分 */
const logsSum = computed(() => logs.value.reduce((s, l) => s + (l.changePoints || 0), 0))

async function openLogs() {
  logsVisible.value = true
  logsLoading.value = true
  try {
    logs.value = (await gameApi.pointLogs(50)) || []
  } catch (e) {
    logs.value = []
    ElMessage.error('积分明细加载失败')
  } finally {
    logsLoading.value = false
  }
}

const pwdRef = ref()
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const pwdSaving = ref(false)

const pwdRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度 6-20 位', trigger: 'blur' }
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, cb) => {
        if (value !== pwdForm.newPassword) cb(new Error('两次输入的密码不一致'))
        else cb()
      },
      trigger: 'blur'
    }
  ]
}

async function saveProfile() {
  saving.value = true
  try {
    const u = await authApi.updateProfile({ nickname: form.nickname, avatar: form.avatar })
    userStore.setUser(u)
    ElMessage.success('资料已保存')
  } finally {
    saving.value = false
  }
}

async function savePassword() {
  // 校验失败会 reject，接住避免未处理异常
  try {
    await pwdRef.value.validate()
  } catch (e) {
    return
  }
  pwdSaving.value = true
  try {
    await authApi.updatePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword
    })
    ElMessage.success('密码修改成功，请重新登录')
    pwdForm.oldPassword = pwdForm.newPassword = pwdForm.confirm = ''
    await userStore.logout()
    router.replace('/login')
  } finally {
    pwdSaving.value = false
  }
}

async function doLogout() {
  try {
    await ElMessageBox.confirm('确定退出登录吗？', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch (e) {
    return
  }
  await userStore.logout()
  router.replace('/login')
}

onMounted(async () => {
  form.nickname = userStore.user?.nickname || ''
  form.avatar = userStore.user?.avatar || ''
  try {
    await userStore.refresh()
    form.nickname = userStore.user?.nickname || form.nickname
  } catch (e) {
    /* 刷新失败沿用本地缓存 */
  }
})
</script>

<style scoped>
.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stat-grid4 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 16px;
}

.mini-stat {
  background: var(--eq-surface);
  border: 1px solid var(--eq-border);
  border-radius: var(--eq-radius);
  padding: 16px 10px;
  text-align: center;
  box-shadow: var(--eq-shadow);
}

.mini-val {
  font-size: 22px;
  font-weight: 800;
  color: var(--eq-accent);
  font-variant-numeric: tabular-nums;
}

.mini-label {
  font-size: 12px;
  color: var(--eq-text-sub);
  margin-top: 4px;
}

.admin-entry-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.admin-entry-card:hover {
  border-color: var(--eq-line);
}

/*
 * 底部版权页脚：低透明度、不占卡片。
 * 用 opacity 而不是把颜色调浅 —— 深浅两套主题下都能自动「沉」下去，
 * 不必为每个主题各写一份灰色值。
 */
.about-foot {
  margin-top: 30px;
  padding-top: 16px;
  border-top: 1px solid var(--eq-border-soft);
  text-align: center;
  font-size: 12px;
  line-height: 1.9;
  color: var(--eq-text-sub);
  opacity: 0.45;
  user-select: none;
}

@media (max-width: 900px) {
  .profile-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ---------- 积分明细 ---------- */
/* 「总积分」这一格可点：给出指针与轻微抬升，避免看起来和旁边静态数字一样 */
.stat-clickable {
  cursor: pointer;
  transition: border-color var(--eq-dur) var(--eq-ease), transform var(--eq-dur) var(--eq-ease);
}
.stat-clickable:hover {
  border-color: var(--eq-line);
  transform: translateY(-1px);
}
.stat-clickable:focus-visible {
  outline: 2px solid var(--eq-primary);
  outline-offset: 2px;
}
.mini-more {
  font-size: 11px;
  color: var(--eq-primary);
  opacity: 0.9;
}

.log-body {
  min-height: 120px;
}
.log-sum {
  margin-bottom: 14px;
  padding: 8px 10px;
  border-radius: var(--eq-radius-xs);
  background: var(--eq-surface-sunken);
  font-size: 12px;
  color: var(--eq-text-sub);
}
.log-sum b {
  color: var(--eq-text);
}

/* 一行一笔：左边「类型 + 说明」，右边「变动值 + 时间」 */
.log-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 2px;
  border-bottom: 1px solid var(--eq-border-soft);
}
.log-row:last-child {
  border-bottom: none;
}
.log-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.log-type {
  flex: none;
  font-size: 11px;
}
.log-remark {
  font-size: 13px;
  color: var(--eq-text-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.log-side {
  flex: none;
  text-align: right;
}
.log-delta {
  display: block;
  font-size: 15px;
  color: var(--eq-primary);
  font-variant-numeric: tabular-nums;
}
.log-delta.minus {
  color: var(--eq-text-sub);
}
.log-time {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--eq-text-sub);
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
}
</style>
