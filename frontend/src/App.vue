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

    <!-- 有侧栏时键位条只铺内容区，左侧整列让给侧边栏（侧栏要一直占满到屏幕底部） -->
    <KeyBar :class="{ 'keybar--shell': hasShell }" />
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
 * 全局快捷键：Shift+? 打开快捷键面板，Esc 关闭。
 * 用捕获阶段监听，面板打开时按 Esc 可以直接拦下事件，
 * 避免底下的页面（比如答题页）同时再响应一次 Esc。
 */
const toggleHelp = () => {
  helpVisible.value = !helpVisible.value
}

useHotkey(
  {
    '?': toggleHelp,
    // 中文输入法 / 全角状态下 Shift+/ 可能产出全角问号，一并接管，
    // 否则用户按了没反应却以为快捷键坏了。
    '？': toggleHelp,
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
