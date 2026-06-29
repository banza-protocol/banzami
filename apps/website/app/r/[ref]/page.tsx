import type { Metadata } from 'next';
import Link from 'next/link';
import { getProof, type ProofResult } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verificação de comprovativo',
  description: 'Confirme a autenticidade de um comprovativo Banzami contra o ledger imutável.',
  robots: { index: false },
};

function fmtKz(minor?: number, currency?: string): string {
  if (minor == null) return '—';
  const v = (minor / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency === 'AOA' || !currency ? 'Kz' : currency} ${v}`;
}
function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });
}

// Maps the proof status to the public verdict (green/yellow/red).
function verdict(p: ProofResult): { tone: 'green' | 'yellow' | 'red'; title: string; sub: string } {
  if (!p.exists) return { tone: 'red', title: 'Comprovativo inválido', sub: p.message || 'Este comprovativo não existe ou pode ter sido falsificado.' };
  switch (p.status) {
    case 'CONFIRMED': return { tone: 'green', title: 'Pagamento verificado', sub: 'Esta transação existe no ledger imutável do Banzami.' };
    case 'PENDING': return { tone: 'yellow', title: 'Pagamento pendente', sub: 'A transação existe mas ainda não foi confirmada.' };
    case 'REVERSED': return { tone: 'red', title: 'Pagamento revertido', sub: 'Esta transação foi revertida — não representa um pagamento válido.' };
    default: return { tone: 'red', title: 'Comprovativo inválido', sub: `Estado: ${p.status}. Não representa um pagamento confirmado.` };
  }
}

const TONE = {
  green: { bar: '#1f9d57', bg: '#ecfdf3', border: '#bbf7d0', text: '#166534' },
  yellow: { bar: '#d97706', bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  red: { bar: '#B5101F', bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
};

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: '1px solid #f3eded' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#9a8a8e' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#2a2024', fontFamily: mono ? 'JetBrains Mono, monospace' : undefined, textAlign: 'right', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  );
}

export default async function ProofPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const p = await getProof(ref);
  const v = verdict(p);
  const t = TONE[v.tone];

  return (
    <main style={{ minHeight: '100vh', background: '#FFF7F6', padding: '40px 20px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#2a2024', fontWeight: 900, fontSize: 20, marginBottom: 24 }}>
          <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 10, background: '#B5101F' }} />
          Banzami
        </Link>

        <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid #f1e3e3', background: '#fff', boxShadow: '0 20px 60px -30px rgba(0,0,0,0.2)' }}>
          <div style={{ background: t.bar, color: '#fff', padding: '22px 26px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', opacity: 0.85 }}>VERIFICAÇÃO OFICIAL · {ref.toUpperCase()}</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{v.title}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, opacity: 0.95 }}>{v.sub}</div>
          </div>

          {p.exists && (
            <div style={{ padding: '8px 26px 4px' }}>
              <Row label="Valor" value={fmtKz(p.amount, p.currency)} />
              <Row label="De" value={p.payer_display ? `${p.payer_display}${p.payer_handle ? ` · @${p.payer_handle}` : ''}` : (p.payer_handle ? `@${p.payer_handle}` : '—')} />
              <Row label="Para" value={p.payee_display ? `${p.payee_display}${p.payee_handle ? ` · @${p.payee_handle}` : ''}` : (p.payee_handle ? `@${p.payee_handle}` : '—')} />
              <Row label="Referência" value={ref.toUpperCase()} mono />
              <Row label="Método" value={p.method} />
              {p.description && <Row label="Descrição" value={p.description} />}
              <Row label="Confirmado em" value={fmtDate(p.confirmed_at)} />
              <Row label="Estado" value={p.status} />
              <Row label="Rede" value={p.network} />
              <Row label="Operador" value={p.operator} />
            </div>
          )}

          <div style={{ margin: '14px 26px', borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.bg, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>🔒 Não confie apenas em screenshots ou PDFs.</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, marginTop: 3 }}>
              Confirme sempre o comprovativo nesta página oficial. O documento pode ser alterado; esta verificação mostra o registo real no ledger imutável.
            </div>
          </div>

          {p.exists && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: '0 26px 22px', fontSize: 12, fontWeight: 700, color: '#9a8a8e' }}>
              <span>Registado no ledger imutável</span>
              {p.proof_hash_short && <span>· hash {p.proof_hash_short}</span>}
              {typeof p.verification_count === 'number' && <span>· verificado {p.verification_count}×</span>}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <Link href="/verificar" style={{ fontSize: 13.5, fontWeight: 800, color: '#B5101F' }}>Verificar outro comprovativo →</Link>
        </div>
      </div>
    </main>
  );
}
