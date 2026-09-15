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

const APP_URL = 'https://app.banzami.com/';
const EMBED_URL = 'https://app.banzami.com/?embed=phone';

export function AppWebPortal() {
  return (
    <div className="flex w-full flex-col items-center">
      {/* Desktop / tablet: the live Flutter phone, reduced proportionally onto
          the hero. Transparent frame — the device's own bezel and shadow are
          drawn by the Flutter shell, so it looks identical to app.banzami.com. */}
      <div className="relative hidden aspect-[368/700] w-[368px] max-w-full sm:block">
        <iframe
          title="App Banzami Web · Sandbox"
          src={EMBED_URL}
          loading="lazy"
          data-testid="portal-live-app"
          className="h-full w-full border-0 bg-transparent"
        />
      </div>

      {/* Mobile: no phone-in-phone — a full launch card (§16). */}
      <div className="w-full sm:hidden">
        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="portal-open-app"
          className="flex items-center justify-between gap-3 rounded-[22px] bg-[linear-gradient(160deg,#E8434B,#9A1B22)] px-5 py-5 text-white no-underline shadow-[0_24px_50px_-30px_rgba(181,16,31,.6)]"
        >
          <span className="leading-tight">
            <span className="block text-[17px] font-black">Abrir App Banzami Web</span>
            <span className="block text-[12px] font-semibold text-white/80">Sandbox · dinheiro fictício</span>
          </span>
          <span className="text-[20px]">↗</span>
        </a>
      </div>
    </div>
  );
}
