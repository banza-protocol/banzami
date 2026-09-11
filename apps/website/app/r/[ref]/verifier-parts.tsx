import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/site/BrandMark';

// The parts of the public verifier page that every outcome shares — the page
// itself and its not-found answer render the same frame, so a reader of an
// invalid reference sees the same official page, only with a 404 status.

export const TONE = {
  green: { bar: '#1f9d57', bg: '#ecfdf3', border: '#bbf7d0', text: '#166534' },
  yellow: { bar: '#d97706', bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  red: { bar: '#B5101F', bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
};

export type Tone = keyof typeof TONE;

/** The page frame: brand, the Sandbox disclosure, the card, the source of truth. */
export function VerifierFrame({ sandbox, children }: { sandbox: boolean; children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: '#FFF7F6', padding: '40px 20px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#2a2024', fontWeight: 900, fontSize: 20, marginBottom: 24 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 11, background: '#B5101F', boxShadow: '0 6px 14px -4px rgba(181,16,31,0.5)' }}>
            <BrandMark size={18} />
          </span>
          Banzami
        </Link>

        {sandbox && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 14px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12.5, fontWeight: 800 }}>
            🟡 SANDBOX · sem valor financeiro real
          </div>
        )}

        <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid #f1e3e3', background: '#fff', boxShadow: '0 20px 60px -30px rgba(0,0,0,0.2)' }}>
          {children}
        </div>

        {/* Fonte da verdade (ADR-033 §12) */}
        <div style={{ marginTop: 16, borderRadius: 16, border: '1px solid #f1e3e3', background: '#fff', padding: '16px 18px', boxShadow: '0 10px 30px -22px rgba(0,0,0,0.18)' }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#2a2024', marginBottom: 6 }}>Fonte da verdade</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#6b5a5e', lineHeight: 1.55 }}>
            Esta página consulta diretamente o sistema oficial do Banzami. PDFs, capturas de ecrã e imagens nunca são considerados prova — a prova oficial é sempre esta página.
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <Link href="/verificar" style={{ fontSize: 13.5, fontWeight: 800, color: '#B5101F' }}>Verificar outro comprovativo →</Link>
        </div>
      </div>
    </main>
  );
}

/** The verdict bar at the top of the card. */
export function VerdictHeader({ tone, title, sub, reference }: { tone: Tone; title: string; sub: string; reference?: string }) {
  return (
    <div style={{ background: TONE[tone].bar, color: '#fff', padding: '22px 26px' }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', opacity: 0.85 }}>VERIFICAÇÃO OFICIAL{reference ? ` · ${reference}` : ''}</div>
      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{title}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, opacity: 0.95 }}>{sub}</div>
    </div>
  );
}

/** The "do not trust screenshots" note, in the verdict's tone. */
export function TrustNote({ tone }: { tone: Tone }) {
  const t = TONE[tone];
  return (
    <div style={{ margin: '14px 26px', borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.bg, padding: '12px 14px' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>🔒 Não confie apenas em screenshots ou PDFs. Confirme sempre nesta página oficial.</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, marginTop: 3 }}>
        O documento pode ser alterado; esta verificação mostra o registo oficial no sistema seguro do Banzami.
      </div>
    </div>
  );
}

/** The invalid-proof verdict — what a reference that definitively does not exist shows. */
export const INVALID_PROOF = {
  title: 'Comprovativo inválido',
  sub: 'Este comprovativo não existe ou pode ter sido falsificado. A referência tem de estar escrita exatamente como aparece no comprovativo.',
};
