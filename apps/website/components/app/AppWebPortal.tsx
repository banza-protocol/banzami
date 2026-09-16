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

const EMBED_URL = 'https://app.banzami.com/?embed=phone';

export function AppWebPortal() {
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
        <iframe
          title="App Banzami Web · Sandbox"
          src={EMBED_URL}
          loading="lazy"
          data-testid="portal-live-app"
          // The iframe is itself a keyboard tab stop (focus descends into the
          // embedded app), but Chromium honors neither an author :focus rule nor
          // :focus-visible on a focused iframe element — so paint the ring with an
          // inline style toggled on focus/blur, which does render (WCAG 2.4.7).
          // The left-column CTA remains the primary launch path.
          onFocus={(e) => {
            e.currentTarget.style.outline = '2px solid #B5101F';
            e.currentTarget.style.outlineOffset = '4px';
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = '';
            e.currentTarget.style.outlineOffset = '';
          }}
          className="h-full w-full rounded-[36px] border-0 bg-transparent"
        />
      </div>
    </div>
  );
}
