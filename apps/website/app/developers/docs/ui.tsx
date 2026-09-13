'use client';

// Shared presentational building blocks for the public Developer Documentation
// (PT /docs and EN /docs/en). Extracted VERBATIM from the original page.tsx so
// both language pages render pixel-identical primitives — same colours, same
// typography, same spacing, same components. No visual changes live here.

import type { ReactNode } from 'react';

// -- Documentation design tokens ------------------------------------------------
// Brand red identifies Banzami (logo, active navigation, primary actions). It is
// not the colour of ordinary links or informational notes: when every link and
// note is red, the page reads as a list of warnings. Semantic roles below.
export const RED = '#B5101F';            // brand
export const INK = '#241d20';            // headings, strong text
export const BODY = '#3f3538';           // body copy
export const MUT = '#6f6468';            // secondary text
export const LINK = '#9A1B22';           // links: brand-deep, underlined on hover
export const LINE = '#EAE3E3';           // neutral rules and borders
export const mono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
/** Long-form documentation type: a neutral system face, not the rounded display face of the marketing site. */
export const DOCS_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const H1_STYLE: React.CSSProperties = { margin: '0 0 8px', fontSize: 30, fontWeight: 700, letterSpacing: '-.015em', lineHeight: 1.2, color: INK };
export const TABLE: React.CSSProperties = { borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 13.5 };
export const THEAD: React.CSSProperties = { textAlign: 'left', color: MUT };
export const TH: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, fontSize: 12.5, borderBottom: `1px solid ${LINE}` };
export const TD: React.CSSProperties = { padding: '9px 10px', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top', color: BODY, lineHeight: 1.5 };
export const TD_HEAD: React.CSSProperties = { ...TD, color: INK, fontWeight: 600 };
export const TD_MONO: React.CSSProperties = { ...TD, fontFamily: mono, fontSize: 12.5, color: INK };
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
  <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.65, color: BODY, fontWeight: 400, maxWidth: 700, overflowWrap: 'break-word', ...style }}>{children}</p>
);
export const UL = ({ children }: { children: ReactNode }) => (
  <ul style={{ margin: '0 0 14px', padding: '0 0 0 20px', maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</ul>
);
export const LI = ({ children }: { children: ReactNode }) => (
  <li style={{ fontSize: 15, lineHeight: 1.6, color: BODY, fontWeight: 400, overflowWrap: 'break-word' }}>{children}</li>
);
export const Code = ({ children }: { children: ReactNode }) => (
  <code style={{ fontFamily: mono, fontSize: '0.86em', background: '#F4EFEF', color: INK, padding: '1px 5px', borderRadius: 5, fontWeight: 500, overflowWrap: 'break-word' }}>{children}</code>
);
export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: INK }}>{children}</h2>
);
export const H3 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h3 id={id} style={{ scrollMarginTop: 80, margin: '34px 0 10px', fontSize: 19, fontWeight: 650, letterSpacing: '-.005em', color: INK }}>{children}</h3>
);

export function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 72, marginBottom: 46 }}>
      {children}
    </section>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  // info: neutral note. warn: something that breaks or costs if ignored.
  const c = tone === 'warn'
    ? { bg: '#FFF8EB', bar: '#D8961E', fg: '#4A3610' }
    : { bg: '#F7F4F3', bar: '#BFB2B4', fg: INK };
  return (
    <div role="note" style={{ background: c.bg, borderLeft: `3px solid ${c.bar}`, borderRadius: 8, padding: '10px 14px', margin: '0 0 16px', maxWidth: 700 }}>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: c.fg, fontWeight: 400 }}>{children}</p>
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
    <div style={{ background: '#241C1E', borderRadius: 10, overflow: 'hidden', margin: '0 0 16px', maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        {/* The label must be allowed to shrink. Without minWidth:0 a long label
            keeps its intrinsic width in this flex row and pushes the copy button
            past the viewport — which is how /docs/reference scrolled sideways on
            a 390px phone while every container around it behaved. */}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: mono, fontSize: 11.5, color: '#b8a4a6', fontWeight: 600 }}>{label}</span>
        <button
          type="button"
          onClick={() => onCopy(raw, toastText)}
          aria-label={`${buttonText}: ${label}`}
          className="bz-icobtn"
          style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="#fff" strokeWidth="1.9" />
            <path d="M5 15V5a2 2 0 012-2h8" stroke="#fff" strokeWidth="1.9" />
          </svg>
          {buttonText}
        </button>
      </div>
      <pre tabIndex={0} style={{ margin: 0, padding: '14px 16px', fontFamily: mono, fontSize: 13, lineHeight: 1.65, color: '#EFE7E6', overflowX: 'auto', whiteSpace: 'pre' }}>{raw}</pre>
    </div>
  );
}

// -- P3B UX helpers (reuse existing tokens/styles; no new visual system) --------

// A concise "what this page is for" lede — the soft orientation line each area
// page opens with. Same muted intro style already used across the docs.
export function PageLede({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: '0 0 18px', fontSize: 17, lineHeight: 1.55, color: MUT, fontWeight: 400, maxWidth: 700 }}>{children}</p>
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
