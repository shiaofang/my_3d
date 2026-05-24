import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { lotteryCachePlugin } from './vite-plugin-lottery-cache.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), lotteryCachePlugin()],
  server: {
    proxy: {
      '/api/sd': {
        target: 'https://tb.tuganjue.com',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api/sd': {
        target: 'https://tb.tuganjue.com',
        changeOrigin: true,
      },
    },
  },
})
