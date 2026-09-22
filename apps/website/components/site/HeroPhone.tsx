// Static, premium phone mock for the homepage hero — styled after the real App
// Banzami (saldo card, three actions, recent activity, bottom nav) with generic
// content only (no real people, no names inside the screen). Money follows the
// house format: "325 000 Kz" (space-grouped, Kz last, no cents). Pure markup —
// no interactivity — so it renders identically on the server.

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-bold text-ink">
      <span>9:41</span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {/* signal */}
        <svg width="17" height="11" viewBox="0 0 17 11" fill="none"><rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="currentColor"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="currentColor"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="currentColor" opacity="0.35"/></svg>
        {/* wifi */}
        <svg width="15" height="11" viewBox="0 0 15 11" fill="none"><path d="M7.5 9.5l0 0M2 5.2a8 8 0 0111 0M4.2 7.3a5 5 0 016.6 0M7.5 9.4a0.1 0.1 0 010 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        {/* battery */}
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><rect x="0.6" y="0.6" width="20" height="10.8" rx="3" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1"/><rect x="2" y="2" width="16" height="8" rx="1.8" fill="currentColor"/><rect x="22" y="4" width="1.6" height="4" rx="0.8" fill="currentColor" opacity="0.4"/></svg>
      </span>
    </div>
  );
}

function ActionTile({ label, filled, children }: { label: string; filled?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-1 flex-col items-center gap-2 rounded-[18px] py-3.5 ${filled ? 'bg-[linear-gradient(160deg,#B5101F,#9A1B22)] text-white shadow-[0_12px_24px_-14px_rgba(181,16,31,.6)]' : 'bg-cream-100 text-cherry'}`}>
      <span className="grid h-9 w-9 place-items-center rounded-full">{children}</span>
      <span className="text-[12px] font-extrabold">{label}</span>
    </div>
  );
}

function ActivityRow({ kind, label, time, amount, positive }: { kind: 'in' | 'out'; label: string; time: string; amount: string; positive: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${kind === 'in' ? 'bg-cream-100 text-cherry' : 'bg-cream-100 text-ink-soft'}`} aria-hidden="true">
        {kind === 'in' ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 19a7 7 0 0114 0"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6"/></svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-extrabold leading-tight text-ink">{label}</span>
        <span className="block text-[11px] font-semibold text-ink-muted">{time}</span>
      </span>
      <span className={`text-[13px] font-black ${positive ? 'text-received' : 'text-ink'}`}>{amount}</span>
    </div>
  );
}

/** The phone body only (no outer glows) — sized by its container. */
export function HeroPhone({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-[300px] max-w-full ${className}`}>
      <div className="relative overflow-hidden rounded-[46px] bg-black p-[10px] shadow-[0_50px_90px_-40px_rgba(120,10,20,.5)]">
        <div className="relative overflow-hidden rounded-[38px] bg-[#FBF7F6]">
          {/* dynamic island */}
          <div className="absolute left-1/2 top-2 z-10 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
          <StatusBar />

          {/* app header */}
          <div className="flex items-center justify-between px-5 pb-1 pt-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-cherry text-white">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2.4"/><rect x="13" y="3" width="8" height="8" rx="2.4" opacity=".75"/><rect x="3" y="13" width="8" height="8" rx="2.4" opacity=".75"/><rect x="14.5" y="14.5" width="5" height="5" rx="1.6"/></svg>
              </span>
              <span className="text-[15px] font-black tracking-[-.01em] text-ink">Banzami</span>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-cream-100 text-ink-soft" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
            </span>
          </div>

          {/* balance card */}
          <div className="mx-4 mt-2 overflow-hidden rounded-[22px] bg-[linear-gradient(150deg,#C21324_0%,#9A1B22_100%)] p-[18px] text-white shadow-[0_20px_36px_-22px_rgba(181,16,31,.7)]">
            <p className="m-0 flex items-center gap-2 text-[11px] font-bold text-white/80">
              Saldo disponível
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.6"/></svg>
            </p>
            <p className="m-0 mt-1.5 text-[27px] font-black leading-none tracking-[-.02em]">325 000 Kz</p>
            <p className="m-0 mt-2 text-[11px] font-semibold text-white/70">Na sua carteira Banzami</p>
          </div>

          {/* actions */}
          <div className="mt-3 flex gap-2.5 px-4">
            <ActionTile label="QR Code" filled>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.4"/><path d="M14.5 14.5h3M20.5 14.5v.01M14.5 20.5h6M20.5 17.5v.01M17.5 17.5v3" strokeLinecap="round"/></svg>
            </ActionTile>
            <ActionTile label="Enviar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
            </ActionTile>
            <ActionTile label="Receber">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
            </ActionTile>
          </div>

          {/* recent activity */}
          <div className="mt-3.5 px-5 pb-6">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-black text-ink">Atividade recente</span>
              <span className="text-[11px] font-extrabold text-cherry">Ver tudo</span>
            </div>
            <div className="mt-0.5 divide-y divide-border-soft">
              <ActivityRow kind="in" label="Recebido" time="Hoje, 14:20" amount="+ 50 000 Kz" positive />
              <ActivityRow kind="out" label="Pagamento" time="Hoje, 12:05" amount="- 12 500 Kz" positive={false} />
              <ActivityRow kind="in" label="Recebido" time="Ontem, 18:43" amount="+ 25 000 Kz" positive />
            </div>
          </div>

          {/* bottom nav */}
          <div className="flex items-center justify-around border-t border-border-soft bg-white/70 px-2 py-2.5 pb-4 text-ink-muted">
            <span className="flex flex-col items-center gap-1 text-cherry">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2.4"/><rect x="13" y="3" width="8" height="8" rx="2.4" opacity=".7"/><rect x="3" y="13" width="8" height="8" rx="2.4" opacity=".7"/><rect x="14.5" y="14.5" width="5" height="5" rx="1.6"/></svg>
              <span className="text-[9.5px] font-extrabold">Início</span>
            </span>
            <span className="flex flex-col items-center gap-1">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <span className="text-[9.5px] font-bold">Histórico</span>
            </span>
            <span className="flex flex-col items-center gap-1">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.4"/><path d="M14.5 14.5h6M20.5 20.5v.01M14.5 20.5v.01M17.5 17.5h3" strokeLinecap="round"/></svg>
              <span className="text-[9.5px] font-bold">Receber</span>
            </span>
            <span className="flex flex-col items-center gap-1">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0114 0"/></svg>
              <span className="text-[9.5px] font-bold">Perfil</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
