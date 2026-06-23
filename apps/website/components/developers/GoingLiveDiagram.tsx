// 6-step pipeline: Build → Test → Validate Webhooks → Technical Review →
// Production Activation → Monitoring. The Production Activation step is
// clearly marked "pendente" to stay honest (production is not active).
// Presentational, responsive (horizontal on desktop, vertical on mobile).

const STEPS: { n: string; label: string; pending?: boolean }[] = [
  { n: '1', label: 'Build' },
  { n: '2', label: 'Test' },
  { n: '3', label: 'Validate Webhooks' },
  { n: '4', label: 'Technical Review' },
  { n: '5', label: 'Production Activation', pending: true },
  { n: '6', label: 'Monitoring' },
];

function Connector({ vertical }: { vertical?: boolean }) {
  if (vertical) {
    return (
      <div className="flex h-[22px] items-center justify-center md:hidden">
        <svg width="12" height="22" viewBox="0 0 12 22" fill="none" aria-hidden="true">
          <path d="M6 0v15" stroke="#E8434B" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
          <path d="M2 11l4 5 4-5" stroke="#B5101F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return (
    <div
      className="hidden h-[3px] w-[22px] flex-none self-center rounded-full md:block"
      style={{ background: 'linear-gradient(90deg,#FBD2D0,#E8434B,#FBD2D0)' }}
    />
  );
}

export function GoingLiveDiagram() {
  return (
    <div className="flex flex-col items-stretch md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-y-3">
      {STEPS.map((step, i) => (
        <div key={step.n} className="contents">
          <div
            className={`flex flex-col items-center gap-[6px] rounded-card border px-[16px] py-[14px] text-center ${
              step.pending
                ? 'border-pink-200 bg-pink-100'
                : 'border-border-soft bg-white shadow-[0_14px_34px_-28px_rgba(181,16,31,.34)]'
            }`}
          >
            <span
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] text-[13px] font-black text-white"
              style={{ background: 'linear-gradient(150deg,#B5101F,#6E0E14)' }}
            >
              {step.n}
            </span>
            <span className="bz-mono text-[12px] font-semibold text-ink">{step.label}</span>
            {step.pending && (
              <span className="bz-mono rounded-pill bg-pink-200 px-[9px] py-[3px] text-[9.5px] font-extrabold tracking-[0.04em] text-cherry-dark">
                PENDENTE
              </span>
            )}
          </div>
          {i < STEPS.length - 1 && (
            <>
              <Connector />
              <Connector vertical />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
