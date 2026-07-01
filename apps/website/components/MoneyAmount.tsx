import { formatMoneyDisplay, formatKwanza } from '@/lib/money';

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'hero';
type Tone = 'normal' | 'brand' | 'success' | 'danger' | 'muted';
type Align = 'left' | 'right' | 'center';

// The amount is the dominant element on any money surface: bold, larger than the
// surrounding label, high contrast. One component so formatting + weight stay
// consistent everywhere.
const SIZE: Record<Size, string> = {
  sm:   'text-[15px] font-bold',
  md:   'text-[20px] font-bold',
  lg:   'text-[28px] font-extrabold',
  xl:   'text-[36px] font-extrabold',
  hero: 'text-[48px] font-extrabold',
};

const TONE: Record<Tone, string> = {
  normal:  'text-[#2a2024]',
  brand:   'text-[#B5101F]',
  success: 'text-[#1f9d57]',
  danger:  'text-[#DC2626]',
  muted:   'text-[#9a8a8e]',
};

const ALIGN: Record<Align, string> = {
  left:   'text-left',
  right:  'text-right',
  center: 'text-center',
};

export function MoneyAmount({
  amountMinor,
  kwanza,
  currency = 'AOA',
  size = 'md',
  tone = 'normal',
  align = 'left',
  className = '',
}: {
  /** Amount in integer minor units (ledger unit). */
  amountMinor?: number | null;
  /** Alternatively, a whole-kwanza amount. */
  kwanza?: number;
  currency?: string;
  size?: Size;
  tone?: Tone;
  align?: Align;
  className?: string;
}) {
  const text = kwanza != null ? formatKwanza(kwanza) : formatMoneyDisplay(amountMinor, currency);
  return (
    <span className={`inline-block tabular-nums tracking-[-0.01em] ${SIZE[size]} ${TONE[tone]} ${ALIGN[align]} ${className}`}>
      {text}
    </span>
  );
}
