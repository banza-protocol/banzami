// Compact horizontal "delivery + retry" flow for the Webhooks section.
// Banzami envia → comerciante devolve 2xx → se falhar, repete → processar idempotente.
// Same Banzami diagram language: small rounded nodes, thin dashed cherry connectors.

const STEPS: { label: string; caption: string }[] = [
  { label: 'Banzami envia', caption: 'evento assinado' },
  { label: 'Comerciante', caption: 'devolve 2xx' },
  { label: 'Sem 2xx?', caption: 'evento repetido' },
  { label: 'Idempotente', caption: 'processa uma vez' },
];

function Connector() {
  return (
    <span className="flex flex-none items-center justify-center px-[7px] py-[4px] md:py-0" aria-hidden="true">
      <svg width="18" height="10" viewBox="0 0 18 10" fill="none" className="rotate-90 md:rotate-0">
        <path d="M0 5h13" stroke="#E8434B" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 3" />
        <path d="M11 1.5L15 5l-4 3.5" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function RetryFlow() {
  return (
    <div className="flex flex-col items-stretch md:flex-row md:flex-wrap md:items-center md:justify-center">
      {STEPS.map((step, i) => (
        <div key={step.label} className="contents">
          <div className="flex min-w-[120px] flex-col items-center gap-[3px] rounded-card border border-border-soft bg-white px-[15px] py-[12px] text-center shadow-[0_14px_34px_-26px_rgba(181,16,31,.36)]">
            <span className="bz-mono text-[12.5px] font-bold leading-tight text-cherry-dark">
              {step.label}
            </span>
            <span className="text-[10.5px] font-semibold leading-tight text-ink-muted">
              {step.caption}
            </span>
          </div>
          {i < STEPS.length - 1 && <Connector />}
        </div>
      ))}
    </div>
  );
}
