'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, HelpCircle, Link2, Mail, Search } from 'lucide-react';
import {
  AdminApi,
  AdminApiError,
  type ApplicationBusinessState,
  type LinkCandidate,
  type MerchantApplication,
} from '@/lib/admin-api';
import { useToast } from '@/components/ui/toast';
import { useDialog } from '@/components/ui/dialog';
import { accountTypeLabel, withAt } from '@/lib/format';

/**
 * The application lifecycle, as an operator works it.
 *
 * One review for every application: SUBMITTED → UNDER_REVIEW → APPROVED or
 * REJECTED. An approval is resolved one of two ways, and the operator chooses:
 *
 *   - Aprovar (nova conta): provision a NEW Business Account — merchant,
 *     wallet, the requested @handle, a Business App login. Always the default
 *     class; APPLICATION/PLATFORM is a separate, privileged decision.
 *   - Associar a conta existente: the Business already exists. The
 *     application's reviewed documents and approval are attached to it;
 *     nothing is created, no handle moves, no Project is rebound. The target is
 *     chosen deliberately and confirmed by typing its @handle, with a reason.
 *
 * Every refusal the server makes is shown as it made it — "documents missing",
 * "this handle already belongs to a Business" — never as a generic failure.
 */

const REFUSALS: Record<string, string> = {
  DOCUMENTS_REQUIRED: 'Faltam documentos obrigatórios (Registo Comercial e documento do representante).',
  REQUIREMENTS_NOT_MET: 'A candidatura ainda não cumpre os requisitos (há dados ou documentos em falta ou recusados). Veja «Requisitos».',
  MESSAGE_REQUIRED: 'Diga o que falta — o requerente recebe este pedido por email.',
  HANDLE_OWNED_BY_BUSINESS: 'O @handle pedido já pertence a uma Business Account. Associe a candidatura a essa conta.',
  LINK_REQUIRED: 'O requerente declarou que a Business já existe: associe-a à conta existente em vez de criar outra.',
  HANDLE_TAKEN: 'O @handle pedido já não está reservado para esta candidatura.',
  LINK_TARGET_INVALID: 'Essa Business Account não pode receber esta candidatura (inativa, sem @handle, ou não é a dona do @handle pedido).',
  CONFIRMATION_MISMATCH: 'A confirmação não corresponde ao @handle da conta escolhida.',
  NOT_LINKABLE: 'Esta candidatura não pode ser associada (aprovisionamento parcial ou já resolvida).',
  NOT_OPEN: 'A candidatura não está aberta para esta ação.',
  NO_PENDING_ACTIVATION: 'Não há ativação pendente: o acesso já foi ativado ou a conta não foi criada por esta candidatura.',
  REASON_REQUIRED: 'Indique o motivo.',
};

export function refusalMessage(e: unknown, fallback: string): string {
  if (e instanceof AdminApiError) return REFUSALS[e.code] ?? (e.message || fallback);
  return fallback;
}

const btn =
  'inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-[14px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40';
const input =
  'w-full rounded-[14px] border-[1.5px] border-[#f1e3e3] bg-[#FFF7F6] px-4 py-3 text-[15px] font-semibold text-[#2a2024] outline-none transition focus:border-[#B5101F]';

