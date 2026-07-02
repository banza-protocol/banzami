// Banzami Developers portal — inline SVG icons.
// Faithful port of the icons in design_handoff_banzami_developers
// (Banzami Developers.dc.html). All are stroke="currentColor" so callers
// control colour via `color`/style; stroke widths are baked per the dossier.

import type { CSSProperties } from 'react';

type IconProps = { size?: number; style?: CSSProperties; className?: string };

function S({
  size = 18,
  style,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* ── Brand logo tile (4 rounded rects on a red tile) ───────────────────────── */
export function BrandTile({ size = 34, radius = 11 }: { size?: number; radius?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: '#B5101F',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 18px -6px rgba(181,16,31,.5)',
        flex: 'none',
      }}
    >
      <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <rect x="6" y="6" width="42" height="42" rx="13" fill="#fff" />
        <rect x="56" y="10" width="32" height="32" rx="10" fill="#FBD2D0" />
        <rect x="10" y="56" width="38" height="38" rx="11" fill="#FBD2D0" />
        <rect x="58" y="60" width="28" height="28" rx="9" fill="#fff" />
      </svg>
    </span>
  );
}

/* ── Navigation icons (stroke: currentColor) ───────────────────────────────── */
export const IconGrid = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
  </S>
);
export const IconWallet = (p: IconProps) => (
  <S {...p}>
    <path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="16.5" cy="12" r="1.6" fill="currentColor" />
  </S>
);
export const IconSwap = (p: IconProps) => (
  <S {...p}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconUsers = (p: IconProps) => (
  <S {...p}>
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3.5 19a5.5 5.5 0 0111 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M16 6.2a3 3 0 010 5.6M17 13.5a5.5 5.5 0 013.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </S>
);
export const IconKey = (p: IconProps) => (
  <S {...p}>
    <circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M11.5 12H21l-2 2m-3-2l-2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconWebhook = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="7" r="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9.3 8.6l-3 5.2M14.7 8.6l3 5.2M8 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="6" cy="17" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="18" cy="17" r="2.4" stroke="currentColor" strokeWidth="1.8" />
  </S>
);
export const IconList = (p: IconProps) => (
  <S {...p}>
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 8.5h8M8 12h8M8 15.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </S>
);
export const IconDoc = (p: IconProps) => (
  <S {...p}>
    <path d="M5 4.5A1.5 1.5 0 016.5 3H14l5 5v10.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 18.5v-14z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </S>
);
export const IconGear = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18 6l-1.8 1.8M7.8 16.2L6 18M18 18l-1.8-1.8M7.8 7.8L6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </S>
);
export const IconHelp = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9.2 9.5a2.8 2.8 0 015.4 1c0 1.8-2.6 2-2.6 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
  </S>
);

/* ── Chrome + shared icons ─────────────────────────────────────────────────── */
export const IconBriefcase = (p: IconProps) => (
  <S {...p}>
    <path d="M4 7h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.7" />
  </S>
);
export const IconChevronDown = (p: IconProps) => (
  <S {...p}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconChevronUpDown = (p: IconProps) => (
  <S {...p}>
    <path d="M8 9l4 4 4-4M8 15l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconChevronLeft = (p: IconProps) => (
  <S {...p}>
    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconBolt = (p: IconProps) => (
  <S {...p}>
    <path d="M13 3l-2 9h6l-8 9 2-9H5l8-9z" fill="currentColor" />
  </S>
);
export const IconBell = (p: IconProps) => (
  <S {...p}>
    <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M10 19a2 2 0 004 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </S>
);
export const IconArrowRight = (p: IconProps) => (
  <S {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconFlask = (p: IconProps) => (
  <S {...p}>
    <path d="M9 3h6v4l4 8a3 3 0 01-2.7 4.3H7.7A3 3 0 015 15l4-8V3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M8 3h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </S>
);
export const IconCheck = (p: IconProps & { strokeWidth?: number }) => (
  <S {...p}>
    <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth={p.strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconCopy = (p: IconProps & { strokeWidth?: number }) => (
  <S {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth={p.strokeWidth ?? 1.7} />
    <path d="M5 15V5a2 2 0 012-2h8" stroke="currentColor" strokeWidth={p.strokeWidth ?? 1.7} />
  </S>
);
export const IconEye = (p: IconProps) => (
  <S {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
  </S>
);
export const IconRotate = (p: IconProps) => (
  <S {...p}>
    <path d="M20 11a8 8 0 10-1 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M20 5v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconLock = (p: IconProps) => (
  <S {...p}>
    <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 10V7.5a4 4 0 018 0V10" stroke="currentColor" strokeWidth="1.8" />
  </S>
);
export const IconShield = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </S>
);
export const IconPlus = (p: IconProps) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </S>
);
export const IconSearch = (p: IconProps) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
    <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </S>
);
export const IconCalendar = (p: IconProps) => (
  <S {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </S>
);
export const IconDownload = (p: IconProps) => (
  <S {...p}>
    <path d="M12 3v11M8 10l4 4 4-4M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconEnvelope = (p: IconProps & { strokeWidth?: number }) => (
  <S {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" strokeWidth={p.strokeWidth ?? 1.7} />
    <path d="M4 8l8 5 8-5" stroke="currentColor" strokeWidth={p.strokeWidth ?? 1.7} strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconEnvelopeOpen = (p: IconProps) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 7l8 5.5L20 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconClock = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconCircle = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
  </S>
);
export const IconChart = (p: IconProps) => (
  <S {...p}>
    <path d="M4 19V5M4 15l5-5 4 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconCode = (p: IconProps) => (
  <S {...p}>
    <path d="M8 6l-4 6 4 6M16 6l4 6-4 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconWebhookNodes = (p: IconProps) => (
  <S {...p}>
    <circle cx="12" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="6" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="18" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.8" />
  </S>
);
export const IconTransfer = (p: IconProps) => (
  <S {...p}>
    <path d="M4 12h13l-3-3M20 12H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </S>
);
export const IconDocLines = (p: IconProps) => (
  <S {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </S>
);
export const IconUsers2 = (p: IconProps) => (
  <S {...p}>
    <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3.5 19a5.5 5.5 0 0111 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </S>
);
