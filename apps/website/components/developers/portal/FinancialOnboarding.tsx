'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import type { FinancialSetupState, OnboardingApplication, OnboardingBusiness, OnboardingRequirement } from '@/lib/developer-api';
import { resubmitApplication } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/developer-roles';
import { kybStatusLabel } from '@/lib/status-labels';
import {
  INFORMATION_REQUEST_CODE,
  applicationReference,
  blockerText,
  isFinancialActor,
  onboardingHeading,
  onboardingViewOf,
  requirementReasonText,
  resubmitRefusalText,
  uploadableDocuments,
  type OnboardingView,
} from '@/lib/financial-onboarding';
import { ApplicationDocuments } from './ApplicationDocuments';
import { BusinessApplicationForm } from './BusinessApplicationForm';
import { ConnectBusinessForm } from './ConnectBusinessForm';
import { FinancialReadinessPanel, FinancialSetupStatus } from './FinancialSetup';
import { Card, FIELD_ERROR, FIELD_HINT, SECONDARY_BUTTON, primaryButton } from './ui';

/**
 * Configuração financeira — how a Project gets a Business to receive into, and
 * where it stands.
 *
 * "One Business identity. Multiple onboarding surfaces. One KYB authority."
 * There are exactly two ways, both here, and neither leaves the Console:
 *
 *   A. apply for a NEW Business — the same application (fields and documents)
 *      the public form collects, decided by an operator in BANZADMIN;
 *   B. connect an EXISTING Banzami Business, with the consent code it issues
 *      from its own app.
 *
 * The page renders the server's answer (GET /projects/{id}/financial-setup) and
 * decides nothing: which state the Project is in, who may act, and what blocks
 * settlement all come from there. Only OWNER and ADMIN are offered actions;
 * everyone else reads the same state and is told who can act. The server
 * authorises every attempt regardless.
 */

type Mode = 'overview' | 'choose' | 'new' | 'connect';

const P: CSSProperties = { margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: '#6a5a5e', fontWeight: 600 };

