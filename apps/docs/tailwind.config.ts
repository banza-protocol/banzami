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
        // BanzAI light institutional theme — aligned with official Banzami homepage
        bia: {
          bg:           '#F5F1EE',   // warm ivory — app background
          surface:      '#FFFFFF',   // white — card/panel surfaces
          'surface-2':  '#F8F4F1',   // off-white — sidebar, inputs, secondary surfaces
          border:       '#E8E0DB',   // warm subtle border
          'border-2':   '#D5CAC4',   // stronger border
          text:         '#111111',   // near-black primary text
          muted:        '#5F5A57',   // warm gray secondary text
          'muted-2':    '#9B928D',   // light warm gray tertiary text
          primary:      '#990011',   // wine red (brand identity)
          'primary-glow':'rgb(153 0 17 / 0.06)', // very subtle tint on light
          gold:         '#C89B3C',   // warm gold accent
          'gold-dim':   '#FAF0DC',   // light gold surface tint
          green:        '#15803D',   // dark green — accessible on light backgrounds
          'green-dim':  '#DCFCE7',   // light green background tint
          amber:        '#92400E',   // dark amber — accessible on light backgrounds
          red:          '#991B1B',   // dark red — accessible on light backgrounds
        },
        // Official Banzami brand system
        bz: {
          primary:       '#990011',  // burgundy — identity, CTAs, active states
          'primary-dark':'#7A000E',  // hover/pressed state
          'primary-light':'#FFF0F1', // tinted backgrounds
          bg:            '#FCF6F5',  // page background — warm ivory
          surface:       '#EAE0DF',  // card / panel backgrounds
          border:        '#D4C9C7',  // subtle borders
          text:          '#1A1A1A',  // body text
          muted:         '#6B6265',  // secondary text
          gold:          '#C89B3C',  // premium accent
          'gold-light':  '#F0E6CE',  // gold tint backgrounds
          success:       '#166534',  // confirmed / pago!
          'success-bg':  '#F0FDF4',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        // Canonical Banza brand gradients — from assets/banza/tokens/tailwind.banza.js
        'banza-brand':   'linear-gradient(145deg, #c21a2c 0%, #990011 38%, #7a000d 72%, #5e000a 100%)',
        'banza-surface': 'linear-gradient(to bottom, #ffffff 0%, #FCF6F5 55%, #d8d0cf 100%)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'bia-glow': '0 2px 8px 0 rgb(153 0 17 / 0.18)',
        'card':   '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-md':'0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'card-lg':'0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
        'primary':'0 4px 14px 0 rgb(153 0 17 / 0.25)',
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':      'fadeIn 0.5s ease-out forwards',
        'slide-up':     'slideUp 0.6s ease-out forwards',
        'flow':         'flow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' },                  '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        flow:    { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '1' } },
      },
      typography: () => ({
        banzami: {
          css: {
            '--tw-prose-body':          '#1A1A1A',
            '--tw-prose-headings':      '#1A1A1A',
            '--tw-prose-lead':          '#6B6265',
            '--tw-prose-links':         '#990011',
            '--tw-prose-bold':          '#1A1A1A',
            '--tw-prose-counters':      '#6B6265',
            '--tw-prose-bullets':       '#990011',
            '--tw-prose-hr':            '#EAE0DF',
            '--tw-prose-quotes':        '#990011',
            '--tw-prose-quote-borders': '#990011',
            '--tw-prose-captions':      '#6B6265',
            '--tw-prose-code':          '#990011',
            '--tw-prose-pre-code':      '#FCF6F5',
            '--tw-prose-pre-bg':        '#1A1A1A',
            '--tw-prose-th-borders':    '#D4C9C7',
            '--tw-prose-td-borders':    '#EAE0DF',
            maxWidth: 'none',
            a: { fontWeight: '500', textDecorationColor: 'rgb(153 0 17 / 0.4)' },
            'h1, h2, h3, h4': { letterSpacing: '-0.02em' },
            blockquote: { fontStyle: 'normal', fontWeight: '500' },
            code: { fontWeight: '500', fontSize: '0.875em' },
            'code::before': { content: 'none' },
            'code::after':  { content: 'none' },
            pre: { borderRadius: '0.875rem' },
            table: { fontSize: '0.9em' },
            'thead th': { fontWeight: '600', color: '#1A1A1A' },
          },
        },
      }),
    },
  },
  plugins: [typography],
}

export default config
