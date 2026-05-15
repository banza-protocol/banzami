import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
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
        black:      '#1A1A1A',
        'off-white': '#FCF6F5',
        gray: {
          100: '#F5EEED',
          200: '#EBE3E2',
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
        info: {
          DEFAULT: '#1E3A8A',
          bg:      '#EFF6FF',
        },
      },
      fontFamily: {
        sans: ["'Inter'", 'sans-serif'],
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
        card:     '0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
        elevated: '0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        modal:    '0 8px 24px rgba(0,0,0,0.12)',
      },
      spacing: {
        micro: '2px', xs: '4px', sm: '8px', md: '12px',
        lg: '16px', xl: '24px', '2xl': '32px', section: '48px', page: '64px',
      },
      backgroundImage: {
        'wine-gradient': 'linear-gradient(135deg, #990011 0%, #6B000B 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
