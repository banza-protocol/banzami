'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { formatMoneyDisplay as money } from '@/lib/money';
import { Card, Pill } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { developerApi, ApiError, type WalletAccount } from '@/lib/developer-api';

// Saldos — the wallet accounts of the financial owner this project is bound to.
//
// This was a placeholder. What replaces it asks the platform, and shows what
// comes back: one row per account, with the balance summed from the ledger in
// the same query that lists it. Nothing is totalled in the browser, because a
// browser can only add up the page it happens to be holding.
//
// The failure states are separate on purpose. An account list that renders
// "0 Kz" when the request failed is worse than an error, because zero is a
// number a developer will act on.

const mono = "'JetBrains Mono', ui-monospace, monospace";

// The canonical Money Engine, not a local copy of it. The copy that used to be
// here formatted through toLocaleString('pt-PT'), which carries CLDR's
// minimumGroupingDigits: 2 — so 50 000 Kz grouped and 3 000 Kz did not, in the
// same column, and which amounts grouped depended on the browser's ICU data.

type State =
  | { k: 'loading' }
  | { k: 'error'; message: string }
  | { k: 'ready'; accounts: WalletAccount[]; total: number; next: string };

function Balances() {
  const { activeProject } = useDeveloperData();
  const [state, setState] = useState<State>({ k: 'loading' });
  const [more, setMore] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    if (!activeProject) return;
    try {
      const r = await developerApi.listBalances(activeProject.id, { limit: 25, cursor });
      setState((prev) => ({
        k: 'ready',
        accounts: cursor && prev.k === 'ready' ? [...prev.accounts, ...r.accounts] : r.accounts,
        total: r.total,
        next: r.next_cursor,
      }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      setState({
        k: 'error',
        message:
          code === 'NOT_FOUND'
            ? 'Este projeto ainda não tem um destinatário financeiro associado, por isso não há contas para mostrar.'
            : code === 'FORBIDDEN'
              ? 'Não tem acesso aos saldos deste projeto.'
              : 'Não foi possível carregar os saldos. Tente novamente.',
      });
    }
  }, [activeProject]);

  useEffect(() => { setState({ k: 'loading' }); void load(); }, [load]);

  if (!activeProject) return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>Nenhum projeto selecionado.</p>;
  if (state.k === 'loading') return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar os saldos…</p>;

  if (state.k === 'error') {
    return (
      <Card style={{ padding: 22 }}>
        <p style={{ margin: 0, fontSize: 14, color: '#B5101F', fontWeight: 700 }}>{state.message}</p>
        <button
          onClick={() => { setState({ k: 'loading' }); void load(); }}
          style={{ marginTop: 14, padding: '9px 15px', border: '1.5px solid #EBDBD9', borderRadius: 10, background: '#fff', fontSize: 13, fontWeight: 800, color: '#B5101F', cursor: 'pointer' }}
        >
          Tentar novamente
        </button>
      </Card>
    );
  }

  if (state.accounts.length === 0) {
    return (
      <Card style={{ padding: 26 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Ainda não há contas neste projeto.</p>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.6 }}>
          Uma conta é criada quando a sua integração abre uma — por exemplo, uma conta por campanha
          ou por vendedor. Assim que existir uma, aparece aqui com o saldo real.
        </p>
      </Card>
    );
  }

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#8a7a7e', fontWeight: 700 }}>
        {state.total} conta{state.total === 1 ? '' : 's'} neste projeto
      </p>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#FDFAFA' }}>
                {['CONTA', 'FINALIDADE', 'REFERÊNCIA', 'SALDO', 'ESTADO'].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: h === 'SALDO' ? 'right' : 'left', padding: '11px 16px', fontSize: 11, fontWeight: 800, color: '#a89a9e', letterSpacing: '.04em', borderBottom: '1px solid #F2E6E4' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.accounts.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #F7EFEE' }}>
                  <td style={{ padding: '12px 16px', fontFamily: mono, fontSize: 12.5, color: '#5a4a4e' }}>
                    {a.label || a.id}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700 }}>{a.purpose}</td>
                  <td style={{ padding: '12px 16px', fontFamily: mono, fontSize: 12, color: '#8a7a7e', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.reference_id || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {money(a.balance_minor, a.currency)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Pill kind={a.status === 'ACTIVE' ? 'success' : 'neutral'}>{a.status}</Pill>
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
  );
}

export default function SaldosPage() {
  return (
    <PortalPage active="saldos">
      <div className="bz-view" style={{ maxWidth: 980 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Saldos</h1>
        <p style={{ margin: '6px 0 22px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
          As contas do destinatário financeiro a que este projeto está ligado, e o que cada uma
          tem. Em Sandbox, nenhum destes valores é dinheiro real.
        </p>
        <Balances />
      </div>
    </PortalPage>
  );
}
