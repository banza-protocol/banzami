// Horizontal premium flow (Stripe-style). Collapses to vertical on mobile.
// Cliente → QR / @banza → Confirmação → Ledger → Recibo → Webhook → Sistema do comerciante.

const STEPS = [
  'Cliente',
  'QR / @banza',
  'Confirmação',
  'Ledger',
  'Recibo',
  'Webhook',
  'Sistema do comerciante',
];

function FlowConnector({ vertical }: { vertical?: boolean }) {
  if (vertical) {
    return (
      <div className="flex h-[26px] items-center justify-center md:hidden">
        <svg width="12" height="26" viewBox="0 0 12 26" fill="none" aria-hidden="true">
          <path d="M6 0v18" stroke="#E8434B" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
          <path d="M2 14l4 5 4-5" stroke="#B5101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="relative hidden h-[3px] w-[26px] flex-none self-center md:block">
      <div
        className="h-full w-full rounded-full"
        style={{ background: 'linear-gradient(90deg,#FBD2D0,#E8434B,#FBD2D0)' }}
      />
      <span
        className="anim-coin absolute top-1/2 h-[8px] w-[8px] rounded-full"
        style={{ background: '#B5101F', boxShadow: '0 0 8px 2px rgba(232,67,75,.5)' }}
      />
    </div>
  );
}

export function PaymentFlowDiagram() {
  return (
    <div className="flex flex-col items-stretch md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-y-3">
      {STEPS.map((step, i) => (
        <div key={step} className="contents">
          <div className="flex items-center justify-center rounded-pill border border-border-soft bg-white px-[16px] py-[11px] shadow-[0_14px_34px_-28px_rgba(181,16,31,.34)]">
            <span className="bz-mono text-[12.5px] font-semibold text-cherry-dark">{step}</span>
          </div>
          {i < STEPS.length - 1 && (
            <>
              <FlowConnector />
              <FlowConnector vertical />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
