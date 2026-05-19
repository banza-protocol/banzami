const actors = [
  { label: 'Consumidor',   sublabel: '@banza',          icon: '👤', pos: 'top-0 left-1/2 -translate-x-1/2' },
  { label: 'Comerciante',  sublabel: 'QR / @banza',     icon: '🏪', pos: 'top-[20%] right-0' },
  { label: 'Apps Externas',sublabel: 'Táxi / Delivery',  icon: '📱', pos: 'top-[60%] right-0' },
  { label: 'SDKs',         sublabel: 'TS · PHP · Go · Python', icon: '🔧', pos: 'bottom-0 right-[25%]' },
  { label: 'EMIS / Bancos',sublabel: 'Rails bancários',  icon: '🏦', pos: 'bottom-0 left-[25%]' },
  { label: 'Auditoria',    sublabel: 'Ledger imutável',  icon: '🔐', pos: 'top-[60%] left-0' },
  { label: 'Programadores',sublabel: 'Ecossistema SDK',  icon: '💻', pos: 'top-[20%] left-0' },
]

export function EcosystemMap() {
  return (
    <div className="my-8 overflow-hidden rounded-3xl border border-bz-border bg-gradient-to-br from-bz-bg to-white p-6 shadow-card md:p-10">
      <div className="mb-6 text-center">
        <span className="badge-gold">Ecossistema Banza</span>
        <p className="mt-2 text-sm text-bz-muted">Uma rede centrada no Core do Banzami</p>
      </div>

      {/* Desktop SVG map */}
      <div className="hidden md:block">
        <svg viewBox="0 -14 600 448" className="w-full" aria-label="Mapa do ecossistema Banza">
          {/* Connection lines */}
          {[
            [300,200, 300, 30],   // center to top (Consumidor)
            [300,200, 540,120],   // center to top-right (Comerciante)
            [300,200, 540,280],   // center to bottom-right (Apps)
            [300,200, 440,380],   // center to bottom-right2 (SDKs)
            [300,200, 160,380],   // center to bottom-left (EMIS)
            [300,200, 60,280],    // center to left (Auditoria)
            [300,200, 60,120],    // center to top-left (Programadores)
          ].map(([x1,y1,x2,y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#D4C9C7" strokeWidth="1.5" strokeDasharray="4 3" />
          ))}

          {/* Center node — Banzami Core */}
          <circle cx="300" cy="200" r="52" fill="#990011" />
          <text x="300" y="194" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">BANZAMI</text>
          <text x="300" y="209" textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="9">API · Ledger · Core Rust</text>

          {/* Outer nodes */}
          {[
            { cx:300, cy:28,  label:'Consumidor',    sub:'@banza',          emoji:'👤' },
            { cx:544, cy:112, label:'Comerciante',   sub:'QR / @banza',     emoji:'🏪' },
            { cx:544, cy:288, label:'Apps Externas', sub:'Táxi · Delivery',  emoji:'📱' },
            { cx:444, cy:382, label:'SDKs',          sub:'TS · PHP · Go',    emoji:'🔧' },
            { cx:156, cy:382, label:'EMIS/Bancos',   sub:'Rails bancários',  emoji:'🏦' },
            { cx:56,  cy:288, label:'Auditoria',     sub:'Ledger imutável',  emoji:'🔐' },
            { cx:56,  cy:112, label:'Programadores', sub:'Ecossistema SDK',  emoji:'💻' },
          ].map((n, i) => (
            <g key={i}>
              <circle cx={n.cx} cy={n.cy} r="34" fill="white" stroke="#D4C9C7" strokeWidth="1.5" />
              <text x={n.cx} y={n.cy - 6} textAnchor="middle" fontSize="14">{n.emoji}</text>
              <text x={n.cx} y={n.cy + 8} textAnchor="middle" fill="#1A1A1A" fontSize="8" fontWeight="600">{n.label}</text>
              <text x={n.cx} y={n.cy + 18} textAnchor="middle" fill="#6B6265" fontSize="7">{n.sub}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* Mobile: simple grid */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <div className="col-span-2 flex items-center justify-center rounded-2xl bg-bz-primary p-4 text-white">
          <div className="text-center">
            <div className="text-sm font-bold">BANZAMI CORE</div>
            <div className="text-xs opacity-75">API · Ledger · Rust</div>
          </div>
        </div>
        {actors.map((a, i) => (
          <div key={i} className="rounded-xl border border-bz-border bg-white p-3 text-center">
            <div className="text-xl">{a.icon}</div>
            <div className="mt-1 text-xs font-semibold text-bz-text">{a.label}</div>
            <div className="text-[10px] text-bz-muted">{a.sublabel}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
