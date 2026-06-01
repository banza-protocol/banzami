interface SectionIntroProps {
  eyebrow: string
  title: string
  body: string
  variant?: 'default' | 'surface'
}

export function SectionIntro({ eyebrow, title, body, variant = 'default' }: SectionIntroProps) {
  return (
    <div className={variant === 'surface' ? 'border-y border-bz-border bg-bz-surface px-5 py-16 md:px-8 md:py-20 lg:px-12' : 'px-5 py-16 md:px-8 md:py-20 lg:px-12'}>
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
        {eyebrow}
      </div>
      <h2 className="mb-4 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">
        {title}
      </h2>
      <p className="max-w-2xl text-bz-muted">
        {body}
      </p>
    </div>
  )
}
