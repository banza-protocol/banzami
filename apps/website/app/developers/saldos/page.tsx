'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { formatMoneyDisplay as money } from '@/lib/money';
import { Card, Pill } from '@/components/developers/portal/ui';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';
import { FinancialReadinessPanel, FinancialSetupPointer, useFinancialSetup } from '@/components/developers/portal/FinancialSetup';
import { WalletAccountForm } from '@/components/developers/portal/WalletAccountForm';
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
  // Not an error. The project does not receive into a Business yet, which is a
  // state with a name and a way forward — rendered as a pointer to the
  // Configuração financeira page, because an empty account list would answer a
  // question that has not been asked.
  | { k: 'setup' }
  | { k: 'ready'; accounts: WalletAccount[]; total: number; next: string };

function Balances() {
  const { activeProject } = useDeveloperData();
  const fin = useFinancialSetup(activeProject?.id);
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
      if (code === 'PROJECT_FINANCIAL_SETUP_REQUIRED') { setState({ k: 'setup' }); return; }
      setState({
        k: 'error',
        message:
          // PROJECT_FINANCIAL_SETUP_REQUIRED is not an error the developer has to
          // read: it is a state with a way forward, and the pointer below renders
          // it instead. This message only covers the cases that are not that.
          code === 'NOT_FOUND'
            ? 'Não tem acesso a este projeto.'
            : code === 'FORBIDDEN'
              ? 'Não tem acesso aos saldos deste projeto.'
              : 'Não foi possível carregar os saldos. Tente novamente.',
      });
    }
  }, [activeProject]);

  useEffect(() => { setState({ k: 'loading' }); void load(); }, [load]);

  if (!activeProject) return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>Nenhum projeto selecionado.</p>;
  if (state.k === 'loading') return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar os saldos…</p>;

  // The project does not receive into a Business yet. Show where it stands and
  // the way to the Configuração financeira page — not an empty list, not an error.
  if (state.k === 'setup') {
    if (fin.state.k !== 'ready') {
      return <p style={{ margin: 0, fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>A carregar o estado do projeto…</p>;
    }
    return <FinancialSetupPointer setup={fin.state.setup} />;
  }

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

  const reload = () => { setState({ k: 'loading' }); void load(); };

  // PRIMARY is the account made with the project's financial environment. It is
  // the operator's bookkeeping, not something the developer opened, so a project
  // with only a PRIMARY has not created any account yet and is shown the empty
  // state rather than a furnished-looking list.
  //
  // That distinction belongs to the empty-state decision and nowhere else. It
  // used to drive the count above the table too, while the table listed every
  // account — so a project with two of its own accounts read "2 contas neste
  // projeto" above three rows, the third being the one holding all the money.
  const own = state.accounts.filter((a) => a.purpose !== 'PRIMARY');

  const readiness = fin.state.k === 'ready' ? <FinancialReadinessPanel setup={fin.state.setup} /> : null;

  if (own.length === 0) {
    return (
      <>
        {readiness}
        <Card style={{ padding: 26, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Ainda não criou nenhuma conta.</p>
          <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.6 }}>
            Uma conta mantém dinheiro separado do resto do projeto — uma por campanha, por vendedor, por
            evento, ou pelo que a sua aplicação precisar de manter à parte. Pode criá-la aqui ou pela API.
          </p>
        </Card>
        <WalletAccountForm onCreated={reload} />
      </>
    );
  }

  return (
    <>
      {readiness}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#8a7a7e', fontWeight: 700 }}>
          {state.accounts.length} conta{state.accounts.length === 1 ? '' : 's'} neste projeto
        </p>
        <WalletAccountForm onCreated={reload} />
      </div>
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
                  <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                    {a.purpose}
                    {a.purpose === 'PRIMARY' ? (
                      // Say whose account this is. It is in the list because it
                      // holds money and hiding it would be worse — a developer
                      // would see every account at 0 Kz after a payment landed —
                      // but they did not open it, and the name does not say so.
                      <span style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 700, color: '#a89a9e' }}>
                        aberta com o ambiente financeiro
                      </span>
                    ) : null}
                  </td>
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
