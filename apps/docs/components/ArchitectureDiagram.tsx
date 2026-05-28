interface Props {
  src: string
  title?: string
  description?: string
  alt?: string
  variant?: 'light' | 'dark' | 'minimal'
  className?: string
}

export function ArchitectureDiagram({
  src,
  title,
  description,
  alt,
  variant = 'light',
  className = '',
}: Props) {
  if (variant === 'minimal') {
    return (
      <div className={`my-8 ${className}`}>
        <img src={src} alt={alt ?? title ?? 'Diagrama de arquitectura'} className="w-full" loading="lazy" />
      </div>
    )
  }

  if (variant === 'dark') {
    return (
      <div className={`my-8 overflow-hidden rounded-2xl border border-bz-text/10 bg-bz-text shadow-card-lg ${className}`}>
        {(title || description) && (
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            <span className="ml-3 font-mono text-[10px] font-medium tracking-wider text-white/30 uppercase">
              {title ?? 'arquitectura'}
            </span>
          </div>
        )}
        <div className="p-6">
          <img src={src} alt={alt ?? title ?? 'Diagrama de arquitectura'} className="w-full rounded-lg" loading="lazy" />
        </div>
      </div>
    )
  }

  return (
    <div className={`my-8 overflow-hidden rounded-3xl border border-bz-border bg-white shadow-card ${className}`}>
      {(title || description) && (
        <div className="border-b border-bz-border px-6 py-4">
          {title && <p className="text-sm font-bold text-bz-text">{title}</p>}
          {description && <p className="mt-0.5 text-xs text-bz-muted">{description}</p>}
        </div>
      )}
      <div className="p-4 md:p-6">
        <img
          src={src}
          alt={alt ?? title ?? 'Diagrama de arquitectura'}
          className="w-full rounded-xl"
          loading="lazy"
        />
      </div>
    </div>
  )
}
