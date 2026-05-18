interface Props {
  children: string
  author?: string
}

export function ManifestoQuote({ children, author }: Props) {
  return (
    <div className="relative my-12 overflow-hidden rounded-3xl bg-bz-primary px-8 py-10 text-white shadow-primary md:px-12 md:py-14">
      {/* Decorative quotation mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-4 -left-2 font-serif text-[10rem] leading-none text-white/10 select-none"
      >
        &ldquo;
      </div>

      <p className="relative z-10 text-xl font-semibold leading-snug tracking-tight text-balance md:text-2xl lg:text-3xl">
        {children}
      </p>

      {author && (
        <p className="relative z-10 mt-6 text-sm font-medium text-red-200">{author}</p>
      )}
    </div>
  )
}
