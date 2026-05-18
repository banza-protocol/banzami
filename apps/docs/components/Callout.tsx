import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  variant?: 'info' | 'warning' | 'rule' | 'quote'
}

const variants = {
  quote: {
    wrapper: 'border-bz-primary bg-bz-primary-light',
    bar:     'bg-bz-primary',
    text:    'text-bz-primary',
  },
  info: {
    wrapper: 'border-bz-gold/50 bg-bz-gold-light',
    bar:     'bg-bz-gold',
    text:    'text-amber-800',
  },
  warning: {
    wrapper: 'border-amber-300 bg-amber-50',
    bar:     'bg-amber-400',
    text:    'text-amber-900',
  },
  rule: {
    wrapper: 'border-bz-primary bg-bz-primary text-white',
    bar:     'bg-white/30',
    text:    'text-white',
  },
}

export function Callout({ children, variant = 'quote' }: Props) {
  const v = variants[variant]
  return (
    <div
      className={`not-prose relative my-6 overflow-hidden rounded-2xl border px-6 py-5 shadow-card ${v.wrapper}`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 inset-y-0 w-1 ${v.bar}`} />
      <div className={`text-base font-medium leading-relaxed ${v.text}`}>
        {children}
      </div>
    </div>
  )
}
