import type { CSSProperties } from 'react';
import { METHOD_SWATCH, STATUS_SWATCH, STATUS_TEXT, isHttpMethod, statusClass } from './http';

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * An HTTP method: the verb in a fixed-width technical badge. The text is the
 * verb itself — a screen reader says "POST", a colour-blind reader reads it.
 */
export function ApiMethod({ method, size = 'md' }: { method: string; size?: 'sm' | 'md' }) {
  const m = method.toUpperCase();
  const sw = isHttpMethod(m) ? METHOD_SWATCH[m] : METHOD_SWATCH.HEAD;
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    minWidth: size === 'sm' ? 44 : 56,
    height: size === 'sm' ? 18 : 22,
    padding: '0 6px',
    borderRadius: 5,
    border: `1px solid ${sw.bd}`,
    background: sw.bg,
    color: sw.fg,
    fontFamily: MONO,
    fontSize: size === 'sm' ? 10 : 11,
    fontWeight: 700,
    letterSpacing: '.04em',
    lineHeight: 1,
    boxSizing: 'border-box',
  };
  return <span data-http-method={m} style={style}>{m}</span>;
}

/**
 * An HTTP status: the code, and its reason phrase unless `compact`. 2xx success,
 * 4xx the request needs changing, 5xx the service failed.
 */
export function HttpStatus({ code, compact = false, label }: { code: number | string; compact?: boolean; label?: string }) {
  // A class ("5xx") is drawn in its class colour, from its first digit.
  const n = typeof code === 'number' ? code : Number(String(code).replace(/x/gi, '0'));
  const sw = STATUS_SWATCH[statusClass(n)];
  const text = label ?? (typeof code === 'number' ? STATUS_TEXT[code] : undefined);
  return (
    <span
      data-http-status={code}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flex: 'none', height: 20, padding: '0 7px',
        borderRadius: 999, border: `1px solid ${sw.bd}`, background: sw.bg, color: sw.fg,
        fontFamily: MONO, fontSize: 11, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', boxSizing: 'border-box',
      }}
    >
      <span>{code}</span>
      {!compact && text ? <span style={{ fontWeight: 500 }}>{text}</span> : null}
    </span>
  );
}

/** An endpoint path: crisp monospace, allowed to break only after a slash. */
export function ApiPath({ path, size = 15, color = '#241d20' }: { path: string; size?: number; color?: string }) {
  const parts = path.split('/');
  return (
    <span data-api-path style={{ fontFamily: MONO, fontSize: size, fontWeight: 600, color, letterSpacing: '-.01em', minWidth: 0 }}>
      {parts.map((p, i) => (
        <span key={i}>{i > 0 ? <>/<wbr /></> : null}{p}</span>
      ))}
    </span>
  );
}
