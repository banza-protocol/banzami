'use client';

import { useEffect, useState } from 'react';
import { detectPlatform, installOption, destinationLabel, type Platform } from '@/lib/install';

/**
 * The secondary "get the app" fallback on the pay surfaces, for a payer who does
 * not have the Banzami app. It never competes with the primary "Pagar com
 * Banzami" CTA and never touches the payment: it only opens the platform's real
 * obtain destination (invite-only beta sign-up, or the in-browser Beta Web) in a
 * new tab. Copy and destination come from lib/install, so no store URL lives
 * here. Platform is detected after mount (navigator is absent during SSR), so a
 * server-rendered page shows nothing platform-specific until the client knows.
 */
export function GetTheApp() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => { setPlatform(detectPlatform()); }, []);
  if (platform === null) return null;

  const o = installOption(platform);
  return (
    <div className="mt-1 flex flex-col items-center gap-0.5 text-center">
      {o.prompt && <p className="text-xs text-gray-400">{o.prompt}</p>}
      {o.message && <p className="text-xs text-gray-500">{o.message}</p>}
      <a
        href={o.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${o.ctaLabel} (${destinationLabel(o.destination)})`}
        className="inline-flex min-h-[32px] items-center justify-center rounded-lg px-2 py-1 text-sm font-semibold text-banzami underline underline-offset-2 transition-colors hover:text-banzami-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-banzami"
      >
        {o.ctaLabel}
      </a>
    </div>
  );
}
