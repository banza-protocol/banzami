type Variant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const styles: Record<Variant, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  error:   'bg-error-bg text-error',
  info:    'bg-info-bg text-info',
  neutral: 'bg-gray-100 text-gray-700',
};

const STATUS_MAP: Record<string, Variant> = {
  ACTIVE:         'success',
  APPROVED:       'success',
  SETTLED:        'success',
  CONFIRMED:      'success',
  COMPLETED:      'success',
  CAPTURED:       'success',
  PENDING:        'warning',
  PENDING_REVIEW: 'warning',
  PROCESSING:     'warning',
  AUTHORIZED:     'warning',
  SUBMITTED:      'info',
  SENT:           'info',
  FAILED:         'error',
  REJECTED:       'error',
  FLAGGED_AML:    'error',
  SUSPENDED:      'error',
  REVERSED:       'neutral',
  RETURNED:       'neutral',
};

export function Badge({ label }: { label: string | undefined | null }) {
  const variant = label ? (STATUS_MAP[label.toUpperCase()] ?? 'neutral') : 'neutral';
  return (
    <span className={`inline-flex items-center rounded-full px-md py-micro text-xs font-medium tracking-wide ${styles[variant]}`}>
      {label ?? '—'}
    </span>
  );
}
