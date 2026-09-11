import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProof, type ProofResult, API_ENV } from '@/lib/api';
import { isProofRef } from '@/lib/proof-ref';
import { MoneyAmount } from '@/components/MoneyAmount';
import { confirmedTitle, proofRows, proofDefinitivelyAbsent } from '@/lib/proof-view';
import { proofStatusLabel } from '@/lib/status-labels';
import { TONE, TrustNote, VerdictHeader, VerifierFrame } from './verifier-parts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verificação de comprovativo',
  description: 'Confirme a autenticidade de um comprovativo Banzami no sistema oficial.',
  robots: { index: false },
};

// Query timestamp (Africa/Luanda, UTC+1). Rendered server-side per request so the
// reader knows the verification is live, not cached from a document (ADR-033 §9).
function nowWAT(): string {
  return new Date().toLocaleString('pt-PT', {
    timeZone: 'Africa/Luanda', dateStyle: 'short', timeStyle: 'short',
  });
}

// Technical status → localized label (ADR-033 §6). Internal states stay internal:
// an unknown code reads "Desconhecido", never the code itself.
const statusPT = proofStatusLabel;

// Display transforms: network is the protocol (BANZA), operator is title-cased.
function netLabel(n?: string | null): string { return (n || '').trim() ? (n as string).toUpperCase() : '—'; }
function opLabel(o?: string | null): string {
  const s = (o || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

// Maps the proof status to the public verdict.
//
// Three outcomes, not two. Red is an ACCUSATION — it tells the reader the
// document in their hand may be forged — and it may only follow a definitive
// answer from the verifier. When our own backend is unreachable, slow, or
// answering with something we cannot parse, we do not know, and saying "inválido"
// there libels a genuine receipt because of our outage. Amber says the true
// thing: not verified, and not verifiable right now.
//
// A reference that definitively does not exist never reaches this: the page
// answers it with notFound() — the same invalid-proof view (not-found.tsx), with
// an HTTP 404 instead of a 200.
function verdict(p: ProofResult): { tone: 'green' | 'yellow' | 'red'; title: string; sub: string } {
  if (p.status === 'UNAVAILABLE' || p.status === 'ERROR') {
    return {
      tone: 'yellow',
      title: 'Verificação indisponível',
      sub: 'Não foi possível verificar este comprovativo neste momento. Por segurança, não o considere validado até a verificação estar disponível.',
    };
  }
  switch (p.status) {
    case 'CONFIRMED': return { tone: 'green', title: confirmedTitle(p.operation_kind), sub: 'Esta transação existe no sistema oficial do Banzami.' };
    case 'PENDING': return { tone: 'yellow', title: p.operation_kind === 'P2P_TRANSFER' ? 'Transferência pendente' : 'Pagamento pendente', sub: 'A transação existe mas ainda não foi confirmada.' };
    case 'REVERSED': return { tone: 'red', title: p.operation_kind === 'P2P_TRANSFER' ? 'Transferência revertida' : 'Pagamento revertido', sub: 'Esta transação foi revertida — não representa um pagamento válido.' };
    default: return { tone: 'red', title: 'Comprovativo inválido', sub: `Estado: ${statusPT(p.status)}. Não representa um pagamento confirmado.` };
  }
}

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
  // A definitive "no such proof" is a 404, not a 200 page that says so. An
  // unavailable verifier is never a 404 — it stays the amber answer below.
  if (proofDefinitivelyAbsent(p)) notFound();
  const v = verdict(p);

  return (
    <VerifierFrame sandbox={API_ENV === 'SANDBOX'}>
      <VerdictHeader tone={v.tone} title={v.title} sub={v.sub} reference={isProofRef(ref) ? ref : undefined} />

      {p.exists && (
        <div style={{ padding: '8px 26px 4px' }}>
          <div style={{ padding: '10px 0 12px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9a8a8e', letterSpacing: '0.04em' }}>Valor</div>
            <div style={{ marginTop: 2 }}>
              <MoneyAmount amountMinor={p.amount ?? null} currency={p.currency} size="xl" />
            </div>
          </div>
          {proofRows(p, ref).map((r) => <Row key={r.label} label={r.label} value={r.value} mono={r.mono} />)}
          <Row label="Estado" value={statusPT(p.status)} />
          <Row label="Rede" value={netLabel(p.network)} />
          <Row label="Operador" value={opLabel(p.operator)} />
        </div>
      )}

      <TrustNote tone={v.tone} />

      {p.exists && (
        <div style={{ padding: '0 26px 22px' }}>
          {/* Integridade — plain assurance, never a hash or internal detail (ADR-033 §13). */}
          {p.status === 'CONFIRMED' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12.5, fontWeight: 800, color: TONE.green.text, marginBottom: 8 }}>
              <span>✓ Registado</span>
              <span>✓ Não alterado</span>
              <span>✓ Confirmado pelo operador</span>
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9a8a8e' }}>
            Registado no sistema oficial do Banzami · Verificado agora · {nowWAT()} (WAT)
          </div>
        </div>
      )}
    </VerifierFrame>
  );
}
