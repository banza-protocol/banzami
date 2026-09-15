// The always-on Sandbox disclosure. All value in this app is fictitious and
// Financial Live is unavailable — the reader is owed that on every screen
// (WEB-APP-001 §89/§174).
export function SandboxBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-amber-800 ${className}`}
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
      Sandbox · dinheiro fictício
    </span>
  );
}
