'use client';

import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

// Live clock — `hms` (HH:MM:SS) for the comprovativo seal, `hm` (HH:MM) for the
// phone status bars, so the top clock and the receipt seal stay in sync ("hora
// ao vivo" per the design). The SSR placeholder matches the design mock (no
// hydration mismatch); it starts ticking once mounted on the client and stops
// cleanly on unmount.
export function LiveClock({ initial, format = 'hms' }: { initial?: string; format?: 'hms' | 'hm' }) {
  const fallback = initial ?? (format === 'hm' ? '14:30' : '14:30:10');
  const [time, setTime] = useState(fallback);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setTime(format === 'hm' ? hm : `${hm}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [format]);
  return <>{time}</>;
}
