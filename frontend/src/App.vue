<template>
  <!-- 后台管理：自带桌面布局，不套学生端外壳 -->
  <router-view v-if="isAdminRoute" />

  <template v-else>
    <div :class="hasShell ? 'desktop-shell' : 'bare-layout'">
      <SideNav v-if="hasShell" @help="helpVisible = true" />
      <main :class="hasShell ? 'main-area' : 'main-bare'">
        <router-view />
      </main>
    </div>

    <KeyBar />
    <ShortcutHelp v-if="helpVisible" @close="helpVisible = false" />
  </template>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import SideNav from '@/components/SideNav.vue'
import KeyBar from '@/components/KeyBar.vue'
import ShortcutHelp from '@/components/ShortcutHelp.vue'
import { useHotkey } from '@/composables/useHotkey'

const route = useRoute()
const helpVisible = ref(false)

/** 后台路由完全独立 */
const isAdminRoute = computed(() => route.path.startsWith('/admin'))
/** 带左侧导航的页面；登录页与答题页走沉浸式无壳布局 */
const hasShell = computed(() => route.meta.shell === true)

/**
 * 全局快捷键：? 打开快捷键面板，Esc 关闭。
 * 用捕获阶段监听，面板打开时按 Esc 可以直接拦下事件，
 * 避免底下的页面（比如答题页）同时再响应一次 Esc。
 */
useHotkey(
  {
    '?': () => {
      helpVisible.value = !helpVisible.value
    },
    Escape: (e) => {
      if (!helpVisible.value) return false
      helpVisible.value = false
      e.stopPropagation()
      return true
    }
  },
  { capture: true }
)
</script>
