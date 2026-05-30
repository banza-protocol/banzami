interface Props {
  size?: number
  variant?: 'primary' | 'muted' | 'gold' | 'outline'
  className?: string
  glow?: boolean
}

const VARIANT_CLASS: Record<NonNullable<Props['variant']>, string> = {
  primary: 'text-bia-primary',
  muted:   'text-bia-muted',
  gold:    'text-bia-gold',
  outline: 'text-bia-text',
}

export function BanzAIIcon({ size = 16, variant = 'primary', className, glow = false }: Props) {
  const colorClass = className ?? VARIANT_CLASS[variant]
  const filter = glow ? 'drop-shadow(0 0 4px rgb(153 0 17 / 0.6))' : undefined

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={colorClass}
      style={filter ? { filter } : undefined}
      aria-hidden="true"
    >
      {/* Antenna */}
      <path d="M8 1.5V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="8" cy="1.2" r="0.7" fill="currentColor"/>
      {/* Head */}
      <rect x="2.5" y="4" width="11" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      {/* Eyes */}
      <rect x="4.5" y="6.5" width="2.5" height="2" rx="0.4" fill="currentColor"/>
      <rect x="9" y="6.5" width="2.5" height="2" rx="0.4" fill="currentColor"/>
      {/* Mouth */}
      <path d="M5.5 11h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}
