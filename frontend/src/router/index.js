import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * meta.shell = true  → 带左侧导航的桌面布局
 * 不带 shell 的页面走沉浸式全屏布局（登录、答题）
 * meta.admin = true  → 后台管理，使用独立布局
 */
const routes = [
  { path: '/', redirect: '/home' },

  // ---- 登录注册 ----
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true, title: '登录' } },

  // ---- 学生端（左侧导航）----
  { path: '/home', name: 'home', component: () => import('@/views/Home.vue'), meta: { shell: true, title: '首页' } },
  { path: '/vocab', name: 'vocab', component: () => import('@/views/VocabLevels.vue'), meta: { shell: true, title: '词汇闯关' } },
  { path: '/grammar', name: 'grammar', component: () => import('@/views/GrammarRoute.vue'), meta: { shell: true, title: '语法路线' } },
  { path: '/listen', name: 'listen', component: () => import('@/views/ListenLevels.vue'), meta: { shell: true, title: '听力听写' } },
  { path: '/game', name: 'game', component: () => import('@/views/GameCenter.vue'), meta: { shell: true, title: '游戏中心' } },
  { path: '/stats', name: 'stats', component: () => import('@/views/Stats.vue'), meta: { shell: true, title: '学习看板' } },
  { path: '/error-book', name: 'errorBook', component: () => import('@/views/ErrorBook.vue'), meta: { shell: true, title: '错题本' } },
  { path: '/ai', name: 'ai', component: () => import('@/views/AiPractice.vue'), meta: { shell: true, title: 'AI 智能练习' } },
  { path: '/profile', name: 'profile', component: () => import('@/views/Profile.vue'), meta: { shell: true, title: '个人中心' } },

  // ---- 沉浸式答题页（无导航，全屏专注）----
  { path: '/quiz/vocab/:levelId', name: 'vocabQuiz', component: () => import('@/views/VocabQuiz.vue'), meta: { title: '词汇答题' } },
  { path: '/lesson/:day', name: 'grammarLesson', component: () => import('@/views/GrammarLesson.vue'), meta: { title: '语法关卡' } },
  { path: '/listen/:levelId/:mode', name: 'listenPractice', component: () => import('@/views/ListenPractice.vue'), meta: { title: '听力听写' } },

  // ---- 后台管理 ----
  { path: '/admin/login', name: 'adminLogin', component: () => import('@/views/admin/AdminLogin.vue'), meta: { public: true, title: '管理后台登录' } },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { admin: true },
    redirect: '/admin/dashboard',
    children: [
      { path: 'dashboard', name: 'adminDashboard', component: () => import('@/views/admin/AdminDashboard.vue'), meta: { admin: true, title: '数据总览' } },
      { path: 'users', name: 'adminUsers', component: () => import('@/views/admin/AdminUsers.vue'), meta: { admin: true, title: '用户管理' } },
      { path: 'vocab', name: 'adminVocab', component: () => import('@/views/admin/AdminVocab.vue'), meta: { admin: true, title: '词汇题库' } },
      { path: 'grammar', name: 'adminGrammar', component: () => import('@/views/admin/AdminGrammar.vue'), meta: { admin: true, title: '语法题库' } }
    ]
  },

  { path: '/:pathMatch(.*)*', redirect: '/home' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

/** 安全读取本地用户缓存，避免脏数据导致路由守卫抛错白屏 */
function readUser() {
  const raw = localStorage.getItem('eq_user')
  if (!raw || raw === 'undefined' || raw === 'null') return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    localStorage.removeItem('eq_user')
    return null
  }
}

/** 全局前置守卫：学生端需登录、后台需 ADMIN 角色 */
router.beforeEach((to) => {
  const token = localStorage.getItem('eq_token')
  const user = readUser()

  if (to.meta.public) {
    return true
  }
  if (!token) {
    return { path: to.meta.admin ? '/admin/login' : '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.admin && user?.role !== 'ADMIN') {
    return { path: '/home' }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 英语闯关` : '英语闯关 · 专升本英语闯关学习系统'
})

export default router
