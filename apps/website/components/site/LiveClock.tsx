'use client';

import { useEffect, useState } from 'react';

type ClockKind = 'hm' | 'hms' | 'date';

const p = (n: number) => String(n).padStart(2, '0');

function render(kind: ClockKind, d: Date): string {
  if (kind === 'hm') return `${d.getHours()}:${p(d.getMinutes())}`;
  if (kind === 'hms') return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  // date
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Live device clock for the decorative phone mockups. Renders empty on the
 * server (and first client paint) to avoid a hydration mismatch, then ticks
 * every second. The interval is cleared on unmount.
 */
export function LiveClock({ kind }: { kind: ClockKind }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const tick = () => setValue(render(kind, new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [kind]);

  return <span suppressHydrationWarning>{value}</span>;
}
