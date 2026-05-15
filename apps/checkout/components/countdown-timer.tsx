'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCountdown } from '@/lib/format';

interface CountdownTimerProps {
  expiresAt:  string;
  onExpired:  () => void;
}

/**
 * MM:SS countdown with a wine progress bar.
 * Calls onExpired once when the timer reaches zero.
 */
export default function CountdownTimer({ expiresAt, onExpired }: CountdownTimerProps) {
  const totalMs        = useRef(new Date(expiresAt).getTime() - Date.now());
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );
  const expiredFired = useRef(false);

  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(ms);
      if (ms === 0 && !expiredFired.current) {
        expiredFired.current = true;
        onExpired();
      }
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  const progress = totalMs.current > 0
    ? Math.max(0, Math.min(100, (remaining / totalMs.current) * 100))
    : 0;

  const isUrgent = remaining < 60_000;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-2">
        <svg
          className={`h-4 w-4 shrink-0 ${isUrgent ? 'text-warning' : 'text-gray-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${
            isUrgent ? 'text-warning' : 'text-gray-600'
          }`}
        >
          {formatCountdown(remaining)}
        </span>
        <span className="text-xs text-gray-400">restantes</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            isUrgent ? 'bg-warning' : 'bg-wine'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
