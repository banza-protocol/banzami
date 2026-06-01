interface DiagramPanelProps {
  src: string
  alt: string
  caption?: string
  className?: string
}

export function DiagramPanel({ src, alt, caption, className = '' }: DiagramPanelProps) {
  return (
    <figure className={`my-8 ${className}`}>
      <div className="overflow-hidden rounded-2xl border border-bz-border bg-white shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="w-full"
          loading="lazy"
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-bz-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
