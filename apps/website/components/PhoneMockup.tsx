// Hero phone mockup with the looping scan → confirmar → pago sequence.
// Pure CSS animations (globals.css) — disabled under prefers-reduced-motion.
function QrArt() {
  return (
    <svg width="140" height="140" viewBox="0 0 29 29" shapeRendering="crispEdges" aria-hidden="true">
      <rect width="29" height="29" fill="#fff" />
      <path
        fill="#2a2024"
        d="M0 0h7v7H0zM2 2v3h3V2zM22 0h7v7h-7zM24 2v3h3V2zM0 22h7v7H0zM2 24v3h3v-3z"
      />
      <rect x="9" y="1" width="1" height="1" fill="#2a2024" />
      <rect x="11" y="0" width="1" height="1" fill="#2a2024" />
      <rect x="13" y="2" width="1" height="1" fill="#2a2024" />
      <rect x="15" y="0" width="1" height="1" fill="#2a2024" />
      <rect x="17" y="1" width="1" height="1" fill="#2a2024" />
      <rect x="19" y="3" width="1" height="1" fill="#2a2024" />
      <rect x="1" y="9" width="1" height="1" fill="#2a2024" />
      <rect x="3" y="11" width="1" height="1" fill="#2a2024" />
      <rect x="0" y="13" width="1" height="1" fill="#2a2024" />
      <rect x="2" y="15" width="1" height="1" fill="#2a2024" />
      <rect x="10" y="10" width="9" height="9" rx="1" fill="#FBD2D0" />
      <rect x="12" y="12" width="5" height="5" fill="#B5101F" />
      <rect x="24" y="10" width="1" height="1" fill="#2a2024" />
      <rect x="26" y="12" width="1" height="1" fill="#2a2024" />
      <rect x="25" y="16" width="1" height="1" fill="#2a2024" />
      <rect x="10" y="23" width="1" height="1" fill="#2a2024" />
      <rect x="13" y="25" width="1" height="1" fill="#2a2024" />
      <rect x="16" y="24" width="1" height="1" fill="#2a2024" />
      <rect x="19" y="26" width="1" height="1" fill="#2a2024" />
      <rect x="23" y="23" width="1" height="1" fill="#2a2024" />
      <rect x="25" y="25" width="1" height="1" fill="#2a2024" />
    </svg>
  );
}

