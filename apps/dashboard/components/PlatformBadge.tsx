'use client';

import { useEffect, useState } from 'react';

const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://api.banzami.com').replace(/\/+$/, '');

// SANDBOX badge for the Merchant Portal. Production is silent: nothing is shown in
// LIVE. On any read failure it shows the badge (never assume production).
export function PlatformBadge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${GATEWAY_URL}/v1/platform-mode`, { cache: 'no-store' });
        const j = res.ok ? await res.json() : null;
        if (active) setShow(!j || j.mode !== 'LIVE');
      } catch {
        if (active) setShow(true); // fail-safe → SANDBOX
      }
    })();
    return () => { active = false; };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed left-1/2 top-2 z-[100] -translate-x-1/2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-amber-900 shadow-sm">
        🟨 Sandbox
      </span>
    </div>
  );
}
