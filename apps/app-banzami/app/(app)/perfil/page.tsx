import { readSession } from '@/lib/session';
import { BrandMark } from '@/components/Brand';
import { SandboxBadge } from '@/components/SandboxBadge';
import { LogoutButton } from '@/components/LogoutButton';

export const dynamic = 'force-dynamic';

export default async function Perfil() {
  const s = (await readSession())!;
  return (
    <div className="px-5 pb-8 pt-4">
      <h1 className="text-[20px] font-black text-ink">Perfil</h1>

      <div className="mt-4 flex items-center gap-4 rounded-3xl bg-white p-5 shadow-[0_16px_40px_-28px_rgba(0,0,0,.4)]">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full text-[20px] font-black text-white" style={{ background: 'linear-gradient(145deg,#E8434B,#B5101F 55%,#9A1B22)' }}>
          {(s.displayName || s.handle).slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[18px] font-black text-ink">{s.displayName || `@${s.handle}`}</div>
          <div className="text-[14px] font-medium text-cherry">@{s.handle}</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50 p-4">
        <div className="flex items-center gap-2"><SandboxBadge /></div>
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-amber-900">
          Está a usar a App Banzami na Sandbox pública. Todo o dinheiro é fictício e nenhum pagamento é real. O Financial Live está indisponível.
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-[0_10px_30px_-24px_rgba(0,0,0,.4)]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-muted">Cliente</span>
          <span className="text-[13px] font-bold text-ink">App Banzami Web</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-muted">A mesma conta em</span>
          <span className="text-[13px] font-bold text-ink">Web · iPhone · Android</span>
        </div>
      </div>

      <div className="mt-6"><LogoutButton /></div>
      <div className="mt-6 flex justify-center"><BrandMark size={26} /></div>
    </div>
  );
}
