/**
 * Banza Design Tokens — TypeScript
 *
 * Canonical visual identity for the Banza payment network.
 * Single source of truth. Import from here, never define inline.
 *
 * Usage:
 *   import { BanzaColors, BanzaGradients, BanzaIcon } from '@/banza.tokens'
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const BanzaColors = {
  /** Primary brand color — Space Cherry. Use for CTAs, active states, key UI. */
  primary:         '#990011',
  /** Cherry Highlight — lighter cherry for gradients, hover, elevated surfaces. */
  primaryHighlight: '#c21a2c',
  /** Deep Shadow — darkest cherry. Pressed states, depth, icon shadows. */
  primaryShadow:   '#5e000a',
  /** Mid-tone cherry — interpolated between primary and shadow for gradients. */
  primaryMid:      '#7a000d',
  /** Soft White — warm light surface. Default page background in light mode. */
  surfaceLight:    '#FCF6F5',
  /** Soft Neutral Shadow — borders, dividers, muted text on light surfaces. */
  surfaceNeutral:  '#d8d0cf',
  /** Near Black — primary text. Warmer and more refined than pure black. */
  nearBlack:       '#1a1a1a',
  /** Pure white — only for icon foreground elements and modal backgrounds. */
  white:           '#ffffff',
} as const;

export type BanzaColor = typeof BanzaColors[keyof typeof BanzaColors];

// ---------------------------------------------------------------------------
// Gradients
// ---------------------------------------------------------------------------

export const BanzaGradients = {
  /**
   * Brand Gradient — canonical Banza surface.
   * Use for: splash screens, hero sections, QR frames, payment confirmation.
   */
  brand:   'linear-gradient(145deg, #c21a2c 0%, #990011 38%, #7a000d 72%, #5e000a 100%)',
  /**
   * Light Surface Gradient — canonical light mode surface.
   * Use for: card backs, modal backgrounds, dashboard panels.
   */
  surface: 'linear-gradient(to bottom, #ffffff 0%, #FCF6F5 55%, #d8d0cf 100%)',
} as const;

// ---------------------------------------------------------------------------
// Icon geometry
// ---------------------------------------------------------------------------

export const BanzaIcon = {
  /** Apple-standard corner radius as percentage of container size */
  cornerRadius:   '22%',
  /** Master source at 1254×1254 */
  masterSize:     1254,
  /** Recommended minimum rendered size */
  minimumSize:    32,
  shadow:         '0px 1px 2px rgba(0, 0, 0, 0.08)',
  philosophy:     'Soft physical depth with restrained luxury lighting.',
} as const;

// ---------------------------------------------------------------------------
// Asset paths (relative to repo root)
// ---------------------------------------------------------------------------

export const BanzaAssets = {
  icon: {
    master: 'assets/banza/icon/banza_icon.png',
    x1024:  'assets/banza/icon/banza_icon_1024.png',
    x512:   'assets/banza/icon/banza_icon_512.png',
    x256:   'assets/banza/icon/banza_icon_256.png',
    x192:   'assets/banza/icon/banza_icon_192.png',
    x180:   'assets/banza/icon/banza_icon_180.png',
    x128:   'assets/banza/icon/banza_icon_128.png',
    x64:    'assets/banza/icon/banza_icon_64.png',
    x32:    'assets/banza/icon/banza_icon_32.png',
    x16:    'assets/banza/icon/banza_icon_16.png',
  },
  logo: {
    master: 'assets/banza/logo/banza_logo.png',
  },
  splash: {
    master: 'assets/banza/splash/banza_splash.png',
  },
} as const;

// ---------------------------------------------------------------------------
// Semantic aliases — use these in UI code, not raw hex values
// ---------------------------------------------------------------------------

export const BanzaTheme = {
  cta:          BanzaColors.primary,
  ctaHover:     BanzaColors.primaryHighlight,
  ctaPressed:   BanzaColors.primaryShadow,
  pageLight:    BanzaColors.surfaceLight,
  border:       BanzaColors.surfaceNeutral,
  text:         BanzaColors.nearBlack,
  textInverse:  BanzaColors.white,
  heroGradient: BanzaGradients.brand,
  cardGradient: BanzaGradients.surface,
} as const;
