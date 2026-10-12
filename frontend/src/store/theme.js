import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/** localStorage 键名 —— index.html 里的首屏内联脚本用的也是这个键，别只改一边 */
export const THEME_KEY = 'eq_theme'

/** 三种主题偏好：跟随系统 / 强制浅色 / 强制深色 */
export const THEME_MODES = ['system', 'light', 'dark']

/** 读取本地偏好；脏数据（手改、旧版本残留）一律回落到「跟随系统」 */
function readStoredMode() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return THEME_MODES.includes(v) ? v : 'system'
  } catch (e) {
    /* Safari 无痕模式下 localStorage 可能直接抛错，不能让它拖垮整个应用启动 */
    return 'system'
  }
}

function prefersDark() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/**
 * 界面主题。
 *
 * 三态而不是两态：除了浅/深，还必须能选「跟随系统」——
 * 用户白天用浅色、晚上系统自动转深色时不该被应用强行留在浅色。
 *
 * 换肤本身不在这里做，这里只负责**决定主题名并写到 <html data-theme>**；
 * 真正的配色覆盖全在 styles/global.css 的「深色主题」章节里，
 * 靠一套 CSS 变量完成。这样主题的"色"只有一个来源，不散落在 JS 里。
 */
export const useThemeStore = defineStore('theme', () => {
  const mode = ref(readStoredMode())
  const systemDark = ref(prefersDark())

  /** 实际生效的主题（mode 为 system 时要看系统） */
  const resolved = computed(() =>
    mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value
  )
  const isDark = computed(() => resolved.value === 'dark')

  function setMode(next) {
    mode.value = THEME_MODES.includes(next) ? next : 'system'
    try {
      localStorage.setItem(THEME_KEY, mode.value)
    } catch (e) {
      /* 写不进去也不影响当前会话，只是下次打开会回到默认 */
    }
  }

  /**
   * 把主题落到根元素上。
   * index.html 里的内联脚本已经在首屏渲染前跑过一次同样的逻辑，
   * 这里再做一次是为了覆盖「运行中切换」和「系统主题变化」两种后续情况。
   */
  function apply() {
    const el = document.documentElement
    el.dataset.theme = resolved.value
    // color-scheme 决定滚动条、原生下拉框、输入光标的配色。
    // 不设的话深色页面会出现一条惨白的滚动条，非常出戏。
    el.style.colorScheme = resolved.value
  }

  // 监听系统主题变化。即使当前是「强制浅色」，也保持这个值同步，
  // 这样用户切回「跟随系统」时能立刻拿到正确的系统状态。
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      systemDark.value = e.matches
    }
    // Safari 14 以下只有 addListener，做个兼容，不值得为它报错
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
    else if (typeof mq.addListener === 'function') mq.addListener(onChange)
  }

  watch(resolved, apply, { immediate: true })

  return { mode, systemDark, resolved, isDark, setMode }
})
