type StatusVariant = 'waiting' | 'confirmed' | 'expired' | 'error';

interface StatusBadgeProps {
  variant: StatusVariant;
  label:   string;
}

const VARIANT_STYLES: Record<StatusVariant, { dot: string; text: string; bg: string }> = {
  waiting:   { dot: 'bg-gold animate-pulse-dot',   text: 'text-gray-600',   bg: 'bg-gray-100'     },
  confirmed: { dot: 'bg-success',                   text: 'text-success',    bg: 'bg-success-bg'   },
  expired:   { dot: 'bg-warning',                   text: 'text-warning',    bg: 'bg-warning-bg'   },
  error:     { dot: 'bg-error',                     text: 'text-error',      bg: 'bg-error-bg'     },
};

/**
 * Pill badge with a colored dot and status label.
 */
export default function StatusBadge({ variant, label }: StatusBadgeProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 ${styles.bg}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
      <span className={`text-sm font-medium ${styles.text}`}>{label}</span>
    </div>
  );
}
