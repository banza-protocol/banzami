'use client';

// Shared presentational building blocks for the public Developer Documentation
// (PT /docs and EN /docs/en). Extracted VERBATIM from the original page.tsx so
// both language pages render pixel-identical primitives — same colours, same
// typography, same spacing, same components. No visual changes live here.

import type { ReactNode } from 'react';

export const RED = '#B5101F';
export const INK = '#2a2024';
export const MUT = '#8a7a7e';
export const mono = "'JetBrains Mono', ui-monospace, monospace";
export const BANZAMI_URL = 'https://banzami.com';

// -- Status vocabulary (fixed) --------------------------------------------------
export type Tone = 'ok' | 'val' | 'soon' | 'prep';
export const BADGES: Record<Tone, { label: string; bg: string; bd: string; fg: string; dot: string }> = {
  ok: { label: 'Disponível em Sandbox', bg: '#EAF7F0', bd: '#CFE9DA', fg: '#1F8A5B', dot: '#1F8A5B' },
  val: { label: 'Em validação contínua no Sandbox', bg: '#FDF3E2', bd: '#F7E4CB', fg: '#B8770A', dot: '#E0930F' },
  soon: { label: 'Brevemente', bg: '#F3EDEC', bd: '#EBDBD9', fg: '#6a5a5e', dot: '#a89a9e' },
  prep: { label: 'Produção em preparação', bg: '#FFF1F0', bd: '#F7DAD7', fg: '#9A1B22', dot: '#B5101F' },
};

// English labels for the SAME badge tones (colours/styles identical).
export const BADGE_LABELS_EN: Record<Tone, string> = {
  ok: 'Available in Sandbox',
  val: 'Under continuous validation in Sandbox',
  soon: 'Coming soon',
  prep: 'Production in preparation',
};

export function Badge({ tone, children }: { tone: Tone; children?: ReactNode }) {
  const b = BADGES[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 30, background: b.bg, border: `1px solid ${b.bd}`, fontSize: 11, fontWeight: 800, letterSpacing: '.01em', color: b.fg, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: b.dot }} />
      {children ?? b.label}
    </span>
  );
}

// -- Small presentational helpers ----------------------------------------------
export const P = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.65, color: '#5a4a4e', fontWeight: 500, maxWidth: 660, ...style }}>{children}</p>
);
export const UL = ({ children }: { children: ReactNode }) => (
  <ul style={{ margin: '0 0 14px', padding: '0 0 0 18px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</ul>
);
export const LI = ({ children }: { children: ReactNode }) => (
  <li style={{ fontSize: 14, lineHeight: 1.6, color: '#5a4a4e', fontWeight: 500 }}>{children}</li>
);
export const Code = ({ children }: { children: ReactNode }) => (
  <code style={{ fontFamily: mono, fontSize: 13, background: '#FFF1F0', color: '#9A1B22', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{children}</code>
);
export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>{children}</h2>
);
export const H3 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h3 id={id} style={{ scrollMarginTop: 80, margin: '26px 0 8px', fontSize: 16.5, fontWeight: 900, color: INK }}>{children}</h3>
);

export function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 72, marginBottom: 46 }}>
      {children}
    </section>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const c = tone === 'warn' ? { bg: '#FDF3E2', bd: '#F7E4CB', fg: '#B8770A' } : { bg: '#FFF1F0', bd: '#F7DAD7', fg: '#9A1B22' };
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 14, padding: '14px 16px', margin: '0 0 16px', maxWidth: 660 }}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: c.fg, fontWeight: 700 }}>{children}</p>
    </div>
  );
}

export const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
  color: '#7a6a6e', textDecoration: 'none', padding: '3px 9px', borderRadius: 8,
};

// -- Dark code block with copy + toast -----------------------------------------
export function CodeBlock({ label, raw, onCopy, toastText = 'Copiado para a área de transferência', buttonText = 'Copiar' }: { label: string; raw: string; onCopy: (t: string, l: string) => void; toastText?: string; buttonText?: string }) {
  return (
    <div style={{ background: '#2A1E20', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px -34px rgba(0,0,0,.5)', margin: '0 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8434B' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FBD2D0' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#5a4a4e' }} />
        <span style={{ marginLeft: 6, fontFamily: mono, fontSize: 11.5, color: '#b8a4a6', fontWeight: 600 }}>{label}</span>
        <button
          type="button"
          onClick={() => onCopy(raw, toastText)}
          className="bz-icobtn"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="#fff" strokeWidth="1.9" />
            <path d="M5 15V5a2 2 0 012-2h8" stroke="#fff" strokeWidth="1.9" />
          </svg>
          {buttonText}
        </button>
      </div>
      <pre style={{ margin: 0, padding: 20, fontFamily: mono, fontSize: 12.5, lineHeight: 1.7, color: '#EDE3E1', overflowX: 'auto', whiteSpace: 'pre' }}>{raw}</pre>
    </div>
  );
}

// -- P3B UX helpers (reuse existing tokens/styles; no new visual system) --------

// A concise "what this page is for" lede — the soft orientation line each area
// page opens with. Same muted intro style already used across the docs.
export function PageLede({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: '2px 0 14px', fontSize: 14.5, lineHeight: 1.6, color: MUT, fontWeight: 600, maxWidth: 660 }}>{children}</p>
  );
}

// A compact "next" row of inline links, in the existing red link style.
export function NextSteps({ label, links }: { label: string; links: { href: string; text: string }[] }) {
  return (
    <p style={{ margin: '0 0 20px', fontSize: 13, color: '#8a7a7e', fontWeight: 600, maxWidth: 660 }}>
      {label}{' '}
      {links.map((l, i) => (
        <span key={l.href}>
          {i > 0 ? ' · ' : ''}
          <a href={l.href} style={{ color: RED, fontWeight: 800, textDecoration: 'none' }}>{l.text}</a>
        </span>
      ))}
    </p>
  );
}
