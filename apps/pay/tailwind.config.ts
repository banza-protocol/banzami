import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        banzami: {
          DEFAULT: '#B5101F',
          dark:    '#9A1B22',
          medium:  '#D7242E',
          rose:    '#FBD2D0',
        },
        gold: {
          DEFAULT: '#C89B3C',
          light:   '#D4AF5C',
        },
        black:      '#1A1A1A',
        'off-white': '#F5F3F1',
        gray: {
          100: '#F5EEED',
          200: '#E7E2DE',
          400: '#9C8483',
          600: '#534040',
          700: '#534040',
          900: '#1A1A1A',
        },
        success: {
          DEFAULT: '#166534',
          bg:      '#F0FDF4',
        },
        warning: {
          DEFAULT: '#92400E',
          bg:      '#FFFBEB',
        },
        error: {
          DEFAULT: '#DC2626',
          bg:      '#FEF2F2',
        },
      },
      fontFamily: {
        sans: ["'Inter'", '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
      borderRadius: {
        sm:    '4px',
        md:    '8px',
        lg:    '12px',
        xl:    '16px',
        '2xl': '24px',
        full:  '9999px',
      },
      boxShadow: {
        card:  '0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
        modal: '0 8px 24px rgba(0,0,0,0.12)',
      },
      backgroundImage: {
        'banzami-gradient': 'linear-gradient(135deg, #B5101F 0%, #9A1B22 100%)',
      },
      animation: {
        float:      'float 3s ease-in-out infinite',
        'fade-up':  'fade-up 0.5s ease-out both',
        sweep:      'sweep 3.5s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        sweep: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
