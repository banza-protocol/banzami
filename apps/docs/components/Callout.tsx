import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  variant?: 'info' | 'warning' | 'rule' | 'quote'
}

export function Callout({ children, variant = 'quote' }: Props) {
  const styles: Record<string, string> = {
    info:    'border-banzami-400 bg-banzami-50 text-banzami-900',
    warning: 'border-amber-400 bg-amber-50 text-amber-900',
    rule:    'border-angola-red bg-red-50 text-slate-900',
    quote:   'border-banzami-400 bg-gradient-to-br from-banzami-50 to-white text-banzami-900',
  }

  return (
    <blockquote
      className={`not-prose my-6 rounded-r-xl border-l-4 px-6 py-4 text-base font-medium leading-relaxed shadow-sm ${styles[variant]}`}
    >
      {children}
    </blockquote>
  )
}