export function ApplicationActions({
  api,
  app,
  onChanged,
}: {
  api: AdminApi;
  app: MerchantApplication;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const dialog = useDialog();
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const open = ['SUBMITTED', 'UNDER_REVIEW', 'PROVISIONING_FAILED'].includes(app.status);
  const canProvision = open && !app.claims_existing_business;

  async function run(key: string, fn: () => Promise<void>, failure: string) {
    setBusy(key);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      toast('danger', refusalMessage(e, failure));
    } finally {
      setBusy(null);
    }
  }

  const startReview = () =>
    run('review', async () => {
      await api.startApplicationReview(app.id);
      toast('success', 'Candidatura em análise.');
    }, 'Não foi possível iniciar a análise.');

  const approve = async () => {
    const ok = await dialog.confirm({
      title: 'Aprovar — criar nova Business Account',
      message: `Aprovar ${app.business_name} e criar uma nova Business Account com ${withAt(app.desired_handle)}: conta, carteira em AOA, acesso à app Business e o perfil de preço por omissão. A classe fica MERCHANT. A ação fica registada no log de auditoria.`,
      confirmLabel: 'Aprovar',
    });
    if (!ok) return;
    await run('approve', async () => {
      const r = await api.approveApplication(app.id);
      if (r.already_approved) {
        toast('info', 'Esta candidatura já estava aprovada — nada foi alterado.');
        return;
      }
      toast('success', 'Candidatura aprovada. Ligação de ativação enviada por email.');
      if (r.activation_url) {
        await dialog.showLink({ title: 'Ligação de ativação (Sandbox)', label: 'Entregue ao requerente para definir o PIN. Mostrada uma única vez.', url: r.activation_url });
      }
    }, 'Não foi possível aprovar a candidatura.');
  };

  const reject = async () => {
    const message = await dialog.prompt({
      title: 'Rejeitar candidatura',
      label: 'Motivo a comunicar ao requerente (será enviado por email)',
      multiline: true,
      confirmLabel: 'Rejeitar',
      required: true,
    });
    if (!message?.trim()) return;
    await run('reject', async () => {
      await api.rejectApplication(app.id, '', message.trim());
      toast('success', 'Candidatura rejeitada. Email enviado ao requerente.');
    }, 'Não foi possível rejeitar a candidatura.');
  };

  const requestInformation = async () => {
    const message = await dialog.prompt({
      title: 'Pedir informação ao requerente',
      label: 'O que falta ou tem de ser corrigido (enviado por email; a candidatura fica em espera, não é rejeitada)',
      multiline: true,
      confirmLabel: 'Pedir informação',
      required: true,
    });
    if (!message?.trim()) return;
    await run('info', async () => {
      await api.requestApplicationInformation(app.id, message.trim());
      toast('success', 'Pedido enviado ao requerente. A candidatura aguarda resposta.');
    }, 'Não foi possível pedir informação.');
  };

  const reissue = () =>
    run('reissue', async () => {
      const r = await api.reissueActivation(app.id);
      toast('success', `Nova ligação de ativação enviada para ${r.email_sent_to}.`);
      if (r.activation_url) {
        await dialog.showLink({ title: 'Nova ligação de ativação (Sandbox)', label: 'As ligações anteriores deixaram de funcionar.', url: r.activation_url });
      }
    }, 'Não foi possível reemitir a ligação.');

  return (
    <>
      {app.claims_existing_business && open && (
        <div className="mt-4 rounded-[14px] border border-[#f1d9a8] bg-[#FFF8EC] p-4 text-[13.5px] font-bold text-[#7a5a1e]">
          O requerente declarou que {withAt(app.desired_handle)} já é a sua Business Account. Esta candidatura só pode ser
          associada a essa conta — não cria outra.
        </div>
      )}
      {app.status === 'INFORMATION_REQUIRED' && app.information_request && (
        <div data-testid="information-request" className="mt-4 rounded-[14px] border border-[#f1d9a8] bg-[#FFF8EC] p-4 text-[13.5px] font-bold text-[#7a5a1e]">
          À espera do requerente — pedido: «{app.information_request}». Volta para análise quando o requerente reenviar.
        </div>
      )}
      {app.status === 'PROVISIONING_FAILED' && app.provisioning_error && (
        <div className="mt-4 rounded-[14px] border border-[#f1c4c4] bg-[#FFF1F0] p-4 text-[13.5px] font-bold text-[#9A1B22]">
          O aprovisionamento falhou ({app.provisioning_attempts ?? 1} tentativa(s)): {app.provisioning_error}. Aprovar de novo
          retoma a partir do passo que falhou, sem duplicar nada.
        </div>
      )}
      <div className="mt-[22px] flex flex-wrap gap-[10px]">
        {app.status === 'SUBMITTED' && (
          <button onClick={startReview} disabled={busy !== null} className={`${btn} border-[1.5px] border-[#f1e3e3] bg-white text-[#2a2024]`}>
            <Search size={16} /> Iniciar análise
          </button>
        )}
        <button onClick={approve} disabled={!canProvision || busy !== null} className={`${btn} bg-[#1f9d57] text-white`}
          title={app.claims_existing_business ? 'A Business já existe — associe em vez de criar' : undefined}>
          <Check size={16} strokeWidth={2.4} /> Aprovar (nova conta)
        </button>
        <button onClick={() => setLinking(true)} disabled={busy !== null || !(open || app.status === 'APPROVED')}
          className={`${btn} border-[1.5px] border-[#B5101F] bg-white text-[#B5101F]`}>
          <Link2 size={16} /> Associar a conta existente
        </button>
        {['SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUIRED'].includes(app.status) && (
          <button onClick={requestInformation} disabled={busy !== null} className={`${btn} border-[1.5px] border-[#f1d9a8] bg-white text-[#7a5a1e]`}>
            <HelpCircle size={16} /> Pedir informação
          </button>
        )}
        <button onClick={reject} disabled={!(open || app.status === 'INFORMATION_REQUIRED') || busy !== null} className={`${btn} border-[1.5px] border-[#f1c4c4] bg-white text-[#B5101F]`}>
          Rejeitar
        </button>
        {app.status === 'APPROVED' && app.resolution === 'PROVISIONED_NEW' && (
          <button onClick={reissue} disabled={busy !== null} className={`${btn} border-[1.5px] border-[#f1e3e3] bg-white text-[#7a6a6e]`}>
            <Mail size={16} /> Reemitir ativação
          </button>
        )}
      </div>
      {linking && (
        <LinkExistingPanel
          api={api}
          app={app}
          onClose={() => setLinking(false)}
          onLinked={async () => {
            setLinking(false);
            await onChanged();
          }}
        />
      )}
    </>
  );
}

