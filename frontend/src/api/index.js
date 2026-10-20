import request from './request'

/* ---------------- 认证 ---------------- */
export const authApi = {
  login: (data) => request.post('/auth/login', data),
  register: (data) => request.post('/auth/register', data),
  logout: () => request.post('/auth/logout'),
  me: () => request.get('/auth/me'),
  updateProfile: (data) => request.put('/auth/me', data),
  updatePassword: (data) => request.put('/auth/password', data)
}

/* ---------------- 词汇闯关 ---------------- */
export const vocabApi = {
  levels: () => request.get('/vocab/levels'),
  questions: (levelId) => request.get(`/vocab/levels/${levelId}/questions`),
  submit: (levelId, data) => request.post(`/vocab/levels/${levelId}/submit`, data)
}

/* ---------------- 语法闯关 ---------------- */
export const grammarApi = {
  lessons: () => request.get('/grammar/lessons'),
  lesson: (day) => request.get(`/grammar/lessons/${day}`),
  submit: (day, data) => request.post(`/grammar/lessons/${day}/submit`, data)
}

/* ---------------- 听力听写 ---------------- */
export const listenApi = {
  levels: () => request.get('/listen/levels'),
  /** mode: EASY 简单（给每词长度提示）/ HARD 困难（不给长度信息） */
  sentences: (levelId, mode = 'EASY') =>
    request.get(`/listen/levels/${levelId}/sentences`, { params: { mode } }),
  /** 单句即时判分 */
  check: (data) => request.post('/listen/check', data),
  submit: (levelId, data) => request.post(`/listen/levels/${levelId}/submit`, data)
}

/* ---------------- 游戏机制 ---------------- */
export const gameApi = {
  overview: () => request.get('/game/overview'),
  checkin: () => request.post('/game/checkin'),
  tasks: () => request.get('/game/tasks'),
  claim: (code) => request.post(`/game/tasks/${code}/claim`),
  rank: (type = 'points') => request.get('/game/rank', { params: { type } })
}

/* ---------------- 错题本 ---------------- */
export const errorBookApi = {
  list: (module) => request.get('/error-book/list', { params: module ? { module } : {} }),
  count: () => request.get('/error-book/count'),
  retry: (id, userAnswer) => request.post(`/error-book/${id}/retry`, { userAnswer }),
  master: (id) => request.put(`/error-book/${id}/master`),
  remove: (id) => request.delete(`/error-book/${id}`)
}

/* ---------------- AI 智能练习 ---------------- */
export const aiApi = {
  similar: (data) => request.post('/ai/similar-question', data),
  /**
   * 针对学生所选错项的讲解。
   * silent：回顾页是后台自动批量的拉取，失败只需静默降级到通用解析，
   * 不能因为一次失败就给学生弹一排错误提示。
   */
  explainWrong: (data) => request.post('/ai/wrong-explain', data, { silent: true }),
  /** 单词串烧：把勾选的多个词汇错题编成一篇短文 */
  passage: (data) => request.post('/ai/passage', data),
  /** 语法错题 → 考点拓展 */
  expand: (data) => request.post('/ai/expand', data),
  /**
   * AI 能力可用性：服务端没配 Key 时 chatAvailable 为 false，reason 给出原因。
   * 页面靠它决定「AI 对话」入口提示「可使用」还是「不可使用」。
   */
  status: () => request.get('/ai/status'),
  /**
   * AI 对话（多轮）。
   * 会话不落在服务端：把历史轮次随请求带上，服务端只取最近若干轮。
   */
  chat: (data) => request.post('/ai/chat', data),
  quota: () => request.get('/ai/quota')
}

/* ---------------- 学习数据看板 ---------------- */
export const statsApi = {
  overview: () => request.get('/stats/overview'),
  heatmap: (days = 84) => request.get('/stats/heatmap', { params: { days } }),
  trend: (days = 14) => request.get('/stats/accuracy-trend', { params: { days } }),
  radar: () => request.get('/stats/radar')
}

/* ---------------- 后台管理 ---------------- */
export const adminApi = {
  stats: () => request.get('/admin/stats'),
  users: (params) => request.get('/admin/users', { params }),
  createUser: (data) => request.post('/admin/users', data),
  updateUserStatus: (id, status) => request.put(`/admin/users/${id}/status`, null, { params: { status } }),
  resetPassword: (id) => request.put(`/admin/users/${id}/reset-password`),
  deleteUser: (id) => request.delete(`/admin/users/${id}`),

  vocabLevels: () => request.get('/admin/vocab/levels'),
  saveVocabLevel: (data) => request.post('/admin/vocab/levels', data),
  deleteVocabLevel: (id) => request.delete(`/admin/vocab/levels/${id}`),
  vocabQuestions: (params) => request.get('/admin/vocab/questions', { params }),
  saveVocabQuestion: (data) => request.post('/admin/vocab/questions', data),
  deleteVocabQuestion: (id) => request.delete(`/admin/vocab/questions/${id}`),
  /**
   * 词汇题库批量导入。FormData 里只放 file，其余参数走 query。
   * 超时单独放宽到 60s：默认 20s 对"上传 + POI 解析 + 写库"偏紧。
   */
  importVocabQuestions: (formData, params) =>
    request.post('/admin/vocab/import', formData, { params, timeout: 300000 }),

  grammarLessons: () => request.get('/admin/grammar/lessons'),
  saveGrammarLesson: (data) => request.post('/admin/grammar/lessons', data),
  deleteGrammarLesson: (id) => request.delete(`/admin/grammar/lessons/${id}`),
  grammarQuestions: (params) => request.get('/admin/grammar/questions', { params }),
  saveGrammarQuestion: (data) => request.post('/admin/grammar/questions', data),
  deleteGrammarQuestion: (id) => request.delete(`/admin/grammar/questions/${id}`),
  /**
   * 语法题库批量导入。lessonId 是**默认**目标 Day（文件里「天数」列留空的行落到它，
   * 填了的行按自己的走，所以一份文件可以同时导入多天）。
   *
   * <p>超时给到 5 分钟：PDF 扫描件要逐页 OCR（一页 1~2 秒），缺答案时还要 AI 作答，
   * 40 页大概就是 1 分多钟，用默认的 60 秒会直接超时，用户只会看到"网络错误"。</p>
   */
  importGrammarQuestions: (formData, params) =>
    request.post('/admin/grammar/import', formData, { params, timeout: 300000 })
}
