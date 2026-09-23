'use client';

import { useEffect, useState } from 'react';

const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://api.banzami.com').replace(/\/+$/, '');

// SANDBOX badge for the Consumer Portal. Production is silent: nothing in LIVE.
// On any read failure it shows the badge (never assume production).
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

  // Consistent SANDBOX corner ribbon (same as banzami.com and the other surfaces).
  return (
    <div role="status" style={{ position: 'fixed', top: 0, left: 0, zIndex: 100, width: '150px', height: '150px', overflow: 'hidden', pointerEvents: 'none' }}>
      <span className="sr-only">Ambiente SANDBOX — dinheiro fictício. O Financial Live está indisponível.</span>
      <div aria-hidden="true" style={{ position: 'absolute', top: '12px', left: '-52px', transform: 'rotate(-45deg)', width: '150px', padding: '5px 0', textAlign: 'center', background: 'linear-gradient(90deg,#FBE6A6,#F2CD6E)', color: '#7A4A06', fontSize: '9.5px', fontWeight: 900, letterSpacing: '.16em', boxShadow: '0 8px 18px -8px rgba(122,74,6,.5)' }}>SANDBOX</div>
    </div>
  );
}
