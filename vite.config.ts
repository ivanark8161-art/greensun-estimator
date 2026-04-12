import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_'],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_DATE__:  JSON.stringify(new Date().toISOString().split('T')[0]),
  },
  server: {
    host: '127.0.0.1',
    port: 5176,
  },
})
