import type { Config } from 'tailwindcss';

// Design tokens from the approved Banzami website handoff (design-handoff/README.md §3).
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Banzami red scale
        banzami: {
          DEFAULT: '#B5101F', // red/primary — brand, CTAs, eyebrows
          bright:  '#D7242E', // red/bright
          coral:   '#E8434B', // red/coral
          deep:    '#9A1B22', // red/deep — hover, gradients
          darker:  '#7C1016', // red/darker
        },
        // Pink tints
        pink: {
          200: '#FBD2D0',
          100: '#FFF1F0',
          50:  '#FFF7F6',
        },
        // Warm near-black ink scale (typography)
        ink: {
          DEFAULT:   '#2a2024',
          secondary: '#6a5a5e',
          muted:     '#7a6a6e',
          soft:      '#8a7a7e',
          faint:     '#9a8a8e',
          ghost:     '#a89a9e',
        },
        'border-soft': '#F3E3E1',
        'code-green':  '#1f9a5b',
      },
      fontFamily: {
        sans: ["'Nunito'", 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card:   '24px',
        pill:   '40px',
        phone:  '46px',
        box:    '16px',
      },
      boxShadow: {
        'card-soft': '0 14px 40px -24px rgba(181,16,31,.2)',
        'btn':       '0 14px 30px -10px rgba(181,16,31,.5)',
        'nav':       '0 10px 30px -16px rgba(181,16,31,.28)',
        'phone':     '0 40px 80px -28px rgba(181,16,31,.4)',
        'panel':     '0 30px 70px -30px rgba(181,16,31,.3)',
      },
      maxWidth: {
        container: '1140px',
      },
    },
  },
  plugins: [],
};

export default config;
