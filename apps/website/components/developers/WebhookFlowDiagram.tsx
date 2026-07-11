// Banzami emits events that fan out into a symmetric 2×2 grid of the four
// events, then converge down into → Merchant Backend.
// Presentational, responsive (the 2×2 grid stacks to a single column on mobile).
//
// HONESTY RULE (docs P0): only VERIFIED event names may appear — the same
// closed catalogue enforced by the /docs tests. Never reintroduce illustrative
// payment.* names (created/confirmed/failed/refunded are forbidden vocabulary).
const EVENTS = ['payment_session.paid', 'payment_link.paid', 'application_settlement.completed', 'application_settlement.failed'];

function VConnector() {
  return (
    <div className="flex h-[26px] items-center justify-center">
      <svg width="16" height="26" viewBox="0 0 16 26" fill="none" aria-hidden="true">
        <path d="M8 0v20" stroke="#E8434B" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
        <path d="M3.5 15L8 21l4.5-6" stroke="#B5101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function WebhookFlowDiagram() {
  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center">
      {/* Source */}
      <div
        className="flex items-center gap-[10px] rounded-card px-[20px] py-[14px] text-white shadow-[0_22px_44px_-26px_rgba(122,16,22,.6)]"
        style={{ background: 'linear-gradient(150deg,#B5101F,#6E0E14)' }}
      >
        <span className="anim-bzpulse h-[9px] w-[9px] rounded-full bg-white" />
        <span className="bz-mono text-[13px] font-semibold">Banzami</span>
        <span className="text-[13px] font-semibold text-pink-200">emite eventos</span>
      </div>

      <VConnector />

      {/* Symmetric 2×2 grid of events */}
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {EVENTS.map((e) => (
          <span
            key={e}
            className="bz-mono flex items-center justify-center rounded-pill border border-pink-200 bg-cream-50 px-[13px] py-[8px] text-center text-[12px] font-semibold text-cherry-dark"
          >
            {e}
          </span>
        ))}
      </div>

      <VConnector />

      {/* Target */}
      <div className="flex items-center gap-[10px] rounded-card border border-border-soft bg-white px-[20px] py-[14px] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]">
        <span className="bz-mono text-[13px] font-semibold text-ink">Merchant Backend</span>
      </div>
    </div>
  );
}
