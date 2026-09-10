/**
 * The applicant's view of a Business application, by its reference.
 *
 * The reference (the application id) is the capability: whoever holds it —
 * the applicant, from the confirmation screen or the email Banzami sent — can
 * see where the application stands, what it still needs, answer a reviewer's
 * request for information and resubmit. The Gateway answers with no personal
 * data (no email, NIF or representative), so a leaked reference discloses only
 * the status of an application.
 *
 * What is required is the Gateway's decision (its requirements policy); this
 * module only reads and renders it.
 */
import { platformTarget } from './api';

export type RequirementIssue = { code: string; kind: 'field' | 'document'; label: string; reason: string };

export type ApplicationStatus = {
  application_id: string;
  status:
    | 'DRAFT'
    | 'SUBMITTED'
    | 'UNDER_REVIEW'
    | 'INFORMATION_REQUIRED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'PROVISIONING_FAILED';
  origin: 'STANDALONE_BUSINESS' | 'DEVELOPER_PROJECT';
  requested_handle: string;
  information_request?: string;
  created_at: string;
  requirements: {
    policy_version: string;
    currently_due: RequirementIssue[];
    pending_verification: RequirementIssue[];
    errors: RequirementIssue[];
    accepted: RequirementIssue[];
  };
};

/** A reference is an application id: a UUID. Anything else is not looked up. */
export function isApplicationReference(ref: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.trim());
}

export type StatusResult =
  | { ok: true; status: ApplicationStatus }
  | { ok: false; reason: 'NOT_FOUND' | 'UNAVAILABLE' };

export async function fetchApplicationStatus(ref: string): Promise<StatusResult> {
  if (!isApplicationReference(ref)) return { ok: false, reason: 'NOT_FOUND' };
  try {
    const { base } = await platformTarget();
    const res = await fetch(`${base}/v1/merchant/applications/${encodeURIComponent(ref.trim())}`);
    if (res.status === 404) return { ok: false, reason: 'NOT_FOUND' };
    if (!res.ok) return { ok: false, reason: 'UNAVAILABLE' };
    return { ok: true, status: (await res.json()) as ApplicationStatus };
  } catch {
    return { ok: false, reason: 'UNAVAILABLE' };
  }
}

export type ResubmitResult =
  | { ok: true; status: ApplicationStatus }
  | { ok: false; reason: 'REQUIREMENTS_NOT_MET' | 'NOT_WAITING' | 'UNAVAILABLE'; message: string };

export async function resubmitApplication(ref: string): Promise<ResubmitResult> {
  try {
    const { base } = await platformTarget();
    const res = await fetch(`${base}/v1/merchant/applications/${encodeURIComponent(ref)}/resubmit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) return { ok: true, status: (await res.json()) as ApplicationStatus };
    if (res.status === 422)
      return { ok: false, reason: 'REQUIREMENTS_NOT_MET', message: 'Ainda falta o que foi pedido. Envie os documentos em falta e tente de novo.' };
    if (res.status === 409)
      return { ok: false, reason: 'NOT_WAITING', message: 'Esta candidatura já não está à espera de informação.' };
    return { ok: false, reason: 'UNAVAILABLE', message: 'Não foi possível reenviar agora. Tente novamente.' };
  } catch {
    return { ok: false, reason: 'UNAVAILABLE', message: 'Sem ligação ao Banzami. Tente novamente.' };
  }
}

/** What the applicant is told, per status. Plain language, one line. */
export const STATUS_COPY: Record<ApplicationStatus['status'], { title: string; body: string }> = {
  DRAFT: { title: 'Rascunho', body: 'A candidatura ainda não foi submetida.' },
  SUBMITTED: { title: 'Recebida', body: 'A equipa Banzami vai analisar os dados e os documentos do seu negócio.' },
  UNDER_REVIEW: { title: 'Em análise', body: 'A equipa Banzami está a analisar a sua candidatura.' },
  INFORMATION_REQUIRED: {
    title: 'Precisamos de mais informação',
    body: 'A análise está em espera até responder ao pedido abaixo. A candidatura continua aberta e o @negócio continua reservado.',
  },
  APPROVED: {
    title: 'Aprovada',
    body: 'O seu negócio foi aprovado. Recebeu por email o link para ativar o acesso à app Banzami Business.',
  },
  REJECTED: { title: 'Não aprovada', body: 'A candidatura não foi aprovada. Recebeu por email o motivo e pode candidatar-se de novo.' },
  CANCELLED: { title: 'Cancelada', body: 'Esta candidatura foi cancelada.' },
  PROVISIONING_FAILED: {
    title: 'Aprovada — a concluir',
    body: 'A candidatura foi aprovada e a equipa Banzami está a concluir a criação da sua conta.',
  },
};

/** Documents the applicant can (re)send now: due or refused, of a document kind. */
export function documentsToSend(s: ApplicationStatus): RequirementIssue[] {
  const open = ['SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUIRED'].includes(s.status);
  if (!open) return [];
  return [...s.requirements.currently_due, ...s.requirements.errors].filter((i) => i.kind === 'document');
}
