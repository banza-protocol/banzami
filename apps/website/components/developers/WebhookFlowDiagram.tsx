// Banzami emits events that branch down into → Merchant Backend.
// Presentational, responsive (events wrap, then a single arrow to the backend).

const EVENTS = ['payment.created', 'payment.confirmed', 'payment.failed', 'payment.refunded'];

export function WebhookFlowDiagram() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center">
      {/* Source */}
      <div
        className="flex items-center gap-[10px] rounded-card px-[20px] py-[14px] text-white shadow-[0_22px_44px_-26px_rgba(122,16,22,.6)]"
        style={{ background: 'linear-gradient(150deg,#B5101F,#6E0E14)' }}
      >
        <span className="anim-bzpulse h-[9px] w-[9px] rounded-full bg-white" />
        <span className="bz-mono text-[13px] font-semibold">Banzami</span>
        <span className="text-[13px] font-semibold text-pink-200">emite eventos</span>
      </div>

      {/* Branch connectors */}
      <div className="flex h-[28px] items-center justify-center">
        <svg width="16" height="28" viewBox="0 0 16 28" fill="none" aria-hidden="true">
          <path d="M8 0v22" stroke="#E8434B" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
          <path d="M3.5 17L8 23l4.5-6" stroke="#B5101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Event pills */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {EVENTS.map((e) => (
          <span
            key={e}
            className="bz-mono rounded-pill border border-pink-200 bg-cream-50 px-[13px] py-[8px] text-[12px] font-semibold text-cherry-dark"
          >
            {e}
          </span>
        ))}
      </div>

      {/* Down to backend */}
      <div className="flex h-[28px] items-center justify-center">
        <svg width="16" height="28" viewBox="0 0 16 28" fill="none" aria-hidden="true">
          <path d="M8 0v22" stroke="#E8434B" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
          <path d="M3.5 17L8 23l4.5-6" stroke="#B5101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Target */}
      <div className="flex items-center gap-[10px] rounded-card border border-border-soft bg-white px-[20px] py-[14px] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]">
        <span className="bz-mono text-[13px] font-semibold text-ink">Merchant Backend</span>
      </div>
    </div>
  );
}
