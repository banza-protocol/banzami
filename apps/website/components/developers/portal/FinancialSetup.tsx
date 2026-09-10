'use client';

import { useCallback, useEffect, useState } from 'react';
import { developerApi, ApiError, type FinancialSetupState, type ProjectReadiness } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { useToast } from './Toast';
import { Card } from './ui';

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

/**
 * Sandbox financial setup — the step that used to be invisible.
 *
 * A project created here has no financial environment until someone asks for
 * one. Until this existed, that someone was an operator, through an internal
 * route: the developer could not perform it, could not request it, and could not
 * see it pending. Balances and Transactions simply said not-found, and the only
 * way to learn why was to ask a human.
 *
 * So this card is the missing half of that fix. It names the state, says what
 * the state means, and offers the action — and it says nothing about merchants,
 * wallets or bindings, because those are how it works rather than what a
 * developer needs to know.
 */

type Load =
  | { k: 'loading' }
  | { k: 'ready'; setup: FinancialSetupState }
  | { k: 'error'; message: string };

export function useFinancialSetup(projectID: string | undefined) {
  const [state, setState] = useState<Load>({ k: 'loading' });

  const load = useCallback(async () => {
    if (!projectID) return;
    try {
      setState({ k: 'ready', setup: await developerApi.financialSetup(projectID) });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      setState({
        k: 'error',
        message: code === 'NOT_FOUND'
          ? 'Não tem acesso a este projeto.'
          : 'Não foi possível ler o estado do ambiente financeiro.',
      });
    }
  }, [projectID]);

  useEffect(() => { setState({ k: 'loading' }); void load(); }, [load]);
  return { state, reload: load };
}

const LABEL: Record<string, string> = {
  UNCONFIGURED: 'Não configurado',
  READY: 'Pronto',
  SEALED: 'Pronto · destino fixado',
  UNAVAILABLE: 'Indisponível',
};

/**
 * The card a developer sees on a project with no financial environment yet.
 *
 * Rendered by the pages that cannot work without one, in place of their own
 * content — showing an empty balance list or "0 Kz" would be answering a
 * question that has not been asked yet.
 */
