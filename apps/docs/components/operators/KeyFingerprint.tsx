import type { SigningKey } from '@/lib/operators'

interface Props {
  signingKey: SigningKey
}

export function KeyFingerprint({ signingKey }: Props) {
  const short = signingKey.fingerprint.split(':')[1]?.slice(0, 24) ?? signingKey.fingerprint

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${signingKey.revoked ? 'border-red-200 bg-red-50 opacity-60' : 'border-bz-border bg-bz-surface'}`}>
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${signingKey.revoked ? 'bg-red-100' : 'bg-white border border-bz-border'}`}>
        <svg className={`h-4 w-4 ${signingKey.revoked ? 'text-red-500' : 'text-bz-muted'}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 10a4 4 0 100-8 4 4 0 000 8z" />
          <path d="M9.5 7L14 11.5M12 10l2 2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-[11px] font-medium text-bz-text break-all">
            SHA256:{short}…
          </code>
          <span className="rounded border border-bz-border bg-white px-1.5 py-0.5 font-mono text-[10px] text-bz-muted">
            {signingKey.type}
          </span>
          {signingKey.revoked && (
            <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              REVOKED
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-bz-muted">
          <span>Created {signingKey.created_at}</span>
          {signingKey.rotation_date && <span>Rotates {signingKey.rotation_date}</span>}
        </div>
      </div>
    </div>
  )
}
