import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wine: {
          DEFAULT: '#6D071A',
          dark:    '#4B0911',
          medium:  '#8E1026',
        },
        copper: {
          DEFAULT: '#C56A2D',
          light:   '#D4834A',
        },
        'off-white': '#F6F4F1',
        gray: {
          100: '#F0EDEA',
          400: '#9E9A96',
          700: '#4A4744',
          900: '#1A1816',
        },
      },
    },
  },
  plugins: [],
};

export default config;
