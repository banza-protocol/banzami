// Financial onboarding for a Developer Project — the pure half.
//
// "One Business identity. Multiple onboarding surfaces. One KYB authority."
// A Project gets a Business to receive into in exactly two ways, both inside the
// Developers Console:
//
//   A. it applies for a NEW Business — the same application the public form
//      collects, reviewed by an operator in BANZADMIN; approval provisions the
//      Business (@banza, wallet) and binds the Project to it;
//   B. it connects an EXISTING Banzami Business, with that Business's consent:
//      a single-use code the Business issues from its own app.
//
// The one-click setup that created a synthetic, self-approved Business is
// retired (the server answers it 410 FINANCIAL_SETUP_BY_REVIEW) and nothing here
// can reach it.
//
// Everything in this module is framework-free so it can be tested without a DOM:
// which state a Project is in, what each blocker means, how a consent code is
// typed, and what each refusal says.

import type { FinancialSetupState, OnboardingApplication, OnboardingState } from './developer-api';

// ── State ──────────────────────────────────────────────────────────────────

/** The states the Financial Setup page renders: the onboarding states, plus
 *  UNAVAILABLE for a deployment that cannot onboard at all. */
export type OnboardingView = OnboardingState | 'UNAVAILABLE';

const ONBOARDING_STATES: OnboardingState[] = [
  'NOT_CONFIGURED', 'IN_REVIEW', 'INFORMATION_REQUIRED', 'APPROVED_PROVISIONING', 'REJECTED', 'READY', 'BLOCKED',
];

/**
 * Which state to render for a Project.
 *
 * The server's onboarding state is the answer, with two exceptions. A
 * deployment that cannot onboard (financial setup UNAVAILABLE) is shown as
 * that, whatever the role allows — "you may not" and "nobody can here" lead to
 * different places. And a server that predates onboarding is read from the
 * financial setup state it does send, never guessed at.
 */
export function onboardingViewOf(setup: FinancialSetupState): OnboardingView {
  if (setup.state === 'UNAVAILABLE') return 'UNAVAILABLE';
  const s = setup.onboarding?.state;
  if (s && ONBOARDING_STATES.includes(s)) return s;
  if (setup.state === 'READY' || setup.state === 'SEALED') {
    return (setup.readiness?.settlement.blockers.length ?? 0) > 0 ? 'BLOCKED' : 'READY';
  }
  return 'NOT_CONFIGURED';
}

/** Short status label, as shown after "Configuração financeira —". */
export const ONBOARDING_LABEL: Record<OnboardingView, string> = {
  NOT_CONFIGURED: 'Não configurado',
  IN_REVIEW: 'Em análise',
  INFORMATION_REQUIRED: 'Informação pedida',
  APPROVED_PROVISIONING: 'Aprovado — a concluir a configuração',
  REJECTED: 'Candidatura recusada',
  READY: 'Pronto',
  BLOCKED: 'Bloqueado',
  UNAVAILABLE: 'Indisponível',
};

/** The page heading for each state. */
export function onboardingHeading(view: OnboardingView): string {
  // Approval is the news; the heading says it on its own.
  if (view === 'APPROVED_PROVISIONING') return ONBOARDING_LABEL.APPROVED_PROVISIONING;
  return `Configuração financeira — ${ONBOARDING_LABEL[view]}`;
}

/**
 * Whether this member may start an application, connect a Business or answer
 * a reviewer. Advice to the UI only: the server authorises every attempt.
 */
export function canActOn(setup: FinancialSetupState): boolean {
  if (setup.state === 'UNAVAILABLE') return false;
  if (setup.onboarding) return setup.onboarding.can_act;
  return setup.can_configure;
}

