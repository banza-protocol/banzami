import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'bz-primary':       '#B5101F',
        'bz-primary-light': '#F9ECEC',
        'bz-primary-hover': '#9A1B22',
        'bz-bg':            '#FCF6F5',
        'bz-surface':       '#EAE0DF',
        'bz-border':        '#D4C8C7',
        'bz-text':          '#1A1A1A',
        'bz-muted':         '#6B6467',
        'bz-gold':          '#C89B3C',
        'bz-gold-light':    '#FBF5E6',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
}

export default config
