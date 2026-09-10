'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { formatMoneyDisplay } from '@/lib/money';
import { Card, Pill } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { FinancialSetupPointer, useFinancialSetup } from '@/components/developers/portal/FinancialSetup';
import { developerApi, ApiError, type DeveloperTransaction } from '@/lib/developer-api';
import { RefundDialog } from '@/components/developers/portal/RefundDialog';

// Transações — the money that moved under this project.
//
// Deliberately not the same page as Registos. The API log answers "which
// requests arrived"; this answers "which operations happened". They diverge
// constantly: a request that returns 400 is in the log and moved nothing, and a
// refund settled by an operator moved money without any request from you.
//
// Three released types, each keeping its own name. Flattening a payment and a
// refund into "transaction" would erase the distinction the page exists to show.
// Filters are sent to the server: filtering a capped page in the browser answers
// a different question, and answers it wrongly as soon as there is history.

const mono = "'JetBrains Mono', ui-monospace, monospace";

// The canonical Money Engine, not a local copy of it. The copy that used to be
// here formatted through toLocaleString('pt-PT'), which carries CLDR's
// minimumGroupingDigits: 2 — so 50 000 Kz grouped and 3 000 Kz did not, in the
// same column, and which amounts grouped depended on the browser's ICU data.
//
// A session opened without a fixed amount has no amount yet; "0 Kz" would be a
// figure where there is not one, so it gets words.
const money = (minor: number | null, currency: string) =>
  minor === null || minor === undefined ? 'Em aberto' : formatMoneyDisplay(minor, currency);


// A payment can be given back once it has actually been paid. Every other status
// is a payment that never moved money, and offering to refund one would be
// offering an operation that cannot succeed.
// Visually hidden, still announced. The actions column needs a header a screen
// reader can read out — an empty <th> leaves the cell under it unlabelled — and
// a visible one would be a column title over a single button.
const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

const PAID = ['PAID', 'COMPLETED', 'SUCCEEDED', 'SETTLED'];
// Money can be given back once it has actually been received. For an externally
// acquired payment that is true while the protocol status still reads ACTIVE, so
// asking `status` alone would refuse to refund payments the merchant is holding.
function refundable(t: DeveloperTransaction): boolean {
  if (t.type !== 'payment') return false;
  return PAID.includes(t.status.toUpperCase()) || t.acquiring?.state === 'PAID';
}

const TYPES = [
  { v: '', label: 'Todos' },
  { v: 'payment', label: 'Pagamentos' },
  { v: 'refund', label: 'Reembolsos' },
  { v: 'transfer', label: 'Transferências' },
];

const TYPE_LABEL: Record<string, string> = {
  payment: 'Pagamento', refund: 'Reembolso', transfer: 'Transferência',
};

function kindOf(status: string): 'success' | 'pending' | 'error' | 'neutral' {
  const s = status.toUpperCase();
  if (['PAID', 'COMPLETED', 'SUCCEEDED', 'SETTLED'].includes(s)) return 'success';
  if (['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED'].includes(s)) return 'error';
  if (['PENDING', 'CREATED', 'PROCESSING'].includes(s)) return 'pending';
  return 'neutral';
}

type State =
  | { k: 'loading' }
  | { k: 'error'; message: string }
  // Not an error — the project does not receive into a Business yet. Rendered as
  // a pointer to the Configuração financeira page, because "nenhuma operação"
  // would say the question was asked and answered, and it was not.
  | { k: 'setup' }
  | { k: 'ready'; rows: DeveloperTransaction[]; next: string };

