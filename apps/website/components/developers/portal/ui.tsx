import type { CSSProperties, ReactNode } from 'react';

// Small shared building blocks for the portal pages — the white card and the
// reusable status pill. Colours are verbatim from the dossier token table.

export const CARD: CSSProperties = {
  background: '#fff',
  border: '1px solid #F2E2E0',
  borderRadius: 18,
  boxShadow: '0 18px 44px -38px rgba(181,16,31,.4)',
};

export function Card({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return <div style={{ ...CARD, ...style }}>{children}</div>;
}

export type PillKind = 'success' | 'pending' | 'error' | 'neutral';

const PILL: Record<PillKind, { bg: string; color: string; dot: string }> = {
  success: { bg: '#EAF7F0', color: '#1F8A5B', dot: '#1F8A5B' },
  pending: { bg: '#FDF3E2', color: '#B8770A', dot: '#E0930F' },
  error: { bg: '#FDECEC', color: '#C4303C', dot: '#C4303C' },
  neutral: { bg: '#F3EDEC', color: '#8a7a7e', dot: '#b8a4a6' },
};

export function Pill({
  kind,
  dot = false,
  children,
}: {
  kind: PillKind;
  dot?: boolean;
  children: ReactNode;
}) {
  const c = PILL[kind];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: dot ? '3px 9px' : '3px 9px',
        borderRadius: 30,
        background: c.bg,
        fontSize: 11.5,
        fontWeight: 800,
        color: c.color,
      }}
    >
      {dot ? <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot }} /> : null}
      {children}
    </span>
  );
}

// Form building blocks for the Console's longer forms (Configuração financeira).
// Plain style objects, like the rest of the portal: no CSS framework in play.

export const CTA_GRADIENT = 'linear-gradient(160deg,#B5101F,#7C1016)';

export const FIELD_LABEL: CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 800, color: '#6a5a5e', marginBottom: 6,
};

export const FIELD_INPUT: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid #EBDBD9', borderRadius: 10,
  fontSize: 14, fontWeight: 600, color: '#2a2024', background: '#fff', fontFamily: 'inherit',
};

export const FIELD_ERROR: CSSProperties = {
  margin: '6px 0 0', fontSize: 12.5, color: '#B5101F', fontWeight: 700,
};

export const FIELD_HINT: CSSProperties = {
  margin: '6px 0 0', fontSize: 12, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.5,
};

export function primaryButton(busy = false): CSSProperties {
  return {
    padding: '11px 20px', border: 'none', borderRadius: 11,
    background: busy ? '#E7D9D7' : CTA_GRADIENT, color: busy ? '#a89a9e' : '#fff',
    fontSize: 14, fontWeight: 800, cursor: busy ? 'wait' : 'pointer',
  };
}

export const SECONDARY_BUTTON: CSSProperties = {
  padding: '10px 16px', border: '1.5px solid #EBDBD9', borderRadius: 11, background: '#fff',
  fontSize: 13.5, fontWeight: 800, color: '#B5101F', cursor: 'pointer',
};

/**
 * A contextual link from a Console screen to the documentation that explains
 * it (DOCS-PROD-001 §62). Same origin, same tab: the docs are part of the
 * product, not a destination somewhere else.
 */
export function DocsLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} data-docs-link style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 24, color: '#B5101F', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
