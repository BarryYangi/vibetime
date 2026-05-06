import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['@vibetime/hook/config', '@vibetime/hook/install'],
      },
    },
    resolve: {
      alias: {
        '@vibetime/hook/config': resolve('../hook/src/config.ts'),
        '@vibetime/hook/install': resolve('../hook/src/install.ts'),
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
