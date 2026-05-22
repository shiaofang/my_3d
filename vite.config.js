import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
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
