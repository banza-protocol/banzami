import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wine: {
          DEFAULT: '#990011',
          dark:    '#6B000B',
          medium:  '#B5001A',
        },
        'off-white': '#FCF6F5',
        gray: {
          100: '#F5EEED',
          200: '#EBE3E2',
          400: '#9C8483',
          600: '#534040',
          700: '#534040',
          900: '#1C0D0D',
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
        'wine-gradient': 'linear-gradient(135deg, #990011 0%, #6B000B 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
