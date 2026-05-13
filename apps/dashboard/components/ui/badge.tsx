type Variant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const styles: Record<Variant, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  error:   'bg-error-bg text-error',
  info:    'bg-info-bg text-info',
  neutral: 'bg-gray-100 text-gray-700',
};

const STATUS_MAP: Record<string, Variant> = {
  COMPLETED: 'success',
  ACTIVE:    'success',
  PAID:      'success',
  PENDING:   'warning',
  PROCESSING:'warning',
  FAILED:    'error',
  EXPIRED:   'error',
  CANCELLED: 'error',
  REFUNDED:  'info',
  SUSPENDED: 'warning',
  USED:      'neutral',
};

export function Badge({ label }: { label: string }) {
  const variant = STATUS_MAP[label.toUpperCase()] ?? 'neutral';
  return (
    <span className={`inline-flex items-center rounded-full px-md py-micro text-xs font-medium tracking-wide ${styles[variant]}`}>
      {label}
    </span>
  );
}
