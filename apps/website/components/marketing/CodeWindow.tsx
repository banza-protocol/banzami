'use client';

import { useState, type ReactNode } from 'react';

export type CodeTab = { k: string; label: string; code: ReactNode };

/** Terminal-style code window with tabs (cURL / TypeScript / …). */
export function CodeWindow({ tabs, minH = 236, style }: { tabs: CodeTab[]; minH?: number; style?: React.CSSProperties }) {
  const [active, setActive] = useState(tabs[0]?.k);
  return (
    <div style={{ position: 'relative', background: 'linear-gradient(180deg,#221a1c,#161112)', borderRadius: '24px', padding: '6px 6px 8px', boxShadow: '0 50px 80px -34px rgba(90,10,18,.6),0 0 0 1px rgba(255,255,255,.04)', ...style }}>
      <div role="tablist" style={{ display: 'flex', alignItems: 'center', gap: '26px', padding: '16px 22px 0' }}>
        {tabs.map((t) => {
          const on = t.k === active;
          return (
            <button key={t.k} role="tab" aria-selected={on} onClick={() => setActive(t.k)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14.5px', fontWeight: 800, padding: '0 0 12px', color: on ? '#fff' : 'rgba(255,255,255,.5)', borderBottom: `3px solid ${on ? '#D8121F' : 'transparent'}`, transition: 'color .2s' }}>{t.label}</button>
          );
        })}
        <span aria-hidden="true" style={{ marginLeft: 'auto', paddingBottom: '12px', display: 'flex', gap: '5px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,.35)' }} />
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,.35)' }} />
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,.35)' }} />
        </span>
      </div>
      {tabs.map((t) => (
        t.k === active && (
          <pre key={t.k} style={{ margin: 0, minHeight: `${minH}px`, background: '#0f0b0c', borderRadius: '16px', padding: '22px 24px 26px', fontFamily: "'JetBrains Mono',monospace", fontSize: '12.5px', lineHeight: 1.8, color: '#f3eeee', overflowX: 'auto', whiteSpace: 'pre' }}>
            <code>{t.code}</code>
          </pre>
        )
      ))}
    </div>
  );
}
