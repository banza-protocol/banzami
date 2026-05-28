interface Props {
  status: string
  schemaValid: boolean
  stale: boolean
  lastFetch: string
}

export function ManifestStatus({ status, schemaValid, stale, lastFetch }: Props) {
  const ok = status === 'valid' && schemaValid && !stale
  const warn = stale || status !== 'valid'

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
          ok ? 'bg-green-100' : warn ? 'bg-amber-100' : 'bg-red-100'
        }`}
      >
        {ok ? (
          <svg className="h-3 w-3 text-green-600" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l2.5 2.5L10 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg className="h-3 w-3 text-amber-600" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v5M6 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className={`text-xs font-medium ${ok ? 'text-green-700' : 'text-amber-700'}`}>
        {ok ? 'Valid' : stale ? 'Stale' : 'Warning'}
      </span>
      <span className="text-xs text-bz-muted">· {lastFetch.slice(0, 10)}</span>
    </div>
  )
}
