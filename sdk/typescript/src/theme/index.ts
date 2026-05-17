// ---------------------------------------------------------------------------
// Banzami Design Tokens — TypeScript/Web
// ---------------------------------------------------------------------------
// Single source of truth for web apps (dashboard, admin, docs, developer portal).
// All values are CSS-compatible strings unless noted.

export const colors = {
  // Primary wine palette
  wine: '#B30012',
  wineDark: '#4A0005',
  wineMedium: '#8E000D',

  // Secondary
  wineRose: '#A63A50',

  // Accent — Savanna Gold
  gold: '#C89B3C',
  goldLight: '#D4AF5C',

  // Neutrals
  white: '#FFFFFF',
  offWhite: '#F5F3F1',
  gray100: '#F5EEED',
  gray400: '#9C8483',
  gray700: '#534040',
  gray900: '#1A1A1A',

  // Semantic
  success: '#1A7A4A',
  successBg: '#ECFDF5',
  warning: '#B45309',
  warningBg: '#FFFBEB',
  error: '#B91C1C',
  errorBg: '#FEF2F2',
  info: '#1E40AF',
  infoBg: '#EFF6FF',
} as const;

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",

  scale: {
    displayXl:  { fontSize: '48px', fontWeight: '700', lineHeight: '56px' },
    displayLg:  { fontSize: '36px', fontWeight: '700', lineHeight: '44px' },
    displayMd:  { fontSize: '28px', fontWeight: '600', lineHeight: '36px' },
    headingLg:  { fontSize: '22px', fontWeight: '600', lineHeight: '30px' },
    headingMd:  { fontSize: '18px', fontWeight: '600', lineHeight: '26px' },
    headingSm:  { fontSize: '16px', fontWeight: '600', lineHeight: '24px' },
    bodyLg:     { fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
    bodyMd:     { fontSize: '14px', fontWeight: '400', lineHeight: '20px' },
    bodySm:     { fontSize: '12px', fontWeight: '400', lineHeight: '18px' },
    label:      { fontSize: '12px', fontWeight: '500', lineHeight: '16px', letterSpacing: '0.3px' },
    mono:       { fontSize: '14px', fontWeight: '400', lineHeight: '20px', fontVariantNumeric: 'tabular-nums' },
    monoLg:     { fontSize: '28px', fontWeight: '600', lineHeight: '36px', fontVariantNumeric: 'tabular-nums' },
  },
} as const;

export const spacing = {
  micro: '2px',
  xs:    '4px',
  sm:    '8px',
  md:    '12px',
  lg:    '16px',
  xl:    '24px',
  xxl:   '32px',
  section: '48px',
  page:  '64px',
} as const;

export const radius = {
  sm:   '4px',
  md:   '8px',
  lg:   '12px',
  xl:   '16px',
  full: '9999px',
} as const;

export const shadows = {
  none:  'none',
  card:  '0 2px 8px rgba(0,0,0,0.08)',
  modal: '0 4px 16px rgba(0,0,0,0.12)',
} as const;

export const borders = {
  default:  `1px solid ${colors.gray100}`,
  strong:   `1px solid ${colors.gray400}`,
  focused:  `1.5px solid ${colors.wine}`,
  error:    `1.5px solid ${colors.error}`,
} as const;

// ---------------------------------------------------------------------------
// Tailwind-compatible token map
// Used in tailwind.config.ts for the dashboard and admin apps.
// ---------------------------------------------------------------------------

export const tailwindTokens = {
  colors: {
    wine: {
      DEFAULT: colors.wine,
      dark:    colors.wineDark,
      medium:  colors.wineMedium,
      rose:    colors.wineRose,
    },
    gold: {
      DEFAULT: colors.gold,
      light:   colors.goldLight,
    },
    gray: {
      100: colors.gray100,
      400: colors.gray400,
      700: colors.gray700,
      900: colors.gray900,
    },
    'off-white': colors.offWhite,
    success: {
      DEFAULT: colors.success,
      bg:      colors.successBg,
    },
    warning: {
      DEFAULT: colors.warning,
      bg:      colors.warningBg,
    },
    error: {
      DEFAULT: colors.error,
      bg:      colors.errorBg,
    },
    info: {
      DEFAULT: colors.info,
      bg:      colors.infoBg,
    },
  },
  fontFamily: {
    sans: typography.fontFamily,
    mono: typography.fontFamilyMono,
  },
  borderRadius: {
    sm:   radius.sm,
    md:   radius.md,
    lg:   radius.lg,
    xl:   radius.xl,
    full: radius.full,
  },
  boxShadow: {
    card:  shadows.card,
    modal: shadows.modal,
  },
  spacing: {
    micro:   spacing.micro,
    xs:      spacing.xs,
    sm:      spacing.sm,
    md:      spacing.md,
    lg:      spacing.lg,
    xl:      spacing.xl,
    '2xl':   spacing.xxl,
    section: spacing.section,
    page:    spacing.page,
  },
} as const;

// ---------------------------------------------------------------------------
// CSS custom properties string
// Can be injected into :root for global CSS variable access.
// ---------------------------------------------------------------------------

export const cssVariables = `
  --color-wine: ${colors.wine};
  --color-wine-dark: ${colors.wineDark};
  --color-wine-medium: ${colors.wineMedium};
  --color-wine-rose: ${colors.wineRose};
  --color-gold: ${colors.gold};
  --color-gold-light: ${colors.goldLight};
  --color-white: ${colors.white};
  --color-off-white: ${colors.offWhite};
  --color-gray-100: ${colors.gray100};
  --color-gray-400: ${colors.gray400};
  --color-gray-700: ${colors.gray700};
  --color-gray-900: ${colors.gray900};
  --color-success: ${colors.success};
  --color-warning: ${colors.warning};
  --color-error: ${colors.error};
  --color-info: ${colors.info};
  --font-sans: ${typography.fontFamily};
  --font-mono: ${typography.fontFamilyMono};
  --radius-sm: ${radius.sm};
  --radius-md: ${radius.md};
  --radius-lg: ${radius.lg};
  --radius-xl: ${radius.xl};
  --shadow-card: ${shadows.card};
  --shadow-modal: ${shadows.modal};
`;
