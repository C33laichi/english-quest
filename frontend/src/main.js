import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { useThemeStore } from './store/theme'
import './styles/global.css'

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

/*
 * 主动实例化主题 store。
 * 不能等 SideNav 用到时才创建 —— 登录页、答题页走的是无侧边栏的沉浸式布局，
 * 那里根本没有 SideNav，不在这里初始化的话「跟随系统」就监听不到系统主题变化。
 * store 内部会在创建时立即把 data-theme 应用到 <html>。
 */
useThemeStore()

app.mount('#app')