export function PhoneMockup() {
  return (
    <div className="relative flex min-h-[520px] items-center justify-center">
      <div className="absolute h-[330px] w-[330px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.1),rgba(232,67,75,0)_70%)]" />
      <div className="anim-floatyB absolute left-[30px] top-[60px] h-16 w-16 rounded-[22px] bg-pink-200" />
      <div className="anim-floaty-5 absolute bottom-[70px] right-[18px] h-[46px] w-[46px] rounded-full bg-banzami-coral opacity-[0.85]" />

      <div className="anim-floaty relative h-[580px] w-[290px] rounded-phone bg-white p-[10px] shadow-phone">
        <div className="absolute left-1/2 top-5 z-[5] h-[6px] w-20 -translate-x-1/2 rounded-[6px] bg-pink-200" />
        <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-gradient-to-b from-pink-50 to-[#FFEFEE]">
          <div className="flex items-center justify-between px-[22px] pt-5 text-[12px] font-extrabold text-ink">
            <span>09:41</span>
            <span className="flex items-center gap-[5px] text-banzami">
              <span className="inline-block h-[14px] w-[14px] rounded-[5px] bg-banzami" />
              Banzami
            </span>
          </div>

          {/* SCAN */}
          <div className="anim-scene0 absolute inset-x-0 bottom-0 top-[52px] px-[22px] py-4 opacity-0">
            <p className="m-0 mb-4 text-center text-[13px] font-extrabold text-ink-soft">
              A ler código QR…
            </p>
            <div className="relative mx-auto flex h-[196px] w-[196px] items-center justify-center overflow-hidden rounded-[26px] bg-white shadow-[0_14px_30px_-12px_rgba(181,16,31,.25)]">
              <QrArt />
              <div className="anim-scanline absolute left-4 right-4 h-[3px] rounded-[3px] bg-[linear-gradient(90deg,rgba(232,67,75,0),#E8434B,rgba(232,67,75,0))] shadow-[0_0_14px_2px_rgba(232,67,75,.5)]" />
            </div>
            <div className="mt-[18px] rounded-[18px] bg-white p-3 text-center shadow-[0_6px_16px_-8px_rgba(181,16,31,.2)]">
              <span className="bz-mono text-[13px] font-semibold text-banzami">@padaria-luanda</span>
            </div>
          </div>

          {/* CONFIRMAR */}
          <div className="anim-scene1 absolute inset-x-0 bottom-0 top-[52px] flex flex-col px-[22px] py-[18px] opacity-0">
            <p className="m-0 mb-[2px] text-center text-[13px] font-bold text-ink-soft">A pagar a</p>
            <p className="bz-mono m-0 mb-[18px] text-center text-[15px] font-semibold text-ink">
              @padaria-luanda
            </p>
            <div className="mb-[22px] text-center">
              <span className="text-[46px] font-black tracking-[-0.03em] text-ink">2.500</span>
              <span className="ml-1 text-[17px] font-extrabold text-ink-faint">Kz</span>
            </div>
            <div className="mb-auto flex flex-col gap-[9px]">
              <div className="flex justify-between rounded-[16px] bg-white px-4 py-[13px] text-[13px] font-bold">
                <span className="text-ink-soft">Carteira</span>
                <span className="text-ink">18.250 Kz</span>
              </div>
              <div className="flex justify-between rounded-[16px] bg-white px-4 py-[13px] text-[13px] font-bold">
                <span className="text-ink-soft">Liquidação</span>
                <span className="text-banzami">Instantânea</span>
              </div>
            </div>
            <div className="mt-4 rounded-pill bg-banzami p-4 text-center text-[16px] font-extrabold text-white shadow-[0_12px_24px_-8px_rgba(181,16,31,.55)]">
              Confirmar →
            </div>
          </div>

          {/* PAGO */}
          <div className="anim-scene2 absolute inset-x-0 bottom-0 top-[52px] flex flex-col items-center justify-center p-[22px] opacity-100">
            <div className="relative mb-[22px] flex h-[118px] w-[118px] items-center justify-center">
              <div className="anim-pulsering absolute inset-0 rounded-full border-2 border-[rgba(181,16,31,.35)]" />
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-banzami to-banzami-coral shadow-[0_16px_34px_-10px_rgba(181,16,31,.6)]">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="#fff"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <p className="m-0 text-[28px] font-black tracking-[-0.02em] text-ink">Pago</p>
            <p className="m-0 mt-2 text-[15px] font-extrabold text-banzami">
              2.500 Kz · @padaria-luanda
            </p>
            <p className="m-0 mt-4 text-center text-[11px] font-bold text-ink-ghost">
              Recibo na carteira, sem screenshots
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[6px] left-1/2 flex -translate-x-1/2 gap-[9px] whitespace-nowrap rounded-pill bg-white px-4 py-[10px] shadow-[0_16px_36px_-12px_rgba(181,16,31,.28)]">
        <span className="flex items-center gap-[6px] text-[12px] font-extrabold text-ink">
          <span className="anim-dot0 h-[7px] w-[7px] rounded-full bg-banzami" />
          Scan
        </span>
        <span className="text-[#e8c8c6]">·</span>
        <span className="flex items-center gap-[6px] text-[12px] font-extrabold text-ink">
          <span className="anim-dot1 h-[7px] w-[7px] rounded-full bg-banzami" />
          Confirmar
        </span>
        <span className="text-[#e8c8c6]">·</span>
        <span className="flex items-center gap-[6px] text-[12px] font-extrabold text-ink">
          <span className="anim-dot2 h-[7px] w-[7px] rounded-full bg-banzami" />
          Pago
        </span>
      </div>
    </div>
  );
}