function Transactions() {
  const { activeProject } = useDeveloperData();
  const fin = useFinancialSetup(activeProject?.id);
  const [type, setType] = useState('');
  const [state, setState] = useState<State>({ k: 'loading' });
  const [more, setMore] = useState(false);
  // Whether THIS member may refund, and whether this deployment can at all.
  // Asked once per project; the server authorises again on every attempt, so a
  // stale answer here can only hide a control, never grant one.
  const [refundCap, setRefundCap] = useState<{ allowed: boolean; configured: boolean; bound: boolean } | null>(null);
  const [refunding, setRefunding] = useState<DeveloperTransaction | null>(null);

  const load = useCallback(async (cursor?: string) => {
    if (!activeProject) return;
    try {
      const r = await developerApi.listTransactions(activeProject.id, { limit: 25, cursor, type: type || undefined });
      setState((prev) => ({
        k: 'ready',
        rows: cursor && prev.k === 'ready' ? [...prev.rows, ...r.transactions] : r.transactions,
        next: r.next_cursor,
      }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      if (code === 'PROJECT_FINANCIAL_SETUP_REQUIRED') { setState({ k: 'setup' }); return; }
      setState({
        k: 'error',
        message:
          code === 'NOT_FOUND'
            ? 'Não tem acesso a este projeto.'
            : code === 'FORBIDDEN'
              ? 'Não tem acesso às operações deste projeto.'
              : 'Não foi possível carregar as operações. Tente novamente.',
      });
    }
  }, [activeProject, type]);

  useEffect(() => { setState({ k: 'loading' }); void load(); }, [load]);

  useEffect(() => {
    if (!activeProject) return;
    let live = true;
    // A failure here leaves the control hidden. That is the safe direction: the
    // page still shows every operation, and the one thing missing is a button
    // whose authority we could not confirm.
    developerApi.refundCapability(activeProject.id)
      .then((c) => { if (live) setRefundCap(c); })
      .catch(() => { if (live) setRefundCap({ allowed: false, configured: false, bound: false }); });
    return () => { live = false; };
  }, [activeProject]);

  // All three, not just the role. A project with no financial owner has taken no
  // payment, so there is nothing on this page to refund and the control would be
  // an offer the product cannot honour.
  const canRefund = Boolean(refundCap?.allowed && refundCap?.configured && refundCap?.bound);

  if (!activeProject) return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>Nenhum projeto selecionado.</p>;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TYPES.map((t) => (
          <button
            key={t.v || 'all'}
            onClick={() => setType(t.v)}
            aria-pressed={type === t.v}
            style={{
              padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 800,
              border: type === t.v ? '1.5px solid #B5101F' : '1.5px solid #EBDBD9',
              background: type === t.v ? '#FFF1F0' : '#fff',
              color: type === t.v ? '#B5101F' : '#6a5a5e',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {state.k === 'loading' && <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar as operações…</p>}

      {state.k === 'setup' && (
        fin.state.k === 'ready'
          ? <FinancialSetupPointer setup={fin.state.setup} />
          : <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar o estado do projeto…</p>
      )}

      {state.k === 'error' && (
        <Card style={{ padding: 22 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#B5101F', fontWeight: 700 }}>{state.message}</p>
          <button
            onClick={() => { setState({ k: 'loading' }); void load(); }}
            style={{ marginTop: 14, padding: '9px 15px', border: '1.5px solid #EBDBD9', borderRadius: 10, background: '#fff', fontSize: 13, fontWeight: 800, color: '#B5101F', cursor: 'pointer' }}
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {state.k === 'ready' && state.rows.length === 0 && (
        <Card style={{ padding: 26 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            {type ? 'Nenhuma operação deste tipo.' : 'Ainda não há operações neste projeto.'}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.6 }}>
            Um pagamento, um reembolso ou uma transferência entre contas aparece aqui assim que
            acontecer. Os pedidos à API que não movem dinheiro estão em Registos.
          </p>
        </Card>
      )}

      {state.k === 'ready' && state.rows.length > 0 && (
        <>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: '#FDFAFA' }}>
                    {['DATA', 'TIPO', 'REFERÊNCIA', 'MONTANTE', 'ESTADO (PROTOCOLO)', 'PAGAMENTO (OPERADOR)', ...(canRefund ? [''] : [])].map((h, i) => (
                      <th
                        key={h || `actions-${i}`}
                        scope="col"
                        style={{ textAlign: h === 'MONTANTE' ? 'right' : 'left', padding: '11px 16px', fontSize: 11, fontWeight: 800, color: '#a89a9e', letterSpacing: '.04em', borderBottom: '1px solid #F2E6E4' }}
                      >
                        {h || <span style={SR_ONLY}>Acções</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((t) => (
                    <tr key={`${t.type}-${t.id}`} style={{ borderBottom: '1px solid #F7EFEE' }}>
                      <td style={{ padding: '12px 16px', fontFamily: mono, fontSize: 12.5, color: '#5a4a4e', whiteSpace: 'nowrap' }}>
                        {t.created_at.replace('T', ' ').slice(0, 19)}Z
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{TYPE_LABEL[t.type] ?? t.type}</td>
                      <td style={{ padding: '12px 16px', fontFamily: mono, fontSize: 12, color: '#8a7a7e', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.reference_id || t.id}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {money(t.amount_minor, t.currency)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Pill kind={kindOf(t.status)}>{t.status}</Pill>
                      </td>
                      {/* The operator's execution state, in its own column.
                          Deliberately NOT merged with the protocol status beside
                          it: they can legitimately disagree, and a single cell
                          would have to pick one and hide the other — which is the
                          defect this column exists to end. */}
                      <td style={{ padding: '12px 16px' }}>
                        {t.acquiring ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span>
                              <Pill kind={t.acquiring.state === 'PAID' ? 'success' : 'neutral'}>
                                {t.acquiring.state === 'PAID' ? 'PAGO' : 'POR PAGAR'}
                              </Pill>
                            </span>
                            {t.acquiring.state === 'PAID' && (
                              <span style={{ fontSize: 11.5, color: '#8a7a7e', whiteSpace: 'nowrap' }}>
                                {t.acquiring.amount_minor !== null &&
                                  `Recebido ${formatMoneyDisplay(t.acquiring.amount_minor, t.currency)}`}
                                {t.acquiring.paid_at &&
                                  ` · ${t.acquiring.paid_at.replace('T', ' ').slice(0, 19)}Z`}
                              </span>
                            )}
                            {t.acquiring.protocol_note && (
                              <span
                                title={t.acquiring.protocol_note}
                                style={{ fontSize: 11, color: '#8a7a7e', maxWidth: 260 }}
                              >
                                O estado do protocolo mantém-se {t.status}.{' '}
                                <a
                                  href="https://github.com/banza-protocol/banza/pull/63"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#B5101F', fontWeight: 700 }}
                                >
                                  RFC-0007
                                </a>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#b9a9ad' }}>—</span>
                        )}
                      </td>
                      {canRefund && (
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {refundable(t) && (
                            <button
                              onClick={() => setRefunding(t)}
                              aria-label={`Reembolsar o pagamento ${t.reference_id || t.id}`}
                              style={{ padding: '7px 13px', border: '1.5px solid #EBDBD9', borderRadius: 9, background: '#fff', fontSize: 12.5, fontWeight: 800, color: '#B5101F', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              Reembolsar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {state.next && (
            <button
              onClick={async () => { setMore(true); await load(state.next); setMore(false); }}
              disabled={more}
              style={{ marginTop: 14, padding: '10px 18px', border: '1.5px solid #EBDBD9', borderRadius: 11, background: '#fff', fontSize: 13.5, fontWeight: 800, color: '#B5101F', cursor: more ? 'wait' : 'pointer' }}
            >
              {more ? 'A carregar…' : 'Carregar mais'}
            </button>
          )}
        </>
      )}

      {refunding && (
        <RefundDialog
          payment={refunding}
          onClose={() => setRefunding(null)}
          onRefunded={() => { setState({ k: 'loading' }); void load(); }}
        />
      )}
    </>
  );
}

export default function TransacoesPage() {
  return (
    <PortalPage active="transacoes">
      <div className="bz-view" style={{ maxWidth: 980 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Transações</h1>
        <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          Pagamentos, reembolsos e transferências entre contas deste projeto. Os pedidos à API que
          não movem dinheiro estão em Registos.
        </p>
        <Transactions />
      </div>
    </PortalPage>
  );
}
