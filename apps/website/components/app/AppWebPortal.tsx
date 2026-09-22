'use client';

// The homepage hero's App Banzami surface (WEB-APP-001 §11-§17 + device shell).
//
// ONE Consumer implementation (Flutter), and ONE device shell — drawn by the
// Flutter app itself. The hero loads app.banzami.com/?embed=phone, which renders
// the COMPLETE app inside that shell and scales the whole device down uniformly
// (a FittedBox transform — the components inside are never touched, only reduced
// proportionally). The embed canvas is transparent, so the phone floats on this
// hero exactly as it does on app.banzami.com — pixel-identical, no drift
// (HOMEPAGE_DIRECT_APP_DEVICE_SHELL_DRIFT=0), one Flutter runtime. It is a live
// preview; authenticated use happens top-level at app.banzami.com (§17), which
// is the primary CTA in the hero's left column. On phones there is no nested
// frame — a full-screen launch card (§16).

import { useState } from 'react';

const EMBED_URL = 'https://app.banzami.com/?embed=phone';

export function AppWebPortal() {
  // The embed loads the whole Flutter app before it paints, so on a refresh the
  // right column was empty for a beat and then the phone popped in. Show a
  // phone-shaped skeleton immediately and fade the live app in once it has
  // loaded — the shape is there from the first frame, no jump.
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="flex w-full flex-col items-center">
      {/* The live Flutter phone in the HERO showcase geometry — a gently wider,
          slightly shorter portrait device (shell aspect 416/856, vs the direct
          app's tall 418/872). The Flutter app lays out for real at the 388-wide
          viewport, so nothing is stretched. Shown on EVERY size: on desktop it
          fills the right column (sized to leave breathing space, no hero scroll);
          on mobile it sits below the copy, sized to the column width — the
          "Abrir App Banzami Web" CTA in the left column is the launch affordance,
          so this is a preview, not a duplicate. Transparent frame — bezel/island
          are drawn by the Flutter shell. */}
      <div className="relative aspect-[416/856] h-[clamp(470px,62vh,560px)] max-w-full sm:h-[clamp(480px,calc(100vh-170px),810px)]">
        {/* Instant phone-shaped skeleton (below the iframe). It mirrors the
            Flutter shell's device geometry so there is no empty gap while the
            app boots; it fades out once the live app has loaded. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${loaded ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="relative mx-auto h-full w-full overflow-hidden rounded-[46px] bg-[#141013] shadow-[0_44px_74px_-30px_rgba(40,3,8,0.55)]">
            {/* Dynamic-island pill */}
            <div className="absolute left-1/2 top-[14px] h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-black/70" />
            {/* Soft shimmer sweep */}
            <div className="bz-portal-shimmer absolute inset-0" />
            {/* Centred Banzami mark + spinner */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-[16px] bg-cherry shadow-[0_10px_24px_-10px_rgba(181,16,31,.8)]">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="3" width="7.5" height="7.5" rx="2.2" fill="#fff" />
                  <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" fill="#fff" fillOpacity="0.85" />
                  <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" fill="#fff" fillOpacity="0.85" />
                  <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2" fill="#fff" />
                </svg>
              </div>
              <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white/25 border-t-white/80" />
            </div>
          </div>
        </div>

        <iframe
          title="App Banzami Web · Sandbox"
          src={EMBED_URL}
          loading="eager"
          // onLoad fires when the embed's HTML has loaded, which is slightly
          // before the Flutter runtime paints. A short hold keeps the skeleton up
          // across that last beat so the app does not fade in over a transparent
          // canvas.
          onLoad={() => setTimeout(() => setLoaded(true), 550)}
          data-testid="portal-live-app"
          // A cross-origin embed (app.banzami.com): once a keyboard user tabs to
          // it, focus enters the child browsing context and the embedded app
          // renders its own focus indicators (WCAG 2.4.7 is met inside the frame).
          // The parent cannot style :focus or observe that ring, and the
          // left-column "Abrir App Banzami Web" CTA is the primary launch path.
          className={`relative h-full w-full border-0 bg-transparent transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
    </div>
  );
}
