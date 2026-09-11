'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { developerApi, ApiError, type FinancialSetupState, type ProjectReadiness } from '@/lib/developer-api';
import { ONBOARDING_LABEL, blockerText, onboardingViewOf } from '@/lib/financial-onboarding';
import { Card } from './ui';
import { accountStatusLabel, kybStatusLabel } from '@/lib/status-labels';

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

/**
 * Financial setup — whether a project receives into a Business, as the pages
 * that depend on it see it.
 *
 * A project created here has no Business to receive into. Getting one is the
 * Configuração financeira page (FinancialOnboarding.tsx): apply for a new
 * Business through the operator's review, or connect one that already exists
 * with its consent. This module is what the other pages need from that — the
 * state, a pointer to that page, and the settlement readiness of a project that
 * already receives — and it says nothing about merchants, wallets or bindings,
 * because those are how it works rather than what a developer needs to know.
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
          : 'Não foi possível ler a configuração financeira deste projeto.',
      });
    }
  }, [projectID]);

  useEffect(() => { setState({ k: 'loading' }); void load(); }, [load]);
  return { state, reload: load };
}

/**
 * What the pages that cannot work without a Business show instead of their
 * content: where the project stands, and the way to the page that changes it.
 *
 * This used to be a button that created a synthetic Business and marked it
 * verified with nobody reviewing anything. That is retired — the server answers
 * it 410 FINANCIAL_SETUP_BY_REVIEW — and a Project now applies for a Business or
 * connects one it already has, on the Configuração financeira page. Showing an
 * empty balance list or "0 Kz" here would be answering a question that has not
 * been asked yet.
 */
export function FinancialSetupPointer({ setup }: { setup: FinancialSetupState }) {
  const view = onboardingViewOf(setup);
  const unavailable = view === 'UNAVAILABLE';
  return (
    <Card style={{ padding: 26, maxWidth: 620 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Configuração financeira</h2>
        <span
          style={{
            padding: '3px 10px', borderRadius: 30, fontSize: 11.5, fontWeight: 800,
            background: unavailable ? '#F3EDEC' : '#FFF1F0',
            color: unavailable ? '#6a5a5e' : '#B5101F',
          }}
        >
          {ONBOARDING_LABEL[view]}
        </span>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: '#6a5a5e', fontWeight: 600 }}>
        {unavailable
          ? 'Esta instalação não consegue ligar projetos a um negócio. Nada do que faça aqui pode alterar isso.'
          : 'Este projeto ainda não recebe pagamentos. Para receber pagamentos, liquidações ou taxas de aplicação, o Banzami tem de verificar a entidade legal responsável por este projeto.'}
      </p>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: '#8a7a7e', fontWeight: 600 }}>
        Chaves de API e integração funcionam sem isto.
      </p>

      {!unavailable && (
        <Link
          href="/financeiro"
          style={{
            display: 'inline-block', marginTop: 18, padding: '11px 20px', borderRadius: 11,
            background: ctaGradient, color: '#fff', fontSize: 14, fontWeight: 800, textDecoration: 'none',
          }}
        >
          Abrir configuração financeira
        </Link>
      )}
    </Card>
  );
}

/** A one-line status for a project that is already set up. */
export function FinancialSetupStatus({ setup }: { setup: FinancialSetupState }) {
  if (setup.state !== 'SEALED') return null;
  return (
    <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#8a7a7e', fontWeight: 700 }}>
      Destino fixado. O negócio em que este projeto recebe ficou fixado no primeiro pagamento emitido e já
      não pode mudar.
    </p>
  );
}

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
export function FinancialReadinessPanel({
  setup,
  showBlockers = true,
}: {
  setup: FinancialSetupState;
  /** False where the page already lists the blockers on its own (Configuração
   *  financeira), so the same codes are not read out twice. */
  showBlockers?: boolean;
}) {
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
        <Row label="Verificação (KYB)" value={r.kyb.status ? capitalised(kybStatusLabel(r.kyb.status)) : '—'} ok={r.kyb.status === 'APPROVED'} />
        <Row label="Carteira" value={`${accountStatusLabel(r.wallet.status)} · ${r.wallet.currency}`} ok={r.wallet.ready} />
        <Row label="Preço atribuído" value={r.pricing.profile ?? 'Não atribuído'} ok={r.pricing.profile !== null} />
        <Row label="Taxa de liquidação · levantamento" value={`${bps(r.pricing.settlement_bps)} · ${bps(r.pricing.payout_bps)}`} />
        <Row
          label="Destino da taxa"
          value={fd.required ? `${fd.handle ?? '—'} · ${fd.eligible ? 'elegível' : 'não elegível'}` : 'Não necessário (sem taxa)'}
          ok={fd.required ? fd.eligible : undefined}
        />
      </div>
      {showBlockers && r.settlement.blockers.length > 0 && (
        <ul role="list" aria-label="Bloqueios" style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 13.5, color: '#B5101F', fontWeight: 700, lineHeight: 1.6 }}>
          {r.settlement.blockers.map((b) => (
            <li key={b}>{blockerText(b)} <code style={{ fontSize: 11.5, color: '#8a7a7e' }}>{b}</code></li>
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
