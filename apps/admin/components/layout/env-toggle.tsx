'use client';

import { useToast } from '@/components/ui/toast';
import { LIVE_UNAVAILABLE_MSG, type Env } from '@/lib/admin-env';

// Environment selector shared by every data page. SANDBOX is shown as active;
// LIVE is disabled (and explains itself) whenever the server is SANDBOX-only, so
// a page can never present "Produção (LIVE)" as the active environment by default.
export function EnvToggle({
  env,
  setEnv,
  liveAvailable,
}: {
  env: Env;
  setEnv: (e: Env) => boolean;
  liveAvailable: boolean;
}) {
  const toast = useToast();

  return (
    <div className="flex items-center gap-3">
      <span
        className={`rounded-md px-3 py-1.5 text-sm font-extrabold uppercase tracking-wide ${
          env === 'LIVE' ? 'bg-[#B5101F] text-white' : 'bg-amber-500 text-white'
        }`}
      >
        {env === 'LIVE' ? '● Produção (LIVE)' : '● Sandbox ativo'}
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-[#f1e3e3]">
        <button
          type="button"
          onClick={() => setEnv('SANDBOX')}
          className={`px-3 py-1.5 text-sm font-bold ${
            env === 'SANDBOX' ? 'bg-amber-500 text-white' : 'bg-white text-[#5a4a4e]'
          }`}
        >
          Sandbox
        </button>
        <button
          type="button"
          disabled={!liveAvailable}
          title={liveAvailable ? undefined : LIVE_UNAVAILABLE_MSG}
          onClick={() => {
            if (!liveAvailable) {
              toast('danger', LIVE_UNAVAILABLE_MSG);
              return;
            }
            setEnv('LIVE');
          }}
          className={`px-3 py-1.5 text-sm font-bold ${
            env === 'LIVE'
              ? 'bg-[#B5101F] text-white'
              : liveAvailable
                ? 'bg-white text-[#5a4a4e]'
                : 'cursor-not-allowed bg-[#faf4f4] text-[#c9bcbe]'
          }`}
        >
          Live
        </button>
      </div>
    </div>
  );
}