export function FinancialSetupCard({
  setup,
  onConfigured,
}: {
  setup: FinancialSetupState;
  onConfigured: () => void;
}) {
  const { activeProject, csrf } = useDeveloperData();
  const { flash } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unavailable = setup.state === 'UNAVAILABLE';

  async function configure() {
    if (!activeProject || busy) return;
    setBusy(true);
    setError('');
    try {
      await developerApi.configureFinancialSetup(activeProject.id, csrf);
      flash('Ambiente financeiro do Sandbox configurado');
      onConfigured();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      setError(
        code === 'SANDBOX_ONLY'
          ? 'Esta operação existe apenas no Sandbox.'
          : code === 'SETUP_UNAVAILABLE'
            ? 'A configuração automática não está disponível nesta instalação.'
            : code === 'FORBIDDEN'
              ? 'O seu papel neste workspace não permite configurar o ambiente financeiro.'
              : 'Não foi possível configurar agora. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ padding: 26, maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Ambiente financeiro do Sandbox</h2>
        <span
          style={{
            padding: '3px 10px', borderRadius: 30, fontSize: 11.5, fontWeight: 800,
            background: unavailable ? '#F3EDEC' : '#FFF1F0',
            color: unavailable ? '#6a5a5e' : '#B5101F',
          }}
        >
          {LABEL[setup.state] ?? setup.state}
        </span>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: '#6a5a5e', fontWeight: 600 }}>
        {unavailable
          ? 'Esta instalação não configura ambientes financeiros de Sandbox. Nada do que faça aqui pode alterar isso.'
          : 'Este projeto ainda não tem ambiente financeiro. Configure-o para abrir contas, receber pagamentos de teste e usar saldos, transações, webhooks e reembolsos.'}
      </p>

      {!unavailable && (
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: '#8a7a7e', fontWeight: 600 }}>
          O dinheiro do Sandbox é fictício. Isto <strong>não</strong> activa pagamentos reais — o acesso a
          dinheiro real é um processo separado e continua indisponível.
        </p>
      )}

      {error && (
        <p role="alert" style={{ margin: '14px 0 0', fontSize: 13.5, color: '#B5101F', fontWeight: 700, lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      {!unavailable && (
        setup.can_configure ? (
          <button
            onClick={() => void configure()}
            disabled={busy}
            aria-describedby="fin-setup-note"
            style={{
              marginTop: 18, padding: '11px 20px', border: 'none', borderRadius: 11,
              background: busy ? '#E7D9D7' : ctaGradient, color: busy ? '#a89a9e' : '#fff',
              fontSize: 14, fontWeight: 800, cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'A configurar…' : 'Configurar ambiente financeiro'}
          </button>
        ) : (
          <p id="fin-setup-note" style={{ margin: '16px 0 0', fontSize: 13.5, color: '#8a7a7e', fontWeight: 700 }}>
            O seu papel neste workspace ({setup.role}) não permite esta configuração. Peça a um Owner ou
            Admin do workspace.
          </p>
        )
      )}
      {!unavailable && setup.can_configure && (
        <p id="fin-setup-note" style={{ margin: '10px 0 0', fontSize: 12, color: '#a89a9e', fontWeight: 700 }}>
          Demora alguns segundos. Pode repetir sem risco — configurar duas vezes não cria dois ambientes.
        </p>
      )}
    </Card>
  );
}

/** A one-line status for a project that is already set up. */
export function FinancialSetupStatus({ setup }: { setup: FinancialSetupState }) {
  if (setup.state !== 'SEALED') return null;
  return (
    <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#8a7a7e', fontWeight: 700 }}>
      Ambiente financeiro pronto. O destino deste projeto ficou fixado no primeiro pagamento emitido e já
      não pode mudar.
    </p>
  );
}

/**
 * What each blocker means, in the developer's terms. The codes are the
 * refusals settlement returns; an unknown one is still shown, by its code,
 * and still blocks.
 */
const BLOCKER: Record<string, string> = {
  FINANCIAL_SETUP_NOT_CONFIGURED: 'O projeto ainda não tem ambiente financeiro.',
  WALLET_MISSING: 'O projeto não tem uma carteira activa em Kwanza.',
  PRICING_NOT_CONFIGURED: 'O Banzami ainda não atribuiu um preço a este projeto. Contacte o suporte.',
  PRICING_CONFIGURATION_ERROR: 'O preço atribuído a este projeto está mal configurado. Contacte o suporte.',
  FEE_DESTINATION_NOT_FOUND: 'O destino da taxa não tem uma carteira activa em Kwanza.',
  FEE_DESTINATION_NOT_OWNED: 'O destino da taxa não pertence a este projeto.',
  FEE_DESTINATION_NOT_BUSINESS_ACCOUNT: 'O destino da taxa não é uma conta Business.',
  FEE_DESTINATION_NOT_ACTIVE: 'A conta de destino da taxa não está activa.',
  FEE_DESTINATION_KYB_NOT_APPROVED: 'A verificação (KYB) do destino da taxa não está aprovada.',
  FEE_DESTINATION_WALLET_UNAVAILABLE: 'A carteira do destino da taxa não está activa.',
  FEE_DESTINATION_TYPE_NOT_ALLOWED: 'A conta ainda não foi classificada pelo Banzami para receber taxas de aplicação. Contacte o suporte.',
};

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #F3EDEC', fontSize: 13.5 }}>
      <span style={{ color: '#8a7a7e', fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 800, color: ok === false ? '#B5101F' : '#2b1d20' }}>{value}</span>
    </div>
  );
}

const yes = (b: boolean) => (b ? 'Sim' : 'Não');

/**
 * Whether a configured project can settle, and what stops it.
 *
 * The same answer an integration reads with its key (GET /v1/financial-setup):
 * the Console renders it and decides nothing. It names the project's @banza and
 * the operator's pricing, and nothing behind the project.
 */
export function FinancialReadinessPanel({ setup }: { setup: FinancialSetupState }) {
  if (setup.state !== 'READY' && setup.state !== 'SEALED') return null;
  if (setup.readiness_unavailable || !setup.readiness) {
    return (
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: '#8a7a7e', fontWeight: 700 }}>
          Não foi possível ler a prontidão para liquidação agora. Isto não significa que falte configuração — tente mais tarde.
        </p>
      </Card>
    );
  }
  const r: ProjectReadiness = setup.readiness;
  const fd = r.fee_destination;
  const bps = (v: number | null) => (v === null ? '—' : `${(v / 100).toLocaleString('pt-PT')}%`);
  return (
    <Card style={{ padding: 22, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>Prontidão para liquidação</h2>
        <span
          style={{
            padding: '3px 10px', borderRadius: 30, fontSize: 11.5, fontWeight: 800,
            background: r.settlement.ready ? '#EEF7EF' : '#FFF1F0',
            color: r.settlement.ready ? '#1E6B34' : '#B5101F',
          }}
        >
          {r.settlement.ready ? 'Pronto para liquidar' : 'Bloqueado'}
        </span>
      </div>
      <div style={{ marginTop: 12 }}>
        <Row label="Identidade financeira" value={r.financial_identity.handle ?? '—'} />
        <Row label="Verificação (KYB)" value={r.kyb.status ?? '—'} ok={r.kyb.status === 'APPROVED'} />
        <Row label="Carteira" value={`${r.wallet.status ?? '—'} · ${r.wallet.currency}`} ok={r.wallet.ready} />
        <Row label="Preço atribuído" value={r.pricing.profile ?? 'Não atribuído'} ok={r.pricing.profile !== null} />
        <Row label="Taxa de liquidação · levantamento" value={`${bps(r.pricing.settlement_bps)} · ${bps(r.pricing.payout_bps)}`} />
        <Row
          label="Destino da taxa"
          value={fd.required ? `${fd.handle ?? '—'} · ${fd.eligible ? 'elegível' : 'não elegível'}` : 'Não necessário (sem taxa)'}
          ok={fd.required ? fd.eligible : undefined}
        />
      </div>
      {r.settlement.blockers.length > 0 && (
        <ul role="list" aria-label="Bloqueios" style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 13.5, color: '#B5101F', fontWeight: 700, lineHeight: 1.6 }}>
          {r.settlement.blockers.map((b) => (
            <li key={b}>{BLOCKER[b] ?? b} <code style={{ fontSize: 11.5, color: '#8a7a7e' }}>{b}</code></li>
          ))}
        </ul>
      )}
      {r.settlement.warnings.includes('WEBHOOK_ENDPOINT_MISSING') && (
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 700 }}>
          Sem endpoint de webhook: a sua aplicação só saberá que uma liquidação terminou se a consultar.
        </p>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 12, color: '#a89a9e', fontWeight: 700 }}>
        {fd.required ? '' : `Sem taxa de aplicação no preço atual${fd.type_allowed ? '' : '; a classificação para receber taxas não é necessária'}. `}
        O preço é atribuído pelo Banzami; a sua aplicação nunca envia uma taxa. A mesma resposta está em GET /v1/financial-setup.
      </p>
    </Card>
  );
}
