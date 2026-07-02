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
