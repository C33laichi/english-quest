<template>
  <div class="admin-login-wrap">
    <div class="admin-login-card">
      <div class="brand">
        <div class="brand-icon">🛠</div>
        <h1>英语闯关 · 管理后台</h1>
        <p>专升本英语闯关学习系统</p>
      </div>

      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" @submit.prevent>
        <el-form-item label="管理员账号" prop="username">
          <el-input v-model="form.username" size="large" placeholder="请输入账号" :prefix-icon="User" clearable />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password" size="large" type="password" placeholder="请输入密码"
            :prefix-icon="Lock" show-password @keyup.enter="submit"
          />
        </el-form-item>
        <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="submit">
          登 录 后 台
        </el-button>
      </el-form>

      <div class="tip">默认管理员：admin / 见环境变量说明</div>
      <el-button link type="primary" style="width:100%" @click="router.push('/login')">← 返回学生端</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'

const router = useRouter()
const userStore = useUserStore()

const formRef = ref()
const loading = ref(false)
const form = reactive({ username: 'admin', password: '' })

const rules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function submit() {
  await formRef.value.validate()
  loading.value = true
  try {
    const data = await userStore.login({ ...form })
    if (data.role !== 'ADMIN') {
      ElMessage.error('该账号不是管理员，无法进入后台')
      await userStore.logout()
      return
    }
    ElMessage.success('欢迎回来，管理员')
    router.replace('/admin/dashboard')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.admin-login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0d1117 0%, #16202a 52%, #4f46e5 100%);
  padding: 20px;
}
.admin-login-card {
  width: 420px;
  max-width: 100%;
  background: var(--eq-surface);
  border-radius: 18px;
  padding: 34px 32px 26px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.brand {
  text-align: center;
  margin-bottom: 26px;
}
.brand-icon {
  font-size: 38px;
}
.brand h1 {
  font-size: 20px;
  margin: 10px 0 4px;
}
.brand p {
  margin: 0;
  font-size: 13px;
  color: var(--eq-text-sub);
}
.tip {
  text-align: center;
  font-size: 12px;
  color: var(--eq-text-sub);
  margin: 16px 0 8px;
}
</style>
