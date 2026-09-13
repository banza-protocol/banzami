import type { Config } from 'tailwindcss';

// Design tokens — verbatim from the Banzami website dossier
// (~/Downloads/design_handoff_banzami_site/README.md §"Design tokens").
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cherry red brand scale
        cherry: {
          DEFAULT: '#B5101F', // Primário (CTA, acentos, logo, ativos)
          dark: '#9A1B22', // Primário escuro (hover, texto de acento)
          deep: '#6E0E14', // Bordô profundo (gradientes)
          deeper: '#7C1016', // Bordô profundo (variante)
          coral: '#E8434B', // Coral (formas decorativas, glow)
        },
        // Pink tints (logo tiles, chips, badges)
        pink: {
          200: '#FBD2D0',
          150: '#FFE6E4',
          100: '#FFE7E5',
        },
        // Cream / off-white surfaces
        cream: {
          DEFAULT: '#FBF3F1',
          50: '#FFF7F6',
          100: '#FFF1F0',
          200: '#FFF3F1',
        },
        ink: {
          DEFAULT: '#2a2024', // Texto base
          secondary: '#6a5a5e', // Texto secundário
          nav: '#5a4a4e', // Links de nav
          soft: '#7a6a6e',
          muted: '#9a8a8e', // labels, captions
        },
        received: '#1f7a45', // Verde (valores recebidos na app)
        border: {
          soft: '#F3E3E1',
          softer: '#F0D6D4',
        },
      },
      fontFamily: {
        sans: ["'Nunito'", "'Nunito Fallback'", 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        pill: '30px', // botões / pílulas
        nav: '40px', // navbar flutuante
        card: '22px', // cartões / mega-menu
        tile: '10px', // logo tile
      },
      boxShadow: {
        cta: '0 8px 18px -6px rgba(181,16,31,.5)',
        mega: '0 30px 70px -30px rgba(122,16,22,.35)',
        card: '0 14px 30px -26px rgba(181,16,31,.3)',
      },
      maxWidth: {
        container: '1140px',
      },
      // Navbar glass border (README: rgba(150,0,20,.08))
      borderColor: {
        glass: 'rgba(150,0,20,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
