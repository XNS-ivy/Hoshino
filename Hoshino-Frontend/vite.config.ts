import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3031,
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
