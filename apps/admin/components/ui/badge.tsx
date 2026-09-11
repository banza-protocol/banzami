// Banzami Admin status badge. README §Cores (badges): success/âmbar/vermelho/
// maroon/azul/neutro. Maps both EN API codes and PT display labels → variant.

type Variant = 'success' | 'warning' | 'danger' | 'maroon' | 'info' | 'neutral';

const STYLE: Record<Variant, { bg: string; color: string }> = {
  success: { bg: '#eafaf0', color: '#1f9d57' },
  warning: { bg: '#FBEFD8', color: '#b5790f' },
  danger:  { bg: '#FFF1F0', color: '#B5101F' },
  maroon:  { bg: '#fbe3e1', color: '#9A1B22' },
  info:    { bg: '#e9effb', color: '#3a5bd0' },
  neutral: { bg: '#f1ebeb', color: '#7a6a6e' },
};

// EN API codes + PT labels → variant.
const VARIANT: Record<string, Variant> = {
  // success
  ACTIVE: 'success', APPROVED: 'success', SETTLED: 'success', CONFIRMED: 'success',
  RESOLVED: 'success', CONCILIADO: 'success', COMPLETED: 'success', ACCEPTED: 'success', APPLIED: 'success',
  ATIVO: 'success', LIQUIDADO: 'success', CONFIRMADO: 'success', RESOLVIDA: 'success', RESOLVIDO: 'success',
  APROVADO: 'success', 'CONCLUÍDO': 'success', ACEITE: 'success', APLICADA: 'success',
  // warning
  PENDING: 'warning', UNDER_REVIEW: 'warning', INFORMATION_REQUIRED: 'warning', 'INFORMAÇÃO PEDIDA': 'warning', PROCESSING: 'warning', PENDING_UPLOAD: 'warning',
  PENDENTE: 'warning', 'EM ANÁLISE': 'warning', 'EM ANALISE': 'warning', 'EM PROCESSAMENTO': 'warning',
  'A AGUARDAR ENVIO': 'warning', CREATED: 'warning', CRIADO: 'warning', RUNNING: 'warning', 'EM CURSO': 'warning',
  // danger
  REJECTED: 'danger', FAILED: 'danger', PROVISIONING_FAILED: 'danger', RETURNED: 'danger', OPEN: 'danger', BLOCKED: 'danger',
  CANCELLED: 'danger', REJEITADO: 'danger', REJEITADA: 'danger', FALHADO: 'danger', REVERSED: 'danger', REVERTIDO: 'danger',
  DEVOLVIDO: 'danger', ABERTA: 'danger', ABERTO: 'danger', BLOQUEADO: 'danger', CANCELADO: 'danger',
  'FALHA NO APROVISIONAMENTO': 'danger',
  // maroon (AML)
  FLAGGED: 'maroon', SINALIZADO: 'maroon',
  // info
  SUBMITTED: 'info', SENT: 'info', UPLOADED: 'info', SUBMETIDO: 'info', SUBMETIDA: 'info', ENVIADO: 'info',
  INVITED: 'info', CONVIDADO: 'info',
  // neutral
  SUSPENDED: 'neutral', SUSPENSO: 'neutral', DELETED: 'neutral', ELIMINADO: 'neutral',
  CLOSED: 'neutral', ENCERRADO: 'neutral', EXPIRED: 'neutral', EXPIRADO: 'neutral', DRAFT: 'neutral', RASCUNHO: 'neutral',
};

export function Badge({ label, variant }: { label: string | null | undefined; variant?: Variant }) {
  const text = label ?? '—';
  const v = variant ?? VARIANT[text.toUpperCase()] ?? 'neutral';
  const s = STYLE[v];
  return (
    <span
      className="inline-flex items-center rounded-[30px] px-[11px] py-1 text-[11.5px] font-extrabold"
      style={{ background: s.bg, color: s.color }}
    >
      {text}
    </span>
  );
}

// Every status code the console shows → its Portuguese label. One table, so a
// state reads the same on every page. SUBMITTED is NOT "Pendente": an
// application the applicant has submitted and a payout nobody has touched are
// different facts, and an operator filtering by one must not see the other's
// word. Unknown codes fall through unchanged (visible, never hidden).
export const STATUS_LABEL_PT: Record<string, string> = {
  // Business applications
  DRAFT: 'Rascunho',
  SUBMITTED: 'Submetida',
  UNDER_REVIEW: 'Em análise',
  INFORMATION_REQUIRED: 'Informação pedida',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  CANCELLED: 'Cancelado',
  PROVISIONING_FAILED: 'Falha no aprovisionamento',
  // Accounts, consumers, operators
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  CLOSED: 'Encerrado',
  INVITED: 'Convidado',
  BLOCKED: 'Bloqueado',
  FLAGGED: 'Sinalizado',
  // Money in motion (payouts, settlements, wallet payments, app settlements)
  CREATED: 'Criado',
  PENDING: 'Pendente',
  PROCESSING: 'Em processamento',
  SENT: 'Enviado',
  CONFIRMED: 'Confirmado',
  SETTLED: 'Liquidado',
  COMPLETED: 'Concluído',
  FAILED: 'Falhado',
  RETURNED: 'Devolvido',
  REVERSED: 'Revertido',
  EXPIRED: 'Expirado',
  APPLIED: 'Aplicada',
  // Runs, cases, documents
  RUNNING: 'Em curso',
  OPEN: 'Aberto',
  RESOLVED: 'Resolvido',
  PENDING_UPLOAD: 'A aguardar envio',
  UPLOADED: 'Enviado',
  ACCEPTED: 'Aceite',
  DELETED: 'Eliminado',
};

export function statusLabelPt(code: string | null | undefined): string {
  if (!code) return '—';
  return STATUS_LABEL_PT[code.toUpperCase()] ?? code;
}
