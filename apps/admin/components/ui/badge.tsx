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
  RESOLVED: 'success', CONCILIADO: 'success', COMPLETED: 'success', ACCEPTED: 'success',
  ATIVO: 'success', LIQUIDADO: 'success', CONFIRMADO: 'success', RESOLVIDA: 'success',
  // warning
  PENDING: 'warning', UNDER_REVIEW: 'warning', PROCESSING: 'warning', PENDING_UPLOAD: 'warning',
  PENDENTE: 'warning', 'EM ANÁLISE': 'warning', 'EM ANALISE': 'warning',
  // danger
  REJECTED: 'danger', FAILED: 'danger', RETURNED: 'danger', OPEN: 'danger', BLOCKED: 'danger',
  CANCELLED: 'danger', REJEITADO: 'danger', REJEITADA: 'danger', FALHADO: 'danger',
  DEVOLVIDO: 'danger', ABERTA: 'danger', BLOQUEADO: 'danger',
  // maroon (AML)
  FLAGGED: 'maroon', SINALIZADO: 'maroon',
  // info
  SUBMITTED: 'info', SENT: 'info', UPLOADED: 'info', SUBMETIDO: 'info', ENVIADO: 'info',
  // neutral
  SUSPENDED: 'neutral', SUSPENSO: 'neutral', DELETED: 'neutral',
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

// Translate common merchant-application / merchant statuses to PT display labels.
export function statusLabelPt(code: string | null | undefined): string {
  if (!code) return '—';
  const map: Record<string, string> = {
    SUBMITTED: 'Pendente',
    UNDER_REVIEW: 'Em análise',
    APPROVED: 'Aprovado',
    REJECTED: 'Rejeitado',
    CANCELLED: 'Cancelado',
    DRAFT: 'Rascunho',
    ACTIVE: 'Ativo',
    SUSPENDED: 'Suspenso',
    PENDING: 'Pendente',
  };
  return map[code.toUpperCase()] ?? code;
}
