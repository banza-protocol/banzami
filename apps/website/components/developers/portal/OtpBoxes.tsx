'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

/**
 * The canonical six-box OTP input (ADR-060 §6). One digit per box, with
 * auto-advance, backspace-to-previous, paste-distribute and browser one-time-code
 * autofill — the same behaviour as the developer sign-in screen. It reports the
 * code to the parent via onChange and fires onComplete once all six are filled;
 * the parent owns submission (and any exactly-once guard). Remount (via a `key`)
 * to clear it.
 */
const OTP_LEN = 6;

const BOX: CSSProperties = {
  width: 46,
  height: 54,
  textAlign: 'center',
  fontSize: 22,
  fontWeight: 900,
  color: '#2a2024',
  border: '1.5px solid #EBDBD9',
  borderRadius: 12,
  background: '#FFFDFD',
  outline: 'none',
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
};

export function OtpBoxes({
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
}: {
  onChange?: (code: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const filled = useMemo(() => digits.every((d) => d.length === 1), [digits]);
  const code = digits.join('');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    onChange?.(code);
    if (filled) onComplete?.(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, filled]);

  const setAt = (i: number, v: string) =>
    setDigits((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '18px 0 6px' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          data-testid={`otp-box-${i}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d}
          disabled={disabled}
          aria-label={`Dígito ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 1);
            setAt(i, v);
            if (v && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !e.currentTarget.value && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const ds = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LEN).split('');
            if (!ds.length) return;
            setDigits(Array(OTP_LEN).fill('').map((_, idx) => ds[idx] || ''));
            refs.current[Math.min(ds.length, OTP_LEN - 1)]?.focus();
          }}
          style={BOX}
        />
      ))}
    </div>
  );
}
