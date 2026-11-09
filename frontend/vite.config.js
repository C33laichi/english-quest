import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8090',
        changeOrigin: true
      }
    }
  },
  // 构建产物同样要能用：dist 里的请求走相对路径 /api，
  // 只有 dev server 有代理，所以 preview 也得挂一份同样的。
  preview: {
    port: 5174,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8090',
        changeOrigin: true
      }
    }
  }
})
