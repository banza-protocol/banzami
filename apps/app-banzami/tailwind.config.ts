import type { Config } from 'tailwindcss';

// App Banzami Web — design tokens shared with the native app (WEB-APP-001 §8).
// The canonical source is docs/design/CONSUMER_DESIGN_SYSTEM.md.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cherry: {
          DEFAULT: '#B5101F',
          dark: '#9A1B22',
          deep: '#6E0E14',
          coral: '#E8434B',
          bright: '#D7242E',
        },
        pink: { 100: '#FDE7E5', 200: '#FBD2D0' },
        ink: { DEFAULT: '#241D20', soft: '#5A4A4E', muted: '#8A7E82' },
        cream: { 50: '#FBF9F9', 100: '#F6EFEF' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { xl2: '18px', xl3: '24px' },
    },
  },
  plugins: [],
};
export default config;
