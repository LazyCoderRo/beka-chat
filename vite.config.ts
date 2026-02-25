import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_HOST || 'localhost',
    port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 5173,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'alecs-ai.home.ro',
      '.home.ro',  // Allow any subdomain on .home.ro
      process.env.VITE_ALLOWED_HOST  // Allow dynamic hostname from env var
    ].filter(Boolean),
    proxy: {
      '/beka-search': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/beka-search/, ''),
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
