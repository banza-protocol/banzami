import type { CSSProperties, ReactNode } from 'react';
import { LiveClock } from './LiveClock';

/**
 * Shared building blocks for the homepage sections (Como funciona · Para
 * negócios · Para developers). Ported pixel-for-pixel from the design handoff
 * (handoff_home_sections/home-sections.html); values are kept exact.
 *
 * The phone mockups are decorative — screens carry aria-hidden and take no
 * keyboard focus. Animations live in globals.css (bzScanline / bzspin /
 * bzspinccw / bzdotmove) and are disabled under prefers-reduced-motion via the
 * .bzhs-root scope.
 */

export const CHERRY = '#B5101F';

// ── section pill: "01 · COMO FUNCIONA" ──────────────────────────────────────
export function SectionPill({ num, label }: { num: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 18px',
        borderRadius: '30px',
        background: '#FFF1F0',
        fontSize: '13px',
        fontWeight: 900,
        letterSpacing: '.18em',
        color: CHERRY,
      }}
    >
      <span style={{ color: '#2a2024' }}>{num}</span>
      <span style={{ color: '#2a2024' }}>·</span>
      {label}
    </span>
  );
}

// ── CTA arrow used inside the buttons ───────────────────────────────────────
export function CtaArrow({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// ── phone status bar (clock, notch, signal / wifi / battery) ────────────────
export function StatusBar({ fg, dim, nub }: { fg: string; dim: string; nub: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', fontSize: '10px', fontWeight: 700, color: fg }}>
      <LiveClock kind="hm" />
      <span style={{ width: '58px', height: '17px', borderRadius: '10px', background: '#0b0b0b' }} />
      <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <svg width="14" height="9" viewBox="0 0 14 9">
          <rect x="0" y="6" width="2.4" height="3" rx=".6" fill={fg} />
          <rect x="3.8" y="4.2" width="2.4" height="4.8" rx=".6" fill={fg} />
          <rect x="7.6" y="2.2" width="2.4" height="6.8" rx=".6" fill={fg} />
          <rect x="11.4" y="0" width="2.4" height="9" rx=".6" fill={dim} />
        </svg>
        <svg width="12" height="9" viewBox="0 0 12 9">
          <path d="M6 8.6l1.9-2.1a2.7 2.7 0 0 0-3.8 0z" fill={fg} />
          <path d="M2.6 5.1a4.9 4.9 0 0 1 6.8 0" fill="none" stroke={fg} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M.8 3.1a7.5 7.5 0 0 1 10.4 0" fill="none" stroke={fg} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <svg width="20" height="9" viewBox="0 0 20 9">
          <rect x=".6" y=".6" width="16.4" height="7.8" rx="2.2" fill="none" stroke={fg} strokeWidth="1.1" />
          <rect x="2" y="2" width="13.6" height="5" rx="1.2" fill={fg} />
          <rect x="18" y="3" width="1.4" height="3" rx=".6" fill={nub} />
        </svg>
      </span>
    </div>
  );
}

// ── the little home-indicator pill at the bottom of each screen ─────────────
export function HomeIndicator({ color }: { color: string }) {
  return (
    <span style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', width: '76px', height: '4px', borderRadius: '3px', background: color }} />
  );
}

// ── animated connector between two phones (dot runs left → right) ────────────
export function Connector({ delay }: { delay: string }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'relative', zIndex: 0, flex: 'none', width: '38px', margin: '0 -8px', alignSelf: 'center', height: '2px', background: 'linear-gradient(90deg,rgba(224,48,58,0),#E0303A)' }}
    >
      <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '10px', height: '10px', borderRadius: '50%', background: '#D8121F', boxShadow: '0 0 0 4px rgba(216,18,31,.18)', animation: `bzdotmove 3.6s ease-in-out ${delay} infinite` }} />
    </div>
  );
}

// ── the phone bezel wrapper (decorative) ────────────────────────────────────
export function Phone({ style, screenStyle, children }: { style: CSSProperties; screenStyle: CSSProperties; children: ReactNode }) {
  return (
    <div aria-hidden="true" style={{ position: 'relative', flex: 'none', width: '228px', borderRadius: '40px', background: '#0d0b0c', padding: '8px', boxShadow: '0 40px 70px -30px rgba(122,16,22,.5)', ...style }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '33px', padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system,system-ui,'Nunito',sans-serif", ...screenStyle }}>
        {children}
      </div>
    </div>
  );
}
