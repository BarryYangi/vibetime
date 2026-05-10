import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

function commitHash(): string {
  const envHash = process.env.VIBETIME_COMMIT_HASH?.trim()
  if (envHash) return envHash.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const buildDefines = {
  __VIBETIME_COMMIT_HASH__: JSON.stringify(commitHash()),
}

export default defineConfig({
  main: {
    define: buildDefines,
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
