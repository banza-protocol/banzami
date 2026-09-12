'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Card } from './ui';

/**
 * The irreversible end of the Console, and the control that guards it.
 *
 * Settings used to end in a red box that said closing a project was "an operator
 * operation and not a button", beside an email address. That was true when there
 * was no endpoint; it is not true now, and a paragraph standing where an action
 * belongs is the same defect as a button that does nothing, pointed the other
 * way.
 *
 * Two rules hold everywhere in this file:
 *
 *   1. The reader is told the CONSEQUENCE before the action is offered — how
 *      many keys die, what history stays, what cannot be undone. A dialog that
 *      discovers the consequence by being refused has already wasted the one
 *      moment the reader was paying attention.
 *   2. Confirming means typing the resource's exact name. The API enforces the
 *      same thing (the request body repeats the name), so this is not UI
 *      theatre standing in for a server check — it is the same check, brought
 *      forward to where the mistake is still free.
 */

const RED = '#B5101F';

/** The bordered region. Visually separate because it is not more settings. */
export function DangerZone({
  title = 'Zona de risco',
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      style={{
        background: '#FFF7F6',
        border: '1px solid #F1CFCC',
        borderRadius: 18,
        padding: 22,
        marginBottom: 16,
      }}
    >
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: RED }}>{title}</h3>
      {description ? (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#a08a8c', fontWeight: 600, lineHeight: 1.6 }}>
          {description}
        </p>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  );
}

/**
 * One destructive action, with its consequence stated beside it.
 *
 * `unavailableReason` is shown INSTEAD of the button, never as a disabled button
 * with a tooltip: "you may not" and "this cannot be done at all" lead to
 * different places, and a greyed-out control says neither.
 */
export function DangerAction({
  title,
  description,
  actionLabel,
  onAction,
  unavailableReason,
  busy = false,
}: {
  title: string;
  description: ReactNode;
  actionLabel: string;
  onAction: () => void;
  unavailableReason?: string | null;
  busy?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
        paddingTop: 14,
        borderTop: '1px solid #F4DEDB',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#2a2024' }}>{title}</p>
        <div style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.6 }}>
          {description}
        </div>
      </div>
      {unavailableReason ? (
        <p style={{ margin: 0, maxWidth: 260, fontSize: 12, color: '#a08a8c', fontWeight: 700, lineHeight: 1.5 }}>
          {unavailableReason}
        </p>
      ) : (
        <button
          type="button"
          onClick={onAction}
          disabled={busy}
          style={{
            flex: 'none',
            padding: '9px 16px',
            border: `1.5px solid ${RED}`,
            borderRadius: 10,
            background: '#fff',
            color: RED,
            fontSize: 13,
            fontWeight: 800,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.55 : 1,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Confirm by writing the name of the thing being destroyed.
 *
 * ConfirmDialog already exists and is the right control for "revoke this key" —
 * one irreversible act on one clearly named row. This is for the acts that take
 * a whole project or a whole workspace with them, where the extra requirement is
 * not caution for its own sake: the server will refuse the call unless the body
 * repeats the name, so a dialog that could be confirmed without it would only be
 * able to produce a 400.
 *
 * `consequence` is a node, not a string, because the true consequence is usually
 * a list of counts the caller has just read from the API.
 */
export function ConfirmByName({
  title,
  body,
  consequence,
  name,
  nameLabel,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  /** What will happen, in the caller's own words — counts, blockers, what stays. */
  consequence?: ReactNode;
  /** The exact name that must be typed. Compared trimmed, as the server does. */
  name: string;
  /** e.g. "Escreva o nome do projeto para confirmar". */
  nameLabel: string;
  confirmLabel: string;
  /** Rejects with a message to show in the dialog; resolves to close. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const errorId = useId();

  useEffect(() => {
    field.current?.focus();
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  // Trimmed on both sides, matching the server's strings.TrimSpace comparison —
  // a name pasted with a trailing space is the right name.
  const matches = typed.trim() === name.trim() && name.trim() !== '';
  const canConfirm = matches && !busy;

  async function go() {
    if (!canConfirm) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.');
      setBusy(false);
      field.current?.focus();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(42,32,36,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <Card style={{ maxWidth: 480, width: '100%', padding: 26 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 900 }}>{title}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
          {body}
        </p>

        {consequence ? (
          <div
            style={{
              background: '#FFF7F6',
              border: '1px solid #F1CFCC',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 18,
              fontSize: 12.5,
              fontWeight: 700,
              color: '#8a5a5e',
              lineHeight: 1.6,
            }}
          >
            {consequence}
          </div>
        ) : null}

        <label htmlFor={fieldId} style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#6a5a5e', marginBottom: 6 }}>
          {nameLabel}
        </label>
        {/* The name is shown verbatim right above the field: this is a
            deliberate act, not a memory test. */}
        <p
          style={{
            margin: '0 0 8px',
            fontSize: 13,
            fontWeight: 800,
            color: '#2a2024',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            wordBreak: 'break-all',
          }}
        >
          {name}
        </p>
        <input
          id={fieldId}
          ref={field}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void go();
            }
          }}
          disabled={busy}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            background: '#fff',
            color: '#2A1E20',
            border: `1.5px solid ${error ? '#D7242E' : '#EBDBD9'}`,
          }}
        />

        {error ? (
          <p id={errorId} role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: RED }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1.5px solid #EBDBD9',
              background: '#fff',
              color: '#5a4a4e',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void go()}
            disabled={!canConfirm}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: canConfirm ? RED : '#E7D8D6',
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: canConfirm ? 'pointer' : 'default',
            }}
          >
            {busy ? 'A processar…' : confirmLabel}
          </button>
        </div>
      </Card>
    </div>
  );
}
