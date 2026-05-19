interface Props {
  value: number
  max?: number
  color?: 'primary' | 'gold' | 'success' | 'muted'
  size?: 'sm' | 'md'
  showLabel?: boolean
}

const colorMap = {
  primary: 'bg-bz-primary',
  gold:    'bg-bz-gold',
  success: 'bg-green-600',
  muted:   'bg-bz-border',
}

export function ValidationProgress({ value, max = 100, color = 'primary', size = 'sm', showLabel = false }: Props) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const barColor = colorMap[color]
  const height = size === 'md' ? 'h-2' : 'h-1.5'

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 overflow-hidden rounded-full bg-bz-border ${height}`}>
        <div
          className={`${height} rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right font-mono text-[10px] text-bz-muted">{pct}%</span>
      )}
    </div>
  )
}
