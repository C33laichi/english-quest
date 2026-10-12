import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api'

/** 安全解析本地缓存的用户信息，脏数据不应导致整站白屏 */
function readCachedUser() {
  const raw = localStorage.getItem('eq_user')
  if (!raw || raw === 'undefined' || raw === 'null') return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    localStorage.removeItem('eq_user')
    return null
  }
}

/**
 * 用户状态：token、用户信息、登录/登出
 * token 持久化在 localStorage，刷新页面后自动恢复
 */
export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('eq_token') || '')
  const user = ref(readCachedUser())

  const isLogin = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')
  const displayName = computed(() => user.value?.nickname || user.value?.username || '同学')

  /**
   * 登录接口返回的是**扁平结构**（token/userId/username/nickname/role/avatar/
   * totalPoints/streakDays），并没有嵌套的 user 对象。这里统一组装成前端用户对象；
   * 若后端将来改为嵌套结构，`src.user` 分支可以自动兼容。
   */
  function setSession(loginVO) {
    const src = loginVO.user || loginVO
    const profile = {
      userId: src.userId,
      username: src.username,
      nickname: src.nickname,
      role: src.role,
      avatar: src.avatar,
      totalPoints: src.totalPoints,
      streakDays: src.streakDays
    }
    token.value = loginVO.token
    user.value = profile
    localStorage.setItem('eq_token', loginVO.token)
    localStorage.setItem('eq_user', JSON.stringify(profile))
  }

  function setUser(u) {
    user.value = u
    localStorage.setItem('eq_user', JSON.stringify(u))
  }

  function clear() {
    token.value = ''
    user.value = null
    localStorage.removeItem('eq_token')
    localStorage.removeItem('eq_user')
  }

  async function login(form) {
    const data = await authApi.login(form)
    setSession(data)
    return data
  }

  async function register(form) {
    const data = await authApi.register(form)
    return data
  }

  async function refresh() {
    if (!token.value) return null
    const u = await authApi.me()
    setUser(u)
    return u
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch (e) {
      /* 登出失败不阻塞前端清理 */
    }
    clear()
  }

  return {
    token, user, isLogin, isAdmin, displayName,
    setSession, setUser, clear, login, register, refresh, logout
  }
})
