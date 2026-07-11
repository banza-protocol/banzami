// A Banzami core node with integration satellites. Presentational, responsive
// (satellites wrap around core, stacking under it on mobile).
//
// HONESTY RULE (docs P0): satellites must match the real SDK maturity matrix
// on /docs (source-only SDKs: TS/Node, Python, PHP, Flutter, checkout-web,
// partial Go) plus direct REST/HTTP. Never advertise platforms with no SDK
// (e.g. native iOS/Android) — Flutter is the mobile path.
const SATELLITES = ['REST / HTTP', 'TypeScript / Node', 'Python · PHP', 'Flutter'];

export function SdkEcosystemDiagram() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center">
      {/* Core */}
      <div className="relative flex items-center justify-center">
        <span className="anim-pulsering absolute h-[120px] w-[120px] rounded-full border-2 border-[rgba(181,16,31,.16)]" />
        <span
          className="anim-pulsering absolute h-[120px] w-[120px] rounded-full border-2 border-[rgba(181,16,31,.16)]"
          style={{ animationDelay: '1.2s' }}
        />
        <div
          className="relative flex h-[92px] w-[92px] flex-col items-center justify-center rounded-[26px] text-white"
          style={{
            background: 'linear-gradient(150deg,#B5101F,#6E0E14)',
            boxShadow: '0 22px 44px -16px rgba(122,16,22,.6)',
          }}
        >
          <span className="bz-mono text-[13px] font-extrabold">Banzami</span>
          <span className="mt-[2px] text-[10px] font-semibold text-pink-200">core</span>
        </div>
      </div>

      {/* Connector */}
      <div className="flex h-[26px] items-center justify-center">
        <svg width="14" height="26" viewBox="0 0 14 26" fill="none" aria-hidden="true">
          <path d="M7 0v18" stroke="#E8434B" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
          <path d="M2.5 13L7 19l4.5-6" stroke="#B5101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Satellites */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SATELLITES.map((s) => (
          <span
            key={s}
            className="bz-mono rounded-pill border border-border-soft bg-white px-[15px] py-[10px] text-[12.5px] font-semibold text-cherry-dark shadow-[0_14px_34px_-28px_rgba(181,16,31,.34)]"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
