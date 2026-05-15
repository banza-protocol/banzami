import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        wine: {
          DEFAULT: '#990011',
          dark:    '#6B000B',
          medium:  '#B5001A',
          rose:    '#A63A50',
        },
        gold: {
          DEFAULT: '#C89B3C',
          light:   '#D4AF5C',
        },
        'off-white': '#FCF6F5',
        gray: {
          100: '#F5EEED',
          200: '#EBE3E2',
          400: '#9C8483',
          600: '#534040',
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
        sm:   '4px',
        md:   '8px',
        lg:   '12px',
        xl:   '16px',
        '2xl': '24px',
        full: '9999px',
      },
      boxShadow: {
        card:     '0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
        elevated: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        modal:    '0 8px 24px rgba(0,0,0,0.12)',
      },
      backgroundImage: {
        'wine-gradient': 'linear-gradient(135deg, #990011 0%, #6B000B 100%)',
      },
      keyframes: {
        'checkmark-in': {
          from: { transform: 'scale(0)', opacity: '0' },
          to:   { transform: 'scale(1)', opacity: '1' },
        },
        'fade-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',   opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        'checkmark-in': 'checkmark-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        'fade-up':      'fade-up 0.5s ease-out forwards',
        'pulse-dot':    'pulse-dot 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
