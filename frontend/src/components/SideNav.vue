<template>
  <aside class="side-nav">
    <div class="side-brand">
      <div class="side-brand-logo">EQ</div>
      <div class="side-brand-text">
        <b>英语闯关</b>
        <span>专升本 · 游戏化学习</span>
      </div>
    </div>

    <nav>
      <template v-for="group in groups" :key="group.label">
        <div class="side-group-label">{{ group.label }}</div>
        <router-link
          v-for="item in group.items"
          :key="item.path"
          :to="item.path"
          class="side-item"
          :class="{ active: isActive(item.path) }"
          :title="item.label"
        >
          <span class="ico">{{ item.icon }}</span>
          <span class="txt">{{ item.label }}</span>
          <span v-if="item.badge && errorCount > 0" class="side-badge">{{ errorCount }}</span>
        </router-link>
      </template>
    </nav>

    <div class="side-foot">
      <!--
        账号菜单：点侧栏底部的用户区弹出。
        用 el-popover 而不是 el-dropdown，因为面板里要放一个**可交互的
        分段控件**（主题三态）—— dropdown 的选项默认点击即关闭菜单，
        点主题按钮会把面板一起关掉，体验很别扭。
      -->
      <el-popover
        v-model:visible="menuVisible"
        trigger="click"
        placement="right-end"
        :width="248"
        :offset="12"
        :show-arrow="false"
        popper-class="user-menu-popper"
      >
        <template #reference>
          <button
            class="side-user"
            :class="{ open: menuVisible }"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="menuVisible"
            title="账号与外观设置"
          >
            <div class="avatar">{{ initial }}</div>
            <div class="side-user-text">
              <b>{{ userStore.displayName }}</b>
              <span>{{ pointsText }}</span>
            </div>
            <span class="side-user-caret" aria-hidden="true">›</span>
          </button>
        </template>

        <div class="user-menu">
          <div class="user-menu-head">
            <div class="avatar">{{ initial }}</div>
            <div class="user-menu-id">
              <b>{{ userStore.displayName }}</b>
              <span>{{ usernameText }}</span>
            </div>
          </div>

          <!--
            导航类入口。侧栏已经有一份，这里再放一份是为了对齐
            「点头像找设置」的直觉路径 —— 用户想改主题时不会先去翻导航。
          -->
          <button
            v-for="it in menuItems"
            :key="it.path"
            class="user-menu-row"
            type="button"
            @click="go(it.path)"
          >
            <span class="umi">{{ it.icon }}</span>
            <span>{{ it.label }}</span>
          </button>

          <button class="user-menu-row" type="button" @click="openHelp">
            <span class="umi">⌨️</span>
            <span>快捷键</span>
          </button>

          <div class="user-menu-group">偏好设置</div>

          <div class="theme-row">
            <span>主题</span>
            <!--
              三态分段控件：跟随系统 / 浅色 / 深色。
              用图标按钮而不是文字，是为了让"三个选项"能一眼扫完；
              图标用 Element Plus 的线性图标而非 emoji ——
              emoji 是彩色位图，在单色界面里会显得很跳，也无法跟着主题变色。
            -->
            <div class="theme-seg" role="radiogroup" aria-label="界面主题">
              <button
                v-for="opt in themeOptions"
                :key="opt.value"
                class="theme-opt"
                :class="{ on: themeStore.mode === opt.value }"
                type="button"
                role="radio"
                :aria-checked="themeStore.mode === opt.value"
                :title="opt.label"
                @click="themeStore.setMode(opt.value)"
              >
                <el-icon><component :is="opt.icon" /></el-icon>
              </button>
            </div>
          </div>

          <div class="user-menu-sep"></div>

          <button class="user-menu-row danger" type="button" @click="doLogout">
            <span class="umi">🚪</span>
            <span>退出登录</span>
          </button>
        </div>
      </el-popover>
    </div>
  </aside>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Monitor, Sunny, Moon } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { useThemeStore } from '@/store/theme'
import { errorBookApi } from '@/api'

const emit = defineEmits(['help'])

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

const errorCount = ref(0)
const menuVisible = ref(false)

const groups = [
  {
    label: '学习',
    items: [
      { path: '/home', label: '首页', icon: '🏠' },
      { path: '/vocab', label: '词汇闯关', icon: '📚' },
      { path: '/grammar', label: '语法路线', icon: '🧭' },
      { path: '/listen', label: '听力听写', icon: '🎧' },
      { path: '/ai', label: 'AI 智能练习', icon: '🤖' }
    ]
  },
  {
    label: '成长',
    items: [
      { path: '/error-book', label: '错题本', icon: '📕', badge: true },
      { path: '/game', label: '游戏中心', icon: '🎮' },
      { path: '/stats', label: '学习看板', icon: '📊' },
      { path: '/profile', label: '个人中心', icon: '👤' }
    ]
  }
]

/** 账号菜单里的快捷入口（复用侧栏同一批路由，图标口径保持一致） */
const menuItems = [
  { path: '/profile', label: '个人主页', icon: '👤' },
  { path: '/stats', label: '学习看板', icon: '📊' },
  { path: '/error-book', label: '错题本', icon: '📕' },
  { path: '/game', label: '游戏中心', icon: '🎮' }
]

const themeOptions = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sunny },
  { value: 'dark', label: '深色', icon: Moon }
]

const initial = computed(() => (userStore.displayName || '同').slice(0, 1))

const pointsText = computed(() => {
  const p = userStore.user?.totalPoints
  return p === undefined || p === null ? '专升本英语' : `${p} 积分`
})

const usernameText = computed(() => {
  const u = userStore.user?.username
  return u ? `@${u}` : '专升本英语'
})

function isActive(path) {
  return route.path === path || route.path.startsWith(path + '/')
}

function go(path) {
  menuVisible.value = false
  if (route.path !== path) router.push(path)
}

function openHelp() {
  menuVisible.value = false
  emit('help')
}

async function loadBadge() {
  try {
    const res = await errorBookApi.count()
    errorCount.value = res?.unmastered ?? 0
  } catch (e) {
    /* 角标拿不到不影响导航 */
  }
}

async function doLogout() {
  menuVisible.value = false
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
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

onMounted(loadBadge)
watch(() => route.path, loadBadge)
</script>