function roleName(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** The line a member who may not act reads instead of the actions. */
function WhoCanAct({ role, doing }: { role: string; doing: string }) {
  return (
    <p data-testid="onboarding-read-only" style={{ ...P, fontSize: 13.5, color: '#8a7a7e', fontWeight: 700 }}>
      Só um Owner ou Admin do workspace pode {doing}. O seu papel neste workspace: {roleName(role)}.
    </p>
  );
}

/** The state as the API names it, for a developer matching it to GET /financial-setup. */
function StateCode({ view }: { view: OnboardingView }) {
  return (
    <code
      style={{
        padding: '3px 9px', borderRadius: 30, fontSize: 11, fontWeight: 800, background: '#F3EDEC', color: '#6a5a5e',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      }}
    >
      {view}
    </code>
  );
}

function RequirementList({
  title, items, testid,
}: { title: string; items: OnboardingRequirement[]; testid: string }) {
  if (items.length === 0) return null;
  return (
    <div data-testid={testid} style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>{title}</h3>
      <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
        {items.map((r) => (
          <li
            key={`${r.kind}:${r.code}`}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #F3EDEC', fontSize: 13.5 }}
          >
            <span style={{ fontWeight: 700, color: '#2a2024' }}>{r.label}</span>
            <span style={{ fontWeight: 800, color: r.reason.startsWith('REJECTED') || r.reason === 'MISSING' ? '#B5101F' : '#6a5a5e', textAlign: 'right' }}>
              {requirementReasonText(r.reason)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The application, as the developer quotes it to support. */
function ApplicationSummary({ app }: { app: OnboardingApplication }) {
  const submitted = app.created_at ? new Date(app.created_at) : null;
  return (
    <dl style={{ margin: '16px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
      <div>
        <dt style={{ fontSize: 11.5, fontWeight: 800, color: '#a89a9e', letterSpacing: '.04em' }}>REFERÊNCIA</dt>
        <dd
          data-testid="application-reference"
          style={{ margin: '3px 0 0', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 15, fontWeight: 800, color: '#2a2024' }}
        >
          {applicationReference(app.application_id)}
        </dd>
      </div>
      <div>
        <dt style={{ fontSize: 11.5, fontWeight: 800, color: '#a89a9e', letterSpacing: '.04em' }}>NEGÓCIO</dt>
        <dd style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 800, color: '#2a2024' }}>{app.business_name || '—'}</dd>
      </div>
      <div>
        <dt style={{ fontSize: 11.5, fontWeight: 800, color: '#a89a9e', letterSpacing: '.04em' }}>@BANZA PEDIDO</dt>
        <dd style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 800, color: '#2a2024' }}>
          {app.requested_handle ? `@${app.requested_handle.replace(/^@/, '')}` : '—'}
        </dd>
      </div>
      {submitted && !Number.isNaN(submitted.getTime()) && (
        <div>
          <dt style={{ fontSize: 11.5, fontWeight: 800, color: '#a89a9e', letterSpacing: '.04em' }}>ENVIADA EM</dt>
          <dd style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 800, color: '#2a2024' }}>
            {submitted.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}
          </dd>
        </div>
      )}
    </dl>
  );
}

/** The Business a Project receives into: public identity only. */
export function BusinessCard({ business }: { business: OnboardingBusiness }) {
  const verified = business.verified;
  return (
    <div
      data-testid="business-card"
      style={{
        marginTop: 16, padding: '14px 16px', borderRadius: 14, border: '1px solid #F2E2E0', background: '#FDFAFA',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 900, color: '#2a2024' }}>{business.name || 'Negócio Banzami'}</span>
      <span aria-hidden="true" style={{ color: '#b8a4a6' }}>·</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#6a5a5e' }}>{business.handle || '—'}</span>
      <span aria-hidden="true" style={{ color: '#b8a4a6' }}>·</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: verified ? '#1E6B34' : '#B5101F' }}>
        {verified ? 'Verificado' : `Verificação: ${kybStatusLabel(business.kyb_status)}`}
      </span>
    </div>
  );
}

/** The two ways to get a Business, as two cards. */
function PathCards({ onNew, onExisting }: { onNew: () => void; onExisting: () => void }) {
  const card = (testid: string, title: string, body: string, action: string, onClick: () => void): ReactNode => (
    <div
      data-testid={testid}
      style={{ padding: 18, borderRadius: 14, border: '1.5px solid #EBDBD9', background: '#fff', display: 'flex', flexDirection: 'column' }}
    >
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{title}</h3>
      <p style={{ ...P, fontSize: 13.5, flex: 1 }}>{body}</p>
      <button type="button" onClick={onClick} style={{ ...primaryButton(false), marginTop: 14, alignSelf: 'flex-start' }}>
        {action}
      </button>
    </div>
  );
  return (
    <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
      {card(
        'onboarding-path-new',
        'Criar/verificar um novo negócio',
        'Envie a candidatura do negócio responsável por este projeto — dados e documentos. Um operador do Banzami analisa-a; quando for aprovada, o negócio é criado e ligado a este projeto.',
        'Criar novo negócio',
        onNew,
      )}
      {card(
        'onboarding-path-existing',
        'Usar um negócio Banzami existente',
        'O negócio já tem conta Banzami Business? Peça-lhe um código de ligação na app. Nada é verificado ou criado de novo.',
        'Ligar negócio existente',
        onExisting,
      )}
    </div>
  );
}

export function FinancialOnboardingPanel({
  setup,
  projectId,
  csrf,
  onChanged,
}: {
  setup: FinancialSetupState;
  projectId: string;
  csrf: string;
  /** The Project's state may have moved: read it again. */
  onChanged: () => void;
}) {
  const view = onboardingViewOf(setup);
  const onboarding = setup.onboarding ?? null;
  const app = onboarding?.application ?? null;
  const actor = isFinancialActor(setup.role);
  // Starting or connecting: the server's can_act (OWNER/ADMIN, and the Project
  // in a state that allows it). Documents for an application in review go to
  // the Gateway by reference, so they follow the role alone.
  const canStart = actor && (onboarding ? onboarding.can_act : setup.can_configure) && view !== 'UNAVAILABLE';

  const [mode, setMode] = useState<Mode>('overview');
  const [notice, setNotice] = useState('');
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState('');

  const reload = (message?: string) => {
    setMode('overview');
    setNotice(message ?? '');
    onChanged();
  };

  async function resubmit() {
    if (!app || resubmitting) return;
    setResubmitting(true);
    setResubmitError('');
    const r = await resubmitApplication(app.application_id);
    setResubmitting(false);
    if (r.ok) {
      reload('Candidatura reenviada para análise.');
      return;
    }
    if (r.code === 'NOT_WAITING_FOR_INFORMATION') {
      reload(resubmitRefusalText(r.code));
      return;
    }
    setResubmitError(resubmitRefusalText(r.code));
  }

  // ── The two paths, full width, in place of the overview ──────────────────
  if (canStart && mode === 'new') {
    return (
      <Section view={view}>
        <BusinessApplicationForm
          projectId={projectId}
          csrf={csrf}
          onCancel={() => setMode('choose')}
          onSubmitted={(r) => reload(r.notice ?? 'Candidatura enviada. Um operador do Banzami vai analisá-la.')}
          onUseExisting={() => setMode('connect')}
          onStale={(message) => reload(message)}
        />
      </Section>
    );
  }
  if (canStart && mode === 'connect') {
    return (
      <Section view={view}>
        <ConnectBusinessForm
          projectId={projectId}
          csrf={csrf}
          onCancel={() => setMode('choose')}
          onLinked={(b) => reload(`${b.name || b.handle} está ligado a este projeto.`)}
        />
      </Section>
    );
  }

  const information = app?.requirements.errors.find((r) => r.code === INFORMATION_REQUEST_CODE);
  const infoText = information?.reason || app?.information_request || '';
  const errorsWithoutRequest = app?.requirements.errors.filter((r) => r.code !== INFORMATION_REQUEST_CODE) ?? [];
  const blockers = onboarding?.blockers?.length ? onboarding.blockers : setup.readiness?.settlement.blockers ?? [];

  const readinessBelow = view === 'READY' || view === 'BLOCKED'
    ? (
      <>
        <FinancialSetupStatus setup={setup} />
        <FinancialReadinessPanel setup={setup} showBlockers={false} />
      </>
    )
    : null;

  return (
    <Section view={view} after={readinessBelow}>
      {notice && (
        <p role="status" style={{ ...P, marginTop: 12, padding: '10px 14px', borderRadius: 11, background: '#EEF7EF', color: '#1E6B34', fontWeight: 800 }}>
          {notice}
        </p>
      )}

      {view === 'UNAVAILABLE' && (
        <p style={P}>
          Esta instalação não consegue ligar projetos a um negócio agora. Nada do que faça aqui pode alterar isso; as
          chaves de API e a integração continuam a funcionar.
        </p>
      )}

      {(view === 'NOT_CONFIGURED' || view === 'REJECTED') && (
        <>
          {view === 'REJECTED' ? (
            <>
              <p style={P}>
                O operador do Banzami recusou a candidatura deste projeto. Nenhum negócio foi criado nem ligado. Pode
                enviar uma nova candidatura ou ligar um negócio Banzami que já exista.
              </p>
              {app && <ApplicationSummary app={app} />}
            </>
          ) : (
            <p style={P}>
              Para receber pagamentos, liquidações ou taxas de aplicação, o Banzami tem de verificar a entidade legal
              responsável por este projeto.
            </p>
          )}
          <p style={{ ...P, fontSize: 13, color: '#8a7a7e' }}>
            Chaves de API, webhooks e a integração funcionam sem isto — só receber dinheiro depende desta verificação.
          </p>
          {canStart ? (
            mode === 'choose' ? (
              <>
                <PathCards onNew={() => setMode('new')} onExisting={() => setMode('connect')} />
                <button type="button" onClick={() => setMode('overview')} style={{ ...SECONDARY_BUTTON, marginTop: 14 }}>
                  Voltar
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setMode('choose')} style={{ ...primaryButton(false), marginTop: 18 }}>
                {view === 'REJECTED' ? 'Iniciar nova verificação' : 'Iniciar verificação'}
              </button>
            )
          ) : actor ? (
            <p style={{ ...P, fontSize: 13.5, color: '#8a7a7e', fontWeight: 700 }}>
              A verificação não pode ser iniciada agora. Atualize a página; se continuar, contacte o suporte.
            </p>
          ) : (
            <WhoCanAct role={setup.role} doing="iniciar a verificação" />
          )}
        </>
      )}

      {view === 'IN_REVIEW' && app && (
        <>
          <p style={P}>
            A candidatura deste projeto está com um operador do Banzami. Não precisa de fazer nada enquanto é analisada,
            a não ser enviar os documentos que ainda faltem.
          </p>
          <ApplicationSummary app={app} />
          <RequirementList title="Ainda falta enviar" items={app.requirements.currently_due} testid="requirements-due" />
          <RequirementList title="A aguardar verificação" items={app.requirements.pending_verification} testid="requirements-pending" />
          <ApplicationDocuments
            applicationId={app.application_id}
            uploadable={uploadableDocuments(app)}
            canUpload={actor}
            onUploaded={onChanged}
          />
          {!actor && <WhoCanAct role={setup.role} doing="enviar documentos" />}
        </>
      )}

      {view === 'INFORMATION_REQUIRED' && app && (
        <>
          <div
            role="note"
            data-testid="information-request"
            style={{ marginTop: 14, padding: '14px 16px', borderRadius: 12, background: '#FFF6E9', border: '1px solid #F7E4CB' }}
          >
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#B8770A', letterSpacing: '.04em' }}>O OPERADOR DO BANZAMI PEDE</p>
            <p style={{ margin: '6px 0 0', fontSize: 14.5, fontWeight: 800, color: '#2a2024', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {infoText || 'Mais informação sobre a candidatura. Reveja os requisitos abaixo.'}
            </p>
          </div>
          <ApplicationSummary app={app} />
          <RequirementList title="A corrigir" items={errorsWithoutRequest} testid="requirements-errors" />
          <RequirementList title="Ainda falta enviar" items={app.requirements.currently_due} testid="requirements-due" />
          <RequirementList title="A aguardar verificação" items={app.requirements.pending_verification} testid="requirements-pending" />
          <ApplicationDocuments
            applicationId={app.application_id}
            uploadable={uploadableDocuments(app)}
            canUpload={actor}
            onUploaded={onChanged}
          />
          {actor ? (
            <div style={{ marginTop: 20 }}>
              <button type="button" onClick={() => void resubmit()} disabled={resubmitting} style={primaryButton(resubmitting)}>
                {resubmitting ? 'A reenviar…' : 'Reenviar para análise'}
              </button>
              <p style={FIELD_HINT}>Depois de responder ao pedido e enviar o que falta, a candidatura volta para o operador.</p>
              {resubmitError && <p role="alert" style={FIELD_ERROR}>{resubmitError}</p>}
            </div>
          ) : (
            <WhoCanAct role={setup.role} doing="responder ao pedido e reenviar a candidatura" />
          )}
        </>
      )}

      {view === 'APPROVED_PROVISIONING' && (
        <>
          <p style={P}>
            O operador do Banzami aprovou a candidatura. O Banzami está a criar o negócio
            {app?.requested_handle ? ` (@${app.requested_handle.replace(/^@/, '')})` : ''} e a ligá-lo a este projeto. Não
            precisa de fazer nada — este estado muda sozinho quando terminar.
          </p>
          {app && <ApplicationSummary app={app} />}
          <button type="button" onClick={() => reload()} style={{ ...SECONDARY_BUTTON, marginTop: 18 }}>
            Atualizar estado
          </button>
        </>
      )}

      {(view === 'READY' || view === 'BLOCKED') && (
        <>
          <p style={P}>
            {view === 'READY'
              ? 'Este projeto recebe pagamentos no negócio abaixo.'
              : 'Este projeto está ligado ao negócio abaixo, mas ainda não pode liquidar. O que falta:'}
          </p>
          {onboarding?.business && <BusinessCard business={onboarding.business} />}
          {view === 'BLOCKED' && blockers.length > 0 && (
            <ul
              data-testid="onboarding-blockers"
              aria-label="Bloqueios"
              style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 13.5, color: '#B5101F', fontWeight: 700, lineHeight: 1.6 }}
            >
              {blockers.map((b) => (
                <li key={b}>
                  {blockerText(b)} <code style={{ fontSize: 11.5, color: '#8a7a7e' }}>{b}</code>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

function Section({ view, after, children }: { view: OnboardingView; after?: ReactNode; children: ReactNode }) {
  return (
    <section data-testid="financial-onboarding" data-state={view} aria-labelledby="fo-heading">
      <Card style={{ padding: 26, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 id="fo-heading" style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{onboardingHeading(view)}</h2>
          <StateCode view={view} />
        </div>
        {children}
      </Card>
      {after}
    </section>
  );
}
