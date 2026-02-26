import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const host = env.VITE_HOST || 'localhost'
  const port = env.VITE_PORT ? parseInt(env.VITE_PORT, 10) : 5173
  const bekaSearchTarget = env.VITE_BEKA_SEARCH_TARGET || 'http://host.docker.internal:3000'

  const normalizeHost = (value: string) =>
    value
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '')

  const extraAllowedHosts = (env.VITE_ALLOWED_HOSTS || env.VITE_ALLOWED_HOST || '')
    .split(',')
    .map(normalizeHost)
    .filter(Boolean)

  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    'alecs-ai.home.ro',
    '.home.ro',
    ...extraAllowedHosts,
  ]

  return {
    plugins: [react()],
    server: {
      host,
      port,
      allowedHosts,
      proxy: {
        '/beka-search': {
          target: bekaSearchTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/beka-search/, ''),
        },
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    preview: {
      host,
      port,
      allowedHosts,
    },
  }
})
