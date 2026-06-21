// Conformance status snapshot + L0–L4 level grid. Figures mirror the
// Implementation Matrix / README and BANZAMI_REFERENCIA.md §15–17.

const STATUS = [
  { label: 'ESTADO DE LANÇAMENTO', value: 'NOT YET', accent: true },
  { label: 'BLOQ. INTERNOS', value: '0' },
  { label: 'BLOQ. EXTERNOS', value: '10' },
  { label: 'EVIDÊNCIA L0 · DRY-RUN', value: 'Validada · 5/5' },
  { label: 'CERTIFICAÇÃO BANZA', value: 'Não emitida', muted: true },
];

const LEVELS = [
  {
    id: 'L0',
    title: 'Conformance em sandbox',
    state: 'VALIDATED · baseline',
    note: 'PyPI + GHCR 5/5',
    primary: true,
  },
  { id: 'L1', title: 'Pagamentos core', state: 'PLANEADO · não validado', note: 'gap analysis feita' },
  { id: 'L2', title: 'Iniciação de pagamento', state: 'FUTURO' },
  { id: 'L3', title: 'Federação', state: 'FUTURO' },
  { id: 'L4', title: 'Interoperabilidade', state: 'FUTURO' },
];

export function StatusGrid({ soft = false }: { soft?: boolean }) {
  return (
    <div className="bz-status grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {STATUS.map((s) => (
        <div key={s.label} className={`rounded-[18px] p-[18px] ${soft ? 'bg-pink-50' : 'bg-white'}`}>
          <p className="m-0 text-[11px] font-extrabold tracking-[0.03em] text-ink-faint">{s.label}</p>
          <p
            className="m-0 mt-2 text-[17px] font-black"
            style={{ color: s.accent ? '#B5101F' : s.muted ? '#9a8a8e' : '#2a2024' }}
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function LevelGrid() {
  return (
    <div className="rounded-[28px] bg-white p-[clamp(22px,3vw,34px)]">
      <div className="bz-levels grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-5">
        {LEVELS.map((l) => (
          <div
            key={l.id}
            className={`rounded-[18px] p-[18px] ${l.primary ? 'bg-banzami text-white' : 'bg-pink-50'}`}
          >
            <p
              className="bz-mono m-0 text-[13px] font-semibold"
              style={{ color: l.primary ? '#fff' : '#9a8a8e' }}
            >
              {l.id}
            </p>
            <p className="m-0 mb-[6px] mt-2 text-[14px] font-extrabold">{l.title}</p>
            <p
              className="m-0 text-[12px] font-bold"
              style={{ color: l.primary ? '#FBD2D0' : '#8a7a7e' }}
            >
              {l.state}
            </p>
            {l.note && (
              <p
                className="m-0 mt-[6px] text-[11px]"
                style={{ color: l.primary ? '#f3c8c6' : '#a89a9e' }}
              >
                {l.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
