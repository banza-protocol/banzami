'use client'

interface Props {
  label: string
  onClick: (label: string) => void
}

export function QuickPromptChip({ label, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick(label)}
      className="shrink-0 rounded-full border border-bz-border bg-white px-3 py-1.5 text-xs font-medium text-bz-muted transition-colors hover:border-bz-primary/40 hover:bg-bz-primary-light hover:text-bz-primary whitespace-nowrap"
    >
      {label}
    </button>
  )
}
