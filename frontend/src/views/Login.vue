<template>
  <div class="login-page">
    <div class="login-box">
      <!-- ---------- 左：品牌 ---------- -->
      <div class="login-left">
        <div class="brand-logo">EQ</div>
        <h1>英语闯关</h1>
        <p class="brand-sub">游戏化 · 专升本英语闯关学习系统</p>

        <ul class="features">
          <li><span class="fi">📚</span>6 关词汇闯关 · 词义与拼写混合题型</li>
          <li><span class="fi">🧭</span>28 天语法路线 · 按日解锁循序推进</li>
          <li><span class="fi">⌨️</span>全键盘作答 · 打字答题不用碰鼠标</li>
          <li><span class="fi">🤖</span>AI 同型题 · 检验是真懂还是记答案</li>
        </ul>

        <div class="brand-foot">湖南网络工程职业学院·毕业设计------让学习不再枯燥</div>
      </div>

      <!-- ---------- 右：表单 ---------- -->
      <div class="login-right">
        <el-tabs v-model="tab" stretch>
          <el-tab-pane label="登录" name="login">
            <el-form :model="loginForm" :rules="loginRules" ref="loginRef" label-position="top" @submit.prevent>
              <el-form-item prop="username">
                <el-input
                  v-model="loginForm.username"
                  size="large"
                  placeholder="用户名"
                  :prefix-icon="User"
                  clearable
                />
              </el-form-item>
              <el-form-item prop="password">
                <el-input
                  v-model="loginForm.password"
                  size="large"
                  type="password"
                  placeholder="密码"
                  :prefix-icon="Lock"
                  show-password
                />
              </el-form-item>
            </el-form>
            <el-button class="btn-primary" style="width:100%" :loading="loading" @click="doLogin">
              登 录
            </el-button>
            <p class="muted tip">
              演示账号：student / 见 README　·　按 <kbd>Enter</kbd> 直接登录
            </p>
          </el-tab-pane>

          <el-tab-pane label="注册" name="register">
            <el-form :model="regForm" :rules="regRules" ref="regRef" label-position="top" @submit.prevent>
              <el-form-item prop="username">
                <el-input
                  v-model="regForm.username"
                  size="large"
                  placeholder="用户名（4-20 位）"
                  :prefix-icon="User"
                  clearable
                />
              </el-form-item>
              <el-form-item prop="nickname">
                <el-input
                  v-model="regForm.nickname"
                  size="large"
                  placeholder="昵称（选填）"
                  :prefix-icon="Postcard"
                  clearable
                />
              </el-form-item>
              <el-form-item prop="password">
                <el-input
                  v-model="regForm.password"
                  size="large"
                  type="password"
                  placeholder="密码（6-20 位）"
                  :prefix-icon="Lock"
                  show-password
                />
              </el-form-item>
              <el-form-item prop="confirm">
                <el-input
                  v-model="regForm.confirm"
                  size="large"
                  type="password"
                  placeholder="确认密码"
                  :prefix-icon="Lock"
                  show-password
                />
              </el-form-item>
            </el-form>
            <el-button class="btn-primary" style="width:100%" :loading="loading" @click="doRegister">
              注册并登录
            </el-button>
          </el-tab-pane>
        </el-tabs>

        <div class="admin-entry">
          <span class="muted">教师 / 管理员入口</span>
          <el-button link type="primary" @click="router.push('/admin/login')">前往后台 →</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, Postcard } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { useHotkey } from '@/composables/useHotkey'
import { useKeyHints } from '@/composables/useKeyHints'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const { setHints, setStatus, clearHints } = useKeyHints()

const tab = ref('login')
const loading = ref(false)
const loginRef = ref()
const regRef = ref()

const loginForm = reactive({ username: '', password: '' })
const regForm = reactive({ username: '', nickname: '', password: '', confirm: '' })

const loginRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const regRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 4, max: 20, message: '用户名长度 4-20 位', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度 6-20 位', trigger: 'blur' }
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (rule, value, cb) => {
        if (value !== regForm.password) cb(new Error('两次输入的密码不一致'))
        else cb()
      },
      trigger: 'blur'
    }
  ]
}

function redirectAfterLogin() {
  router.replace(route.query.redirect || '/home')
}

