'use client';

// Shared presentational building blocks for the public Developer Documentation
// (PT /docs and EN /docs/en). Extracted VERBATIM from the original page.tsx so
// both language pages render pixel-identical primitives — same colours, same
// typography, same spacing, same components. No visual changes live here.

import type { ReactNode } from 'react';
import { CodeView, type LineMark } from '@/components/developers/code/CodeView';
import { contextFromLabel, langFromLabel, type CodeLang } from '@/components/developers/code/highlight';

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
// No 'coming soon' and no 'Production in preparation': Financial Live is not
// ready and requires institutional approval, and the documentation says so in
// words where it matters (Do Sandbox ao Live) rather than as a promise badge.
export type Tone = 'ok' | 'val';
export const BADGES: Record<Tone, { label: string; bg: string; bd: string; fg: string; dot: string }> = {
  ok: { label: 'Disponível em Sandbox', bg: '#EAF7F0', bd: '#CFE9DA', fg: '#1F8A5B', dot: '#1F8A5B' },
  val: { label: 'Em validação contínua no Sandbox', bg: '#FDF3E2', bd: '#F7E4CB', fg: '#B8770A', dot: '#E0930F' },
};

// English labels for the SAME badge tones (colours/styles identical).
export const BADGE_LABELS_EN: Record<Tone, string> = {
  ok: 'Available in Sandbox',
  val: 'Under continuous validation in Sandbox',
};

export function Badge({ tone, children }: { tone: Tone; children?: ReactNode }) {
  const b = BADGES[tone];
  return (
    <span data-environment-badge data-toc-ignore style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 30, background: b.bg, border: `1px solid ${b.bd}`, fontSize: 11, fontWeight: 800, letterSpacing: '.01em', color: b.fg, whiteSpace: 'nowrap' }}>
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
  <code data-inline-code style={{ fontFamily: mono, fontSize: '0.86em', background: '#F7F2F2', border: '1px solid #ECE3E4', color: '#3a2e32', padding: '0 5px', borderRadius: 5, fontWeight: 500, overflowWrap: 'break-word', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{children}</code>
);
/** A page section: the level under the page's h1, and what "On this page" lists. */
export const H2 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h2 id={id} style={{ scrollMarginTop: 80, margin: '34px 0 10px', fontSize: 19, fontWeight: 650, letterSpacing: '-.005em', color: INK }}>{children}</h2>
);
/** A subsection inside an H2 section — an endpoint, an error family. */
export const H3 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h3 id={id} style={{ scrollMarginTop: 80, margin: '24px 0 8px', fontSize: 17, fontWeight: 650, color: INK }}>{children}</h3>
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

// -- Code ------------------------------------------------------------------------
// Every code example renders through the shared CodeView (DOCS-VISUAL-DX-002):
// server-rendered syntax highlighting, a language tag, copy of the raw source.
// The legacy label "curl · POST /v1/x" still works: its first part names the
// language, the rest becomes the context. Pass `lang` to say it explicitly.
export function CodeBlock({ label, raw, lang, status, marks, buttonText = 'Copiar' }: {
  label: string;
  raw: string;
  lang?: CodeLang;
  status?: ReactNode;
  marks?: LineMark[];
  /** Kept for existing call sites; copying is handled by CodeView. */
  onCopy?: (t: string, l: string) => void;
  toastText?: string;
  buttonText?: string;
}) {
  const language = lang ?? langFromLabel(label);
  const context = lang ? label : contextFromLabel(label);
  return <CodeView raw={raw} lang={language} context={context} status={status} marks={marks} ui={buttonText === 'Copy' ? 'en' : 'pt'} />;
}

export { CodeTabs } from '@/components/developers/code/CodeView';
export type { CodeTab, LineMark } from '@/components/developers/code/CodeView';

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
