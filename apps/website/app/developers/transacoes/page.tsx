'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card, Pill } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { developerApi, ApiError, type DeveloperTransaction } from '@/lib/developer-api';

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

function money(minor: number | null, currency: string): string {
  // A session opened without a fixed amount has none yet. "0 Kz" would be a
  // figure where there is not one.
  if (minor === null || minor === undefined) return 'Em aberto';
  const major = Math.round(minor / 100);
  const grouped = major.toLocaleString('pt-PT').replace(/ |,/g, ' ');
  return currency === 'AOA' ? `${grouped} Kz` : `${grouped} ${currency}`;
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
  | { k: 'ready'; rows: DeveloperTransaction[]; next: string };

function Transactions() {
  const { activeProject } = useDeveloperData();
  const [type, setType] = useState('');
  const [state, setState] = useState<State>({ k: 'loading' });
  const [more, setMore] = useState(false);

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
      setState({
        k: 'error',
        message:
          code === 'NOT_FOUND'
            ? 'Este projeto ainda não tem um destinatário financeiro associado, por isso não há operações para mostrar.'
            : code === 'FORBIDDEN'
              ? 'Não tem acesso às operações deste projeto.'
              : 'Não foi possível carregar as operações. Tente novamente.',
      });
    }
  }, [activeProject, type]);

  useEffect(() => { setState({ k: 'loading' }); void load(); }, [load]);

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
                    {['DATA', 'TIPO', 'REFERÊNCIA', 'MONTANTE', 'ESTADO'].map((h) => (
                      <th key={h} scope="col" style={{ textAlign: h === 'MONTANTE' ? 'right' : 'left', padding: '11px 16px', fontSize: 11, fontWeight: 800, color: '#a89a9e', letterSpacing: '.04em', borderBottom: '1px solid #F2E6E4' }}>
                        {h}
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
