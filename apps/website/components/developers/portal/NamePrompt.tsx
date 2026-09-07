'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from './ui';

/**
 * Ask for a name, in the product.
 *
 * Creating a workspace and creating a project — the first two things any new
 * developer does — went through `window.prompt()`. It works, and it is the
 * wrong control for four reasons that all show up on the first run:
 *
 *   * a server error has nowhere to go. `createWorkspace` can fail with a
 *     validation or conflict code, and a native prompt has already closed by
 *     then, so the message landed in a toast detached from the field.
 *   * it cannot validate. An empty name was accepted by the dialog and refused
 *     by the API, which is a round trip to learn something the form knew.
 *   * it is unstyled and unlabelled — no association between the question and
 *     the input, nothing announced on error (the accessibility baseline asks
 *     for both).
 *   * embedded and automated browsers suppress it, so the first action in the
 *     Console silently does nothing. That is how this was found.
 *
 * Deliberately small: one field, one action. It is not a form framework.
 */
export function NamePrompt({
  title,
  description,
  label,
  placeholder,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  /** Rejects with a message to show against the field; resolves to close. */
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => { field.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar. Tente novamente.');
      setBusy(false);
      field.current?.focus();
    }
  }

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 800, color: '#6a5a5e', marginBottom: 6 } as const;
  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14, fontWeight: 700,
    background: '#fff', color: '#2A1E20',
    border: `1.5px solid ${error ? '#D7242E' : '#EBDBD9'}`,
  } as const;

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
        {description ? (
          <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
            {description}
          </p>
        ) : null}

        <label htmlFor="name-prompt-field" style={labelStyle}>{label}</label>
        <input
          id="name-prompt-field"
          ref={field}
          value={name}
          onChange={(e) => { setName(e.target.value); if (error) setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
          placeholder={placeholder}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'name-prompt-error' : undefined}
          style={inputStyle}
        />
        {error ? (
          <p id="name-prompt-error" role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: '#B5101F' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
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
            onClick={() => void submit()}
            disabled={!canSubmit}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: canSubmit ? '#B5101F' : '#E7D8D6', color: '#fff',
              fontSize: 13.5, fontWeight: 800, cursor: canSubmit ? 'pointer' : 'default',
            }}
          >
            {busy ? 'A criar…' : submitLabel}
          </button>
        </div>
      </Card>
    </div>
  );
}