/** OWNER and ADMIN — the same line the server draws for financial setup. */
export function isFinancialActor(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/** The application reference a developer quotes to support: 8 characters. */
export function applicationReference(applicationId: string): string {
  return applicationId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

// ── Readiness blockers ─────────────────────────────────────────────────────

/**
 * What each readiness blocker means, in the developer's terms. The codes are
 * the refusals settlement returns (core settlement_readiness.rs); an unknown
 * one is still shown, by its code, and still blocks.
 *
 * FEE_DESTINATION_TYPE_NOT_ALLOWED is NOT a verification problem: the Business
 * is verified, and what is missing is the operator's classification of the
 * account as one that may receive application fees.
 */
export const BLOCKER_TEXT: Record<string, string> = {
  FINANCIAL_SETUP_NOT_CONFIGURED: 'Este projeto ainda não está ligado a um negócio verificado.',
  WALLET_MISSING: 'O negócio não tem uma carteira activa em Kwanza.',
  PRICING_NOT_CONFIGURED: 'O Banzami ainda não atribuiu um preço a este projeto. Contacte o suporte.',
  PRICING_CONFIGURATION_ERROR: 'O preço atribuído a este projeto está mal configurado. Contacte o suporte.',
  FEE_DESTINATION_NOT_FOUND: 'O destino das taxas de aplicação não foi encontrado: não tem @banza ou conta associada.',
  FEE_DESTINATION_NOT_OWNED: 'O destino das taxas de aplicação não pertence a este projeto.',
  FEE_DESTINATION_NOT_BUSINESS_ACCOUNT: 'O destino das taxas de aplicação não é uma conta Banzami Business.',
  FEE_DESTINATION_NOT_ACTIVE: 'A conta de destino das taxas de aplicação não está activa.',
  FEE_DESTINATION_KYB_NOT_APPROVED: 'A verificação (KYB) do destino das taxas de aplicação não está aprovada.',
  FEE_DESTINATION_WALLET_UNAVAILABLE: 'A carteira do destino das taxas de aplicação não está activa.',
  FEE_DESTINATION_TYPE_NOT_ALLOWED:
    'Receber taxas de aplicação requer aprovação do operador Banzami (classificação da conta).',
  WEBHOOK_ENDPOINT_MISSING:
    'Sem endpoint de webhook: a sua aplicação só saberá que uma liquidação terminou se a consultar.',
};

export function blockerText(code: string): string {
  return BLOCKER_TEXT[code] ?? code;
}

// ── Consent code (path B) ──────────────────────────────────────────────────

/** The alphabet the Business App draws codes from: no 0/O, 1/I/L. */
const LINK_CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/;

/** What a person typed, as the server reads it: upper case, no dashes or spaces. */
export function normaliseLinkCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

/** Grouped for reading, as the Business App shows it: ABCD-EFGH-JKMN. */
export function formatLinkCode(raw: string): string {
  const c = normaliseLinkCode(raw);
  return (c.match(/.{1,4}/g) ?? []).join('-');
}

/** Twelve characters of the code alphabet. Anything else cannot be a code. */
export function isCompleteLinkCode(raw: string): boolean {
  return LINK_CODE_ALPHABET.test(normaliseLinkCode(raw));
}

// ── Refusals ───────────────────────────────────────────────────────────────

/**
 * What a refusal from either onboarding path means. Codes come through from
 * the Gateway unchanged (developer-api onboardingErr); an unknown one gets a
 * sentence that sends the developer to try again, never a raw English message.
 */
export const REFUSAL_TEXT: Record<string, string> = {
  INVALID_HANDLE: 'O @banza tem de ter 3 a 30 caracteres: letras minúsculas, números ou _.',
  VALIDATION_ERROR: 'Alguns dados não foram aceites. Reveja o formulário e tente novamente.',
  VALIDATION: 'Alguns dados não foram aceites. Reveja o formulário e tente novamente.',
  APPLICATION_IN_PROGRESS:
    'Este projeto já tem uma candidatura em curso. Aguarde a decisão do operador antes de ligar ou pedir outro negócio.',
  HANDLE_RESERVED: 'Este @banza está reservado. Escolha outro.',
  HANDLE_OWNED_BY_BUSINESS:
    'Este @banza já é de um negócio Banzami. Peça ao negócio um código e ligue-o a este projeto, em vez de criar outro.',
  HANDLE_TAKEN: 'Este @banza já não está disponível. Escolha outro.',
  PROJECT_ALREADY_RECEIVING: 'Este projeto já recebe num negócio. Mudar de negócio é uma decisão do operador.',
  ONBOARDING_UNAVAILABLE: 'A verificação de negócios não está disponível agora. Tente novamente mais tarde.',
  FORBIDDEN: 'Só um Owner ou Admin do workspace pode fazer isto.',
  LINK_CODE_INVALID:
    'O código não é válido ou já expirou. Peça ao negócio um código novo — vale 10 minutos e só pode ser usado uma vez.',
  BUSINESS_NOT_READY:
    'Este negócio ainda não pode receber pagamentos, por isso não pode ser ligado: tem de estar activo, com @banza e carteira em Kwanza.',
  RATE_LIMITED: 'Demasiados pedidos. Tente novamente daqui a pouco.',
  UNAUTHENTICATED: 'A sua sessão expirou. Inicie sessão novamente.',
  NETWORK: 'Sem ligação ao serviço. Tente novamente.',
};

export function refusalText(code: string | undefined): string {
  return (code && REFUSAL_TEXT[code]) || 'Não foi possível concluir agora. Tente novamente.';
}

/**
 * Why a requested @banza is not available (the public check-handle reasons).
 * BUSINESS is the one with somewhere to go: the @ is an existing Business's,
 * and the way to use it is that Business's consent code, not a new application.
 */
export function handleUnavailableText(reason: string | undefined): string {
  switch (reason) {
    case 'BUSINESS':
      return 'Este @ já é de um negócio — ligue-o com o código do negócio.';
    case 'TAKEN':
      return 'Este @banza já está em uso.';
    case 'RESERVED':
      return 'Este @banza está reservado.';
    case 'PENDING':
      return 'Este @banza já tem uma candidatura em curso.';
    case 'INVALID':
      return 'Use 3 a 30 caracteres: letras minúsculas, números ou _.';
    default:
      return 'Este @banza não está disponível.';
  }
}

// ── An application in review ───────────────────────────────────────────────

/**
 * One requirement's standing, in words. The Gateway's reasons are MISSING,
 * UPLOADED, ACCEPTED and REJECTED[: why]; the reviewer's request for
 * information arrives as the reviewer's own words and is shown as they are.
 */
export function requirementReasonText(reason: string): string {
  if (reason === 'MISSING') return 'Em falta';
  if (reason === 'UPLOADED') return 'Enviado · a aguardar verificação';
  if (reason === 'ACCEPTED') return 'Aceite';
  if (reason === 'REJECTED') return 'Recusado';
  if (reason.startsWith('REJECTED: ')) return `Recusado: ${reason.slice('REJECTED: '.length)}`;
  return reason;
}

/** The code the Gateway gives the reviewer's request inside `errors`. It is
 *  shown on its own, prominently, not as one more line of the list. */
export const INFORMATION_REQUEST_CODE = 'information_request';

const UPLOADABLE_TYPES = ['BUSINESS_REGISTRATION', 'REPRESENTATIVE_ID', 'TAX_ID', 'OTHER'] as const;
export type UploadableDocument = (typeof UPLOADABLE_TYPES)[number];

/**
 * Which documents may be sent for an application now: every document the
 * policy still wants (missing) or that the reviewer refused (a replacement),
 * plus the optional additional document. A document awaiting verification or
 * already accepted is not offered again.
 */
export function uploadableDocuments(app: OnboardingApplication): UploadableDocument[] {
  const wanted = [...app.requirements.currently_due, ...app.requirements.errors]
    .filter((r) => r.kind === 'document')
    .map((r) => r.code)
    .filter((c): c is UploadableDocument => (UPLOADABLE_TYPES as readonly string[]).includes(c));
  const out = [...new Set(wanted)];
  if (!out.includes('OTHER')) out.push('OTHER');
  return out;
}

/** What a refused resubmission means. */
export function resubmitRefusalText(code: string | undefined): string {
  switch (code) {
    case 'REQUIREMENTS_NOT_MET':
      return 'Ainda há requisitos por cumprir. Envie os documentos em falta ou recusados e tente novamente.';
    case 'NOT_WAITING_FOR_INFORMATION':
      return 'A candidatura já não está à espera de informação.';
    case 'APPLICATION_NOT_FOUND':
      return 'Não encontrámos esta candidatura. Atualize a página.';
    default:
      return refusalText(code);
  }
}

// ── The application form ───────────────────────────────────────────────────

/**
 * The fields the requirements policy requires, as of ao-business-2026-09.
 *
 * Used only when the policy cannot be read. The Gateway is the authority — it
 * refuses an approval whose requirements are not met, whatever this form said —
 * so the form fetches GET /v1/merchant/application-requirements and mirrors it,
 * and falls back to this copy only so that an unreachable policy does not leave
 * a form that requires nothing.
 */
export const FALLBACK_REQUIRED_FIELDS = [
  'business_name', 'desired_handle', 'category', 'email', 'phone', 'nif', 'province', 'municipality',
  'address', 'legal_representative', 'representative_role', 'business_activity', 'terms_accepted',
] as const;

export const FALLBACK_REQUIRED_DOCUMENTS = ['BUSINESS_REGISTRATION', 'REPRESENTATIVE_ID'] as const;

/** Required field and document codes from a policy (or the fallback). */
export function requiredFrom(
  policy: { items: { code: string; kind: string }[] } | null,
): { fields: Set<string>; documents: Set<string> } {
  if (!policy || policy.items.length === 0) {
    return { fields: new Set(FALLBACK_REQUIRED_FIELDS), documents: new Set(FALLBACK_REQUIRED_DOCUMENTS) };
  }
  return {
    fields: new Set(policy.items.filter((i) => i.kind === 'field').map((i) => i.code)),
    documents: new Set(policy.items.filter((i) => i.kind === 'document').map((i) => i.code)),
  };
}

/** The roles a legal representative can hold — the public form's list. */
export const REPRESENTATIVE_ROLES = ['Proprietário(a)', 'Sócio(a)', 'Gerente', 'Administrador(a)', 'Representante legal'];

/** The three document slots: two the policy requires, one optional. */
export const DOCUMENT_SLOTS: { type: 'BUSINESS_REGISTRATION' | 'REPRESENTATIVE_ID' | 'OTHER'; label: string; hint: string }[] = [
  { type: 'BUSINESS_REGISTRATION', label: 'Registo Comercial', hint: 'Certidão do registo comercial da empresa' },
  { type: 'REPRESENTATIVE_ID', label: 'Documento de identidade do representante', hint: 'BI ou Passaporte' },
  { type: 'OTHER', label: 'Documento adicional', hint: 'Licença, declaração ou outro documento relevante' },
];

export function documentLabel(type: string): string {
  return DOCUMENT_SLOTS.find((d) => d.type === type)?.label ?? type;
}

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/** PDF, JPEG or PNG, at most 5 MB. Null when acceptable. */
export function documentProblem(file: { name: string; type: string; size: number }): string | null {
  const okType = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
  if (!okType) return 'Formato inválido. Use PDF, JPEG ou PNG.';
  if (file.size > MAX_DOCUMENT_BYTES) return 'Ficheiro demasiado grande (máximo 5 MB).';
  if (file.size === 0) return 'O ficheiro está vazio.';
  return null;
}

/** What the document upload says when the deployment has no document storage. */
export const STORAGE_NOT_CONFIGURED_TEXT = 'O envio de documentos ainda não está disponível neste ambiente.';

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
/** An Angolan number: 9 digits after +244. */
export const isAngolanPhone = (s: string) => /^\d{9}$/.test(s.replace(/\D/g, ''));
/** NIF: digits only, 9 to 14 of them. */
export const isNif = (s: string) => /^\d{9,14}$/.test(s.replace(/\D/g, ''));

/** A fresh idempotency key — one per form session, never per attempt. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `fo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
