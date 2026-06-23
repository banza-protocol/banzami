'use client';

import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

// Live HH:MM:SS clock for the comprovativo seal ("hora ao vivo" per the design).
// The SSR placeholder matches the design mock (no hydration mismatch); it starts
// ticking once mounted on the client. Stops cleanly on unmount.
export function LiveClock({ initial = '14:30:10' }: { initial?: string }) {
  const [time, setTime] = useState(initial);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <>{time}</>;
}
