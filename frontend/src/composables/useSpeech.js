import { ref, computed, onUnmounted } from 'vue'

/**
 * 听力朗读：基于浏览器内置的 Web Speech API（speechSynthesis）
 *
 * 为什么不用后端 TTS：
 *  1. 零依赖、零费用，不占服务器带宽，答辩断网也能演示；
 *  2. Windows 上 Chrome 用的是系统语音引擎（Microsoft David/Zira），
 *     属于离线语音，无需联网；
 *  3. 延迟低，按下去就出声，适合「听写」这种需要反复重播的场景。
 *
 * 浏览器差异处理：
 *  - 语音列表在部分浏览器上是异步加载的，首次可能为空，
 *    这里监听 voiceschanged 并做懒加载兜底。
 *  - Chrome 要求页面有过用户交互才允许发声，若被拦截会走 onerror，
 *    上层可以根据 supported / lastError 给出提示。
 */

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

/** 模块级单例：语音列表加载一次即可 */
const voices = ref([])

/** 首选英文语音的偏好顺序，越靠前越优先 */
const PREFERRED = [
  'Microsoft Aria Online (Natural) - English (United States)',
  'Microsoft Guy Online (Natural) - English (United States)',
  'Google US English',
  'Microsoft Zira - English (United States)',
  'Microsoft David - English (United States)',
  'Samantha'
]

function loadVoices() {
  if (!supported) return
  const list = window.speechSynthesis.getVoices() || []
  if (list.length) voices.value = list
}

if (supported) {
  loadVoices()
  // 语音列表异步就绪
  window.speechSynthesis.onvoiceschanged = loadVoices
  // 某些浏览器首次调用返回空数组，延迟再取一次
  setTimeout(loadVoices, 600)
}

function pickVoice() {
  const all = voices.value.length ? voices.value : (supported ? window.speechSynthesis.getVoices() : []) || []
  const en = all.filter((v) => (v.lang || '').toLowerCase().startsWith('en'))
  if (!en.length) return null
  for (const name of PREFERRED) {
    const hit = en.find((v) => v.name === name)
    if (hit) return hit
  }
  // 退而求其次：优先 en-US，其次任意英文语音
  return en.find((v) => v.lang === 'en-US') || en[0]
}

export function useSpeech() {
  const speaking = ref(false)
  const lastError = ref('')
  /** 已播放次数（提交时上报，用于学情分析） */
  const playCount = ref(0)

  let utterance = null
  /** 待发声的延时句柄（见 speak 里的说明） */
  let speakTimer = null
  /** 组件是否还活着：卸载后必须停止一切「稍后发声」 */
  let alive = true

  const voiceName = computed(() => pickVoice()?.name || '')

  function clearTimer() {
    if (speakTimer) {
      clearTimeout(speakTimer)
      speakTimer = null
    }
  }

  /**
   * 朗读一句英文
   * @param {string} text 英文文本
   * @param {Object} [options]
   * @param {number} [options.rate=0.9] 语速，0.1~2
   */
  function speak(text, options = {}) {
    if (!supported || !text) return false
    const { rate = 0.9 } = options

    // 打断上一句：既要 cancel 当前正在念的，也要作废还没发出去的排队
    clearTimer()
    try {
      window.speechSynthesis.cancel()
    } catch (e) {
      /* 忽略 */
    }
    lastError.value = ''

    utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = rate
    utterance.pitch = 1
    utterance.volume = 1
    const v = pickVoice()
    if (v) utterance.voice = v

    utterance.onstart = () => {
      speaking.value = true
      playCount.value += 1
    }
    utterance.onend = () => {
      speaking.value = false
    }
    utterance.onerror = (e) => {
      speaking.value = false
      // 'interrupted' / 'canceled' 是主动打断，不算失败
      if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') {
        lastError.value = e.error
      }
    }

    // 部分浏览器在 cancel 后立即 speak 会静默失败，放到下一个事件循环更稳。
    // 但这 30ms 是个陷阱：若期间组件被卸载，stop() 已经 cancel 过，
    // 延迟回调再把 utterance 塞回去，就会在「已经离开的页面」上出声。
    // 所以卸载时除了 cancel，还要把这条排队作废（alive + clearTimer）。
    speakTimer = setTimeout(() => {
      speakTimer = null
      if (!alive) return
      try {
        window.speechSynthesis.speak(utterance)
      } catch (err) {
        speaking.value = false
        lastError.value = String(err?.message || err)
      }
    }, 30)
    return true
  }

  function stop() {
    clearTimer()
    if (!supported) return
    try {
      window.speechSynthesis.cancel()
    } catch (e) {
      /* 忽略 */
    }
    speaking.value = false
  }

  function resetPlayCount() {
    playCount.value = 0
  }

  onUnmounted(() => {
    alive = false
    stop()
  })

  return { supported, speaking, lastError, voiceName, playCount, speak, stop, resetPlayCount }
}
