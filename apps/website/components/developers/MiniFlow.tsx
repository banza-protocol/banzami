// Compact 3-step mini-flow for the Examples section — much shorter than the
// full 7-node PaymentFlowDiagram, especially on mobile. Same Banzami SVG/style:
// small rounded nodes, thin cherry connectors, mono labels.

export function MiniFlow({ steps }: { steps: [string, string, string] }) {
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {steps.map((step, i) => (
        <div key={step} className="contents">
          <span className="bz-mono inline-flex flex-none items-center rounded-pill border border-border-soft bg-cream-50 px-[12px] py-[7px] text-[11.5px] font-semibold text-cherry-dark">
            {step}
          </span>
          {i < steps.length - 1 && (
            <span className="flex-none px-[7px]" aria-hidden="true">
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                <path d="M0 5h13" stroke="#E8434B" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 3" />
                <path d="M11 1.5L15 5l-4 3.5" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
