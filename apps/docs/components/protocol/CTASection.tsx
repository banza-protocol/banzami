import Link from 'next/link'

interface CTAItem {
  label: string
  href: string
  description: string
  variant?: 'primary' | 'ghost'
}

interface CTASectionProps {
  eyebrow?: string
  title: string
  items: CTAItem[]
}

export function CTASection({ eyebrow, title, items }: CTASectionProps) {
  return (
    <section className="border-t border-bz-border px-5 py-16 md:px-8 md:py-20 lg:px-12">
      {eyebrow && (
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-bz-primary">
          {eyebrow}
        </div>
      )}
      <h2 className="mb-8 text-2xl font-bold tracking-tight text-bz-text md:text-3xl">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group card p-5 transition-all hover:border-bz-primary/30 hover:shadow-card-md"
          >
            <div className="mb-1 text-sm font-semibold text-bz-text group-hover:text-bz-primary transition-colors">
              {item.label} →
            </div>
            <p className="text-xs leading-relaxed text-bz-muted">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
