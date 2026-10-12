import { ref } from 'vue'

/**
 * 全局键位提示状态（模块级单例）。
 * 各页面在 onMounted 时 setHints 声明自己支持的按键，KeyBar 组件统一渲染在屏幕底部。
 */
const hints = ref([])
const status = ref('')

export function useKeyHints() {
  /**
   * @param {Array<{keys: string|string[], label: string}>} list
   */
  function setHints(list) {
    hints.value = Array.isArray(list) ? list : []
  }

  function setStatus(text) {
    status.value = text || ''
  }

  function clearHints() {
    hints.value = []
    status.value = ''
  }

  return { hints, status, setHints, setStatus, clearHints }
}
