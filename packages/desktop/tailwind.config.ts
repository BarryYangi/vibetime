import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'tn-bg': '#1a1b26',
        'tn-bg-dark': '#16161e',
        'tn-fg': '#c0caf5',
        'tn-fg-dark': '#a9b1d6',
        'tn-primary': '#bb9af7',
        'tn-accent': '#7aa2f7',
        'tn-success': '#9ece6a',
        'tn-warning': '#e0af68',
        'tn-error': '#f7768e',
        'tn-muted': '#565f89',
        'tn-border': '#3b4261',
        'tn-surface': '#24283b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
