import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        banzami: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        angola: {
          red:    '#CC0000',
          black:  '#000000',
          yellow: '#FFCC00',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      typography: (theme: (path: string) => string) => ({
        banzami: {
          css: {
            '--tw-prose-body':         theme('colors.slate.700'),
            '--tw-prose-headings':     theme('colors.slate.900'),
            '--tw-prose-code':         theme('colors.banzami.700'),
            '--tw-prose-pre-bg':       theme('colors.slate.900'),
            '--tw-prose-pre-code':     theme('colors.slate.100'),
            '--tw-prose-quotes':       theme('colors.banzami.700'),
            '--tw-prose-quote-borders':theme('colors.banzami.400'),
            maxWidth: 'none',
          },
        },
      }),
    },
  },
  plugins: [typography],
}

export default config
