// Vertical/stepped flow: Merchant App → Banzami API → Ledger → Wallets →
// Webhooks → Merchant Backend, with 6 numbered step captions.
// Presentational, responsive (stacks naturally; the rail is hidden on small).

const NODES: { n: string; label: string; caption: string }[] = [
  { n: '1', label: 'Merchant App', caption: 'Pedido de pagamento' },
  { n: '2', label: 'Banzami API', caption: 'Validação' },
  { n: '3', label: 'Ledger', caption: 'Escrita no ledger' },
  { n: '4', label: 'Wallets', caption: 'Atualização da carteira' },
  { n: '5', label: 'Webhooks', caption: 'Envio do webhook' },
  { n: '6', label: 'Merchant Backend', caption: 'Confirmação ao comerciante' },
];

export function ArchitectureDiagram() {
  return (
    <div className="mx-auto max-w-[560px]">
      <ol className="m-0 flex list-none flex-col gap-0 p-0">
        {NODES.map((node, i) => (
          <li key={node.n} className="relative flex flex-col items-stretch">
            <div className="flex items-center gap-4 rounded-card border border-border-soft bg-white p-[18px] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]">
              <span
                className="flex h-[40px] w-[40px] flex-none items-center justify-center rounded-[13px] text-[15px] font-black text-white"
                style={{ background: 'linear-gradient(150deg,#B5101F,#6E0E14)' }}
              >
                {node.n}
              </span>
              <div className="min-w-0">
                <p className="bz-mono m-0 text-[14px] font-semibold tracking-[-0.01em] text-ink">
                  {node.label}
                </p>
                <p className="m-0 mt-[2px] text-[13px] font-semibold text-ink-soft">
                  {node.caption}
                </p>
              </div>
            </div>
            {i < NODES.length - 1 && (
              <div className="flex h-[34px] items-center justify-center">
                <svg width="14" height="34" viewBox="0 0 14 34" fill="none" aria-hidden="true">
                  <path
                    d="M7 0v26"
                    stroke="#E8434B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="2 4"
                  />
                  <path
                    d="M2.5 21L7 27l4.5-6"
                    stroke="#B5101F"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