async function doLogin() {
  if (loading.value) return
  // 表单校验失败会 reject，这里必须接住，否则会抛未处理的 Promise 异常
  try {
    await loginRef.value.validate()
  } catch (e) {
    return
  }
  loading.value = true
  try {
    await userStore.login({ ...loginForm })
    ElMessage.success('登录成功，开始闯关吧！')
    redirectAfterLogin()
  } finally {
    loading.value = false
  }
}

async function doRegister() {
  if (loading.value) return
  try {
    await regRef.value.validate()
  } catch (e) {
    return
  }
  loading.value = true
  try {
    await userStore.register({
      username: regForm.username,
      nickname: regForm.nickname || regForm.username,
      password: regForm.password
    })
    // 注册成功后自动登录
    await userStore.login({ username: regForm.username, password: regForm.password })
    ElMessage.success('注册成功，已为你自动登录')
    redirectAfterLogin()
  } finally {
    loading.value = false
  }
}

useHotkey({
  Enter: () => {
    if (loading.value) return true
    if (tab.value === 'login') doLogin()
    else doRegister()
    return true
  }
})

setHints([{ keys: ['Enter'], label: '提交' }])
setStatus('登录')
onUnmounted(clearHints)
</script>

<style scoped>
.login-page {
  min-height: calc(100vh - var(--eq-keybar-h));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 36px 24px;
}

.login-box {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  width: 100%;
  max-width: 900px;
  background: var(--eq-surface);
  border-radius: var(--eq-radius);
  overflow: hidden;
  box-shadow: var(--eq-shadow-lg);
}

/*
 * 左侧品牌区：深石墨底 + 极淡的翡翠径向光晕。
 * 不用紫色渐变（taste-skill LILA RULE），
 * 光晕只做氛围不做装饰性发光。
 */
.login-left {
  position: relative;
  background: var(--eq-side);
  color: #fff;
  padding: 46px 40px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.login-left::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      520px 340px at 8% 0%,
      rgba(79, 70, 229, 0.42),
      transparent 62%
    ),
    radial-gradient(
      420px 300px at 108% 100%,
      rgba(99, 102, 241, 0.16),
      transparent 60%
    );
}

.login-left > * {
  position: relative;
  z-index: var(--z-base);
}

.brand-logo {
  width: 46px;
  height: 46px;
  border-radius: var(--eq-radius-sm);
  background: var(--eq-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 20px;
}

.login-left h1 {
  font-size: 27px;
  font-weight: 600;
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}

.brand-sub {
  margin: 0 0 28px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.features {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
}

.features li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.9);
  padding: 11px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}

.features li:last-child {
  border-bottom: none;
}

.fi {
  font-size: 15px;
  flex-shrink: 0;
  opacity: 0.9;
}

.brand-foot {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 22px;
}

.login-right {
  padding: 42px 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.tip {
  text-align: center;
  margin: 16px 0 0;
  font-size: 12.5px;
}

.admin-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--eq-border-soft);
}

:deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 500;
}

/*
 * stretch 模式下 Element Plus 仍保留 `.el-tabs__item:first-child { padding-left: 0 }`
 * 与 `:last-child { padding-right: 0 }`（组件库自带的不对称内边距），而 stretch 只加了
 * `flex: 1; text-align: center` 并不清内边距 —— 结果是：两个页签的文字各偏离所在半区
 * 中心 10px，激活下划线也比所属页签窄 20px（量得 item 185 / bar 165，任何视口都一样）。
 * 这里把 stretch 下的首尾内边距压成对称，文字与下划线就会真正居中、
 * 下划线正好铺满所在半区（与下方输入框的左右边缘完全对齐）。
 */
:deep(.el-tabs__nav.is-stretch .el-tabs__item) {
  padding: 0;
}

/* 表单输入对比度检查（taste-skill §4.5 强制项） */
:deep(.el-input__wrapper) {
  border-radius: var(--eq-radius-sm);
  box-shadow: 0 0 0 1px var(--eq-border) inset;
}
:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--eq-line) inset;
}
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--eq-primary) inset, var(--eq-glow);
}
:deep(.el-input__inner::placeholder) {
  color: var(--eq-text-mute);
}

@media (max-width: 900px) {
  .login-box {
    grid-template-columns: minmax(0, 1fr);
    max-width: 460px;
  }
  .login-left {
    padding: 30px 26px;
  }
  .features,
  .brand-foot {
    display: none;
  }
  .brand-sub {
    margin-bottom: 0;
  }
  .login-right {
    padding: 28px 26px;
  }
}
</style>
