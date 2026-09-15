'use client';

// The homepage hero's App Banzami surface (WEB-APP-001 §11-§17 + device shell).
//
// ONE Consumer implementation (Flutter), and ONE device shell: the phone bezel is
// drawn by the Flutter app itself. Here the hero loads app.banzami.com/?embed=phone,
// which renders that SAME shell filling this iframe — identical geometry to the
// direct desktop presentation, no drift (HOMEPAGE_DIRECT_APP_DEVICE_SHELL_DRIFT=0),
// one Flutter runtime. The iframe is a lazy LIVE preview (loaded on interaction,
// §67); authenticated use always happens top-level at app.banzami.com (§17). On
// phones there is no nested frame — a full-screen launch (§16).

import { useState } from 'react';

const APP_URL = 'https://app.banzami.com/';
const EMBED_URL = 'https://app.banzami.com/?embed=phone';

function LaunchLink({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <a href={APP_URL} target="_blank" rel="noopener noreferrer" data-testid="portal-open-app" className={className}>
      {children}
    </a>
  );
}

export function AppWebPortal() {
  const [live, setLive] = useState(false);

  return (
    <div className="flex w-full flex-col items-center">
      {/* Desktop / tablet: the Flutter phone shell fills this portrait box. */}
      <div className="relative hidden sm:block">
        <div className="relative h-[608px] w-[300px] overflow-hidden rounded-[52px] shadow-[0_44px_100px_-44px_rgba(0,0,0,.55)]">
          {live ? (
            <iframe
              title="App Banzami Web · Sandbox"
              src={EMBED_URL}
              loading="lazy"
              className="h-full w-full border-0 bg-transparent"
            />
          ) : (
            <button
              type="button"
              onClick={() => setLive(true)}
              data-testid="portal-load-live"
              className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[52px] border-[13px] border-neutral-900 bg-[linear-gradient(160deg,#E8434B_0%,#B5101F_46%,#9A1B22_100%)] text-white"
            >
              <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-white/15 backdrop-blur">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="2" />
                  <rect x="14" y="3" width="7" height="7" rx="2" fillOpacity=".7" />
                  <rect x="3" y="14" width="7" height="7" rx="2" fillOpacity=".7" />
                  <rect x="14" y="14" width="7" height="7" rx="2" />
                </svg>
              </span>
              <span className="mt-1 text-[24px] font-black tracking-[-0.02em]">App Banzami</span>
              <span className="rounded-pill bg-white/15 px-3 py-[5px] text-[11px] font-bold tracking-[0.14em]">
                SANDBOX · DINHEIRO FICTÍCIO
              </span>
              <span className="mt-3 rounded-pill bg-white px-5 py-[9px] text-[13px] font-extrabold text-cherry shadow-[0_10px_24px_-12px_rgba(0,0,0,.4)]">
                Ver a app ao vivo
              </span>
            </button>
          )}
        </div>
        {live && (
          <LaunchLink className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-pill bg-white px-4 py-[9px] text-[12.5px] font-extrabold text-cherry-dark shadow-[0_12px_28px_-12px_rgba(181,16,31,.4)]">
            Abrir em ecrã completo ↗
          </LaunchLink>
        )}
      </div>

      {/* Mobile: no phone-in-phone — a full launch card (§16). */}
      <div className="w-full sm:hidden">
        <LaunchLink className="flex items-center justify-between gap-3 rounded-[22px] bg-[linear-gradient(160deg,#E8434B,#9A1B22)] px-5 py-5 text-white no-underline shadow-[0_24px_50px_-30px_rgba(181,16,31,.6)]">
          <span className="leading-tight">
            <span className="block text-[17px] font-black">Abrir App Banzami Web</span>
            <span className="block text-[12px] font-semibold text-white/80">Sandbox · dinheiro fictício</span>
          </span>
          <span className="text-[20px]">↗</span>
        </LaunchLink>
      </div>
    </div>
  );
}
