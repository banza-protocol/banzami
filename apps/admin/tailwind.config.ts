import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wine:   { DEFAULT: '#6D071A', dark: '#4B0911', medium: '#8E1026' },
        copper: { DEFAULT: '#C56A2D', light: '#D4834A' },
        'off-white': '#F6F4F1',
        gray:   { 100: '#F0EDEA', 400: '#9E9A96', 700: '#4A4744', 900: '#1A1816' },
        success: { DEFAULT: '#1A7A4A', bg: '#ECFDF5' },
        warning: { DEFAULT: '#B45309', bg: '#FFFBEB' },
        error:   { DEFAULT: '#B91C1C', bg: '#FEF2F2' },
        info:    { DEFAULT: '#1E40AF', bg: '#EFF6FF' },
      },
      fontFamily: {
        sans: ["'Inter'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
      boxShadow:    { card: '0 2px 8px rgba(0,0,0,0.08)', modal: '0 4px 16px rgba(0,0,0,0.12)' },
      spacing: {
        micro: '2px', xs: '4px', sm: '8px', md: '12px',
        lg: '16px', xl: '24px', '2xl': '32px', section: '48px', page: '64px',
      },
    },
  },
  plugins: [],
};

export default config;