function LinkExistingPanel({
  api,
  app,
  onClose,
  onLinked,
}: {
  api: AdminApi;
  app: MerchantApplication;
  onClose: () => void;
  onLinked: () => Promise<void>;
}) {
  const toast = useToast();
  const [lookup, setLookup] = useState('');
  const [candidates, setCandidates] = useState<LinkCandidate[] | null>(null);
  const [chosen, setChosen] = useState<LinkCandidate | null>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (handle?: string) => {
    try {
      const r = await api.applicationLinkCandidates(app.id, handle);
      setCandidates(r.candidates ?? []);
    } catch (e) {
      toast('danger', refusalMessage(e, 'Não foi possível procurar Business Accounts.'));
    }
  }, [api, app.id, toast]);

  useEffect(() => { void search(); }, [search]);

  const confirmOk = !!chosen && typed.trim().replace(/^@/, '').toLowerCase() === chosen.handle && reason.trim().length > 0;

  async function link() {
    if (!chosen) return;
    setBusy(true);
    try {
      const r = await api.linkApplicationToExisting(app.id, chosen.merchant_id, typed.trim(), reason.trim());
      toast('success', r.already_linked ? 'A candidatura já estava associada a esta conta.' : `Candidatura associada a ${withAt(chosen.handle)}. Nada foi criado.`);
      await onLinked();
    } catch (e) {
      toast('danger', refusalMessage(e, 'Não foi possível associar a candidatura.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-[18px] border border-[#f1e3e3] bg-[#FFFCFB] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[15px] font-black">Associar a uma Business Account existente</h3>
        <button onClick={onClose} className="text-[13px] font-extrabold text-[#9a8a8e]">Fechar</button>
      </div>
      <p className="mb-4 mt-2 text-[13px] font-semibold leading-relaxed text-[#7a6a6e]">
        Os documentos revistos e a aprovação passam a ser da conta escolhida. Não se cria conta, carteira, @handle nem acesso; nenhum
        Projeto de developer é alterado. Só uma conta que seja dona de {withAt(app.desired_handle)} (se tiver dono) pode ser escolhida.
      </p>
      <div className="mb-3 flex gap-2">
        <input className={input} placeholder="Procurar outra conta por @handle" value={lookup} onChange={(e) => setLookup(e.target.value)} />
        <button onClick={() => void search(lookup)} className={`${btn} bg-[#1a1416] text-white`}>Procurar</button>
      </div>
      {candidates && candidates.length === 0 && (
        <p className="text-[13px] font-bold text-[#9a8a8e]">Nenhuma Business Account usa esse @handle.</p>
      )}
      <div className="flex flex-col gap-2">
        {candidates?.map((c) => (
          <label key={c.merchant_id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border px-4 py-3 ${chosen?.merchant_id === c.merchant_id ? 'border-[#B5101F] bg-[#FFF1F0]' : 'border-[#f1e3e3] bg-white'}`}>
            <span className="flex items-center gap-3">
              <input type="radio" name="link-target" checked={chosen?.merchant_id === c.merchant_id} onChange={() => setChosen(c)} />
              <span>
                <span className="block text-[14px] font-extrabold">{c.name} · <span className="font-mono text-[#B5101F]">{withAt(c.handle)}</span></span>
                <span className="block text-[12.5px] font-bold text-[#9a8a8e]">
                  {c.status} · KYB {c.kyb_status} · {accountTypeLabel(c.business_account_type)}
                  {c.owns_requested_handle ? ' · dona do @handle pedido' : ''}
                </span>
              </span>
            </span>
          </label>
        ))}
      </div>
      {chosen && (
        <div className="mt-4 grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
          <label>
            <span className="mb-1.5 block text-[12px] font-extrabold uppercase text-[#8a7a7e]">Confirme escrevendo {withAt(chosen.handle)}</span>
            <input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={withAt(chosen.handle)} />
          </label>
          <label>
            <span className="mb-1.5 block text-[12px] font-extrabold uppercase text-[#8a7a7e]">Motivo</span>
            <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex.: Registo Comercial confere com a conta existente" />
          </label>
        </div>
      )}
      <button onClick={link} disabled={!confirmOk || busy} className={`${btn} mt-4 bg-[#B5101F] text-white`}>
        <Link2 size={16} /> {busy ? 'A associar…' : 'Associar'}
      </button>
    </div>
  );
}

/**
 * The whole state of the Business an application resolved to — so an operator
 * reads readiness here rather than across pages or in the database.
 */
export function BusinessStatePanel({ api, app }: { api: AdminApi; app: MerchantApplication }) {
  const [state, setState] = useState<ApplicationBusinessState | null | undefined>(undefined);
  useEffect(() => {
    if (!app.created_merchant_id) { setState(null); return; }
    void (async () => {
      try { setState((await api.applicationBusinessState(app.id)).business); } catch { setState(null); }
    })();
  }, [api, app.id, app.created_merchant_id, app.status]);

  if (state === undefined || state === null) return null;
  return (
    <div className="mb-4 rounded-[18px] border border-[#f1e3e3] bg-white p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[15px] font-black">Estado da Business</h3>
        <a href={`/businesses/${state.merchant_id}`} className="text-[13px] font-extrabold text-[#B5101F]">Abrir a Business →</a>
      </div>
      <div className="mb-3 flex justify-between gap-4 text-[14px]">
        <span className="font-bold text-[#9a8a8e]">Resolução</span>
        <span className="font-extrabold">{app.resolution === 'LINKED_EXISTING' ? 'Associada a conta existente' : 'Nova conta aprovisionada'}</span>
      </div>
      <BusinessStateRows state={state} />
    </div>
  );
}

/** Where an application came from — context for the reviewer, not a different
 *  review. A Developer Project's application binds that Project on approval. */
export function ApplicationOrigin({ app }: { app: MerchantApplication }) {
  const fromProject = app.origin === 'DEVELOPER_PROJECT';
  return (
    <div data-testid="application-origin" className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] font-extrabold">
      <span className={`rounded-full px-3 py-1 ${fromProject ? 'bg-[#EEF4FF] text-[#2f4fa3]' : 'bg-[#F4EFEF] text-[#6a5a5e]'}`}>
        {fromProject ? 'Origem: Projeto de developer' : 'Origem: formulário público'}
      </span>
      {fromProject && app.project_id && (
        <span className="font-mono text-[#7a6a6e]">projeto {app.project_id.slice(0, 8)}…</span>
      )}
      {fromProject && app.status === 'APPROVED' && (
        <span className={app.provisioning_project_bound ? 'text-[#1f9d57]' : 'text-[#B5101F]'}>
          {app.provisioning_project_bound ? 'Projeto ligado à conta' : 'Ligação ao projeto pendente — aprovar de novo tenta outra vez'}
        </span>
      )}
    </div>
  );
}

const REQ_REASON: Record<string, string> = { MISSING: 'em falta', UPLOADED: 'por verificar', ACCEPTED: 'aceite' };

/** The application against the requirements policy — the same answer the
 *  applicant and the approval read. Approval is refused while anything is
 *  missing or refused. */
export function RequirementsPanel({ app }: { app: MerchantApplication }) {
  const r = app.requirements;
  if (!r) return null;
  const group = (title: string, items: { code: string; label: string; reason: string }[], tone: string) =>
    items.length === 0 ? null : (
      <div className="mb-3">
        <div className={`mb-1 text-[12px] font-extrabold uppercase tracking-wide ${tone}`}>{title}</div>
        <ul className="m-0 list-none p-0">
          {items.map((i) => (
            <li key={i.code} className="flex justify-between gap-4 py-1 text-[13.5px]">
              <span className="font-bold text-[#2a2024]">{i.label}</span>
              <span className="text-right font-semibold text-[#7a6a6e]">{REQ_REASON[i.reason] ?? i.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  const complete = r.currently_due.length === 0 && r.errors.length === 0;
  return (
    <div data-testid="requirements-panel" className="mb-4 rounded-[18px] border border-[#f1e3e3] bg-white p-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="m-0 text-[15px] font-black">Requisitos</h3>
        <span className={`text-[12.5px] font-extrabold ${complete ? 'text-[#1f9d57]' : 'text-[#B5101F]'}`}>
          {complete ? 'Completa — pode ser decidida' : 'Incompleta — não pode ser aprovada'}
        </span>
      </div>
      {group('Em falta', r.currently_due, 'text-[#B5101F]')}
      {group('Recusado / pedido', r.errors, 'text-[#B5101F]')}
      {group('Por verificar', r.pending_verification, 'text-[#7a5a1e]')}
      {group('Aceite', r.accepted, 'text-[#1f9d57]')}
      <div className="mt-2 text-[11.5px] font-semibold text-[#a89a9e]">Política {r.policy_version}</div>
    </div>
  );
}

/** One Business's whole state — the table the Business page and the
 *  application page both render. */
export function BusinessStateRows({ state }: { state: ApplicationBusinessState }) {
  const r = state.readiness;
  const rows: [string, string, boolean?][] = [
    ['Business Account', `${state.name} · ${state.status}`],
    ['@handle', withAt(state.handle), true],
    ['Classe (ADR-028)', accountTypeLabel(state.business_account_type)],
    ['KYB', state.kyb_status],
    ['Carteira', state.wallet_status ? `${state.wallet_status} · ${state.wallet_currency}` : 'Sem carteira'],
    ['Contas na carteira', String(state.wallet_accounts)],
    ['Perfil de preço', state.pricing_profile ?? 'Não atribuído'],
    ['Acesso à app Business', state.login_activated ? 'Ativado' : state.login_exists ? 'Por ativar' : 'Sem acesso'],
    ['Projetos de developer', String(state.developer_projects)],
  ];
  if (r) {
    rows.push(['Taxa de liquidação · levantamento', `${r.pricing.settlement_bps ?? '—'} bps · ${r.pricing.payout_bps ?? '—'} bps`]);
    rows.push(['Destino de taxa', r.fee_destination.required ? (r.fee_destination.eligible ? 'Elegível' : `Bloqueado (${r.fee_destination.blocker})`) : 'Não necessário (sem taxa)']);
    rows.push(['Liquidação', r.settlement.ready ? 'Pronta' : `Bloqueada: ${r.settlement.blockers.join(', ')}`]);
  }
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3 max-[1040px]:grid-cols-1">
      {rows.map(([label, value, mono]) => (
        <div key={label} className="flex justify-between gap-4 text-[14px]">
          <span className="font-bold text-[#9a8a8e]">{label}</span>
          <span className={`text-right font-extrabold ${mono ? 'font-mono text-[#B5101F]' : 'text-[#2a2024]'}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}
