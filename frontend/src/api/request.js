import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 20000
})

/** 请求拦截：自动带上 JWT */
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('eq_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** 响应拦截：统一剥壳 + 错误提示 */
request.interceptors.response.use(
  (response) => {
    const body = response.data
    // silent: 调用方标记"失败也不用弹提示"（例如错题回顾里后台自动拉的讲解，
    // 失败只需静默降级到通用解析，不该打断正在看错题的学生）
    const silent = response.config && response.config.silent
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 200) {
        return body.data
      }
      // 401 未登录 / 登录过期 -> 清空并跳登录
      if (body.code === 401) {
        localStorage.removeItem('eq_token')
        localStorage.removeItem('eq_user')
        if (!location.hash.includes('/login')) {
          location.hash = '#/login'
        }
      }
      if (!silent) {
        ElMessage.error(body.msg || '请求失败')
      }
      return Promise.reject(new Error(body.msg || '请求失败'))
    }
    return body
  },
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      localStorage.removeItem('eq_token')
      localStorage.removeItem('eq_user')
      location.hash = '#/login'
    }
    if (!(error.config && error.config.silent)) {
      ElMessage.error(error.response?.data?.msg || error.message || '网络异常，请检查后端服务')
    }
    return Promise.reject(error)
  }
)

export default request
