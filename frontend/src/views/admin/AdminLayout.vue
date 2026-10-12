<template>
  <el-container class="admin-layout">
    <el-aside width="210px" class="admin-aside">
      <div class="logo">
        <span class="logo-icon">🎯</span>
        <span class="logo-text">英语闯关后台</span>
      </div>
      <el-menu :default-active="activeMenu" router class="admin-menu">
        <el-menu-item index="/admin/dashboard">
          <el-icon><DataLine /></el-icon><span>数据总览</span>
        </el-menu-item>
        <el-menu-item index="/admin/users">
          <el-icon><User /></el-icon><span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/vocab">
          <el-icon><Notebook /></el-icon><span>词汇题库</span>
        </el-menu-item>
        <el-menu-item index="/admin/grammar">
          <el-icon><Reading /></el-icon><span>语法题库</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="admin-header">
        <div class="header-title">{{ route.meta.title || '管理后台' }}</div>
        <div class="header-right">
          <span class="muted">你好，{{ userStore.displayName }}</span>
          <el-button link type="primary" @click="router.push('/home')">学生端</el-button>
          <el-button link type="danger" @click="doLogout">退出</el-button>
        </div>
      </el-header>

      <el-main class="admin-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { DataLine, User, Notebook, Reading } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)

async function doLogout() {
  try {
    await ElMessageBox.confirm('确定退出管理后台吗？', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch (e) {
    return
  }
  await userStore.logout()
  router.replace('/admin/login')
}
</script>

<style scoped>
.admin-layout {
  min-height: 100vh;
}
.admin-aside {
  background: var(--eq-side-2);
  min-height: 100vh;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px;
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.logo-icon {
  font-size: 20px;
}
.admin-menu {
  border-right: none;
  background: transparent;
}
.admin-menu :deep(.el-menu-item) {
  color: rgba(255, 255, 255, 0.72);
}
.admin-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.admin-menu :deep(.el-menu-item.is-active) {
  background: var(--eq-primary);
  color: #fff;
}
.admin-header {
  background: var(--eq-surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: var(--eq-shadow);
}
.header-title {
  font-size: 17px;
  font-weight: 700;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.admin-main {
  background: var(--eq-bg);
  padding: 20px 24px;
}
</style>
