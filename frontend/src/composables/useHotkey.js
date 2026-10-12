import { onMounted, onUnmounted } from 'vue'

/**
 * 键盘输入态判定：焦点在输入框里时，字母/数字键必须交还给输入框，
 * 否则用户没法正常打字。这是键盘化改造最容易踩的坑。
 */
function isTypingTarget(el) {
  if (!el || el === document.body) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

/**
 * 把 KeyboardEvent 归一化成处理表里的键名。
 *
 *  - 字符键统一小写（'A' -> 'a'），空格为 'Space'，其余功能键保持原名
 *  - 带修饰键时拼成组合名：'Ctrl+Space'、'Ctrl+;'、'Ctrl+ArrowRight'
 *
 * 未注册的组合键（如 Ctrl+C 复制）会原样放行，不会被拦截。
 */
function normalizeKey(e) {
  const k = e.key
  if (typeof k !== 'string') return ''

  let base
  if (k === ' ') base = 'Space'
  else if (k.length === 1) base = k.toLowerCase()
  else base = k

  const mods = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.metaKey) mods.push('Meta')
  if (e.altKey) mods.push('Alt')
  if (!mods.length) return base
  return mods.join('+') + '+' + base
}

/**
 * 注册一组快捷键处理函数。
 *
 * @param {Object} handlers 形如 { Enter: fn, Escape: fn, a: fn, 'Ctrl+Space': fn }
 *   处理函数返回 false 表示「我不接管这个键」，此时不会 preventDefault，
 *   键的默认行为会照常发生（例如输入框里的 Backspace 删除字符）。
 * @param {Object} [options]
 * @param {string[]} [options.allowInInput=['Enter','Escape']] 输入框聚焦时仍要响应的无修饰键
 * @param {boolean} [options.stopOnHandled=true] 命中后是否 preventDefault
 * @param {boolean} [options.capture=false] 是否在捕获阶段监听（用于抢在页面之前处理，可 stopPropagation 拦截）
 */
export function useHotkey(handlers, options = {}) {
  const {
    allowInInput = ['Enter', 'Escape'],
    stopOnHandled = true,
    capture = false
  } = options

  function onKeydown(e) {
    const key = normalizeKey(e)
    if (!key) return

    const fn = handlers[key]
    // 没注册过的键一律放行：复制粘贴、刷新、输入法切换都不受影响
    if (typeof fn !== 'function') return

    // 组合键即使在输入框里也要响应（听写页的 Ctrl+Space 播放 / Ctrl+; 看答案）
    const isCombo = key.includes('+')
    if (!isCombo && isTypingTarget(e.target) && !allowInInput.includes(key)) return

    const handled = fn(e, key)
    if (stopOnHandled && handled !== false) e.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, capture))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown, capture))
}
