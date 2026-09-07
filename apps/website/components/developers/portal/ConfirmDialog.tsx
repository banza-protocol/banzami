'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from './ui';

/**
 * Confirm a destructive action, in the product.
 *
 * Revoking an API key and removing a workspace member went through
 * `window.confirm()`. Both are irreversible, and a native confirm is the wrong
 * control for exactly the same reasons `window.prompt()` was — see NamePrompt:
 *
 *   * it cannot say WHICH. "Revogar esta chave?" is the whole message; the key
 *     it refers to is a row somewhere behind a modal the browser drew.
 *   * it cannot report a failure. If the revoke is refused, the confirm has
 *     already closed and the row still says Ativa with no reason given.
 *   * embedded and automated browsers suppress it, so the button silently does
 *     nothing — on a destructive action, that is worse than an error.
 *
 * `danger` colours the action for something that cannot be undone.
 */
export function ConfirmDialog({
  title,
  body,
  subject,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  /** The thing being acted on, shown verbatim so the reader can check it. */
  subject?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Rejects with a message to show in the dialog; resolves to close. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);

  // Focus lands on Cancel, not on the destructive action.
  useEffect(() => { cancel.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  async function go() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.');
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(42,32,36,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <Card style={{ maxWidth: 460, width: '100%', padding: 26 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 900 }}>{title}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
          {body}
        </p>

        {subject ? (
          <div style={{
            background: '#FDFAFA', border: '1px solid #F2E6E4', borderRadius: 12,
            padding: '10px 14px', marginBottom: 18, fontSize: 12.5, fontWeight: 700,
            color: '#5a4a4e', wordBreak: 'break-all',
          }}>
            {subject}
          </div>
        ) : null}

        {error ? (
          <p role="alert" style={{ margin: '0 0 14px', fontSize: 12.5, fontWeight: 700, color: '#B5101F' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            ref={cancel}
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '10px 16px', borderRadius: 10, border: '1.5px solid #EBDBD9',
              background: '#fff', color: '#5a4a4e', fontSize: 13.5, fontWeight: 800,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void go()}
            disabled={busy}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: busy ? '#E7D8D6' : danger ? '#B5101F' : '#2A1E20',
              color: '#fff', fontSize: 13.5, fontWeight: 800,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'A processar…' : confirmLabel}
          </button>
        </div>
      </Card>
    </div>
  );
}
