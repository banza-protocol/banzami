'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { isKnownRole, roleLabel } from '@/lib/developer-roles';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Who is signed in, and the three things they can do about it.
 *
 * The header used to show an avatar with two letters in it and nothing else.
 * Both facts were wrong:
 *
 *   * the two letters were `email.slice(0,2)`. Sign-up is email-OTP only and no
 *     name was ever collected, so "CO" was not anyone's initials — it was the
 *     start of contacto@, and every colleague at that domain rendered the same
 *     circle. An identity control that cannot tell two people apart is worse
 *     than one that admits it does not know, so with no name on the account
 *     this draws a person glyph and the first item in the menu asks for one.
 *
 *   * the avatar was a button whose entire action was signing out. It looked
 *     like a menu — that is what an avatar in a header is — and it was not one.
 *     It is now the menu it looked like, and signing out is an item inside it
 *     behind a confirmation.
 *
 * Presentational on purpose: the session, the workspace role and the API calls
 * are wired by PortalShell. That keeps this testable without standing up the
 * auth and data providers, which is the whole reason none of the above was
 * covered before.
 */

/**
 * Initials of a PERSON, or null when there is no person's name to take them
 * from. Never derived from the email — see above; the null is the point.
 */
export function initialsOf(name?: string | null): string | null {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function PersonGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.4" r="3.7" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M4.9 19.5c.9-3.4 3.7-5.3 7.1-5.3s6.2 1.9 7.1 5.3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ITEM: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  width: '100%',
  padding: '10px 14px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  textDecoration: 'none',
  fontSize: 13.5,
  fontWeight: 800,
  color: '#2a2024',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export function UserMenu({
  user,
  role,
  onSetName,
  onLogout,
}: {
  user: { email: string; name?: string } | null;
  /** The role in the ACTIVE workspace, or null while it is not known. Never a default. */
  role: string | null;
  /** Rejects with a message to show on the field; resolves when the name is stored. */
  onSetName: (name: string) => Promise<void>;
  /** Rejects when the server could not revoke the session — the dialog keeps it. */
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const nameId = useId();

  const name = user?.name?.trim() || '';
  const initials = initialsOf(name);
  // Portuguese, from the shared role vocabulary — never the wire word. A role
  // this build does not recognise still gets a sentence a reader can act on,
  // with the code itself on `title` for a support conversation.
  const rolePt = role ? roleLabel(role) : null;

  function close(returnFocus = true) {
    setOpen(false);
    setEditing(false);
    setNameError('');
    if (returnFocus) trigger.current?.focus();
  }

  // Focus moves INTO the menu on open — a menu a keyboard user has to tab
  // across the whole header to reach is not open, it is merely visible.
  useEffect(() => {
    if (!open) return;
    const first = popup.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (editing) nameField.current?.focus();
  }, [editing]);

  // Outside click closes. Bound only while open, so the header costs nothing
  // in listeners the rest of the time.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popup.current?.contains(t) || trigger.current?.contains(t)) return;
      setOpen(false);
      setEditing(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function focusables(): HTMLElement[] {
    if (!popup.current) return [];
    return [...popup.current.querySelectorAll<HTMLElement>('button, a[href], input')].filter(
      (el) => !(el as HTMLButtonElement).disabled,
    );
  }

  // Escape returns focus to the trigger; Tab and the arrows stay inside. The
  // menu is layered over the page, so a Tab that walked out of it would leave
  // focus somewhere the reader cannot see.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = focusables();
    if (items.length === 0) return;
    e.preventDefault();
    const back = (e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowUp';
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = back
      ? at <= 0
        ? items.length - 1
        : at - 1
      : at < 0 || at === items.length - 1
        ? 0
        : at + 1;
    items[next]?.focus();
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || saving) return;
    setSaving(true);
    setNameError('');
    try {
      await onSetName(value);
      setEditing(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Não foi possível guardar o nome.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name ? `A sua conta — ${name}` : 'A sua conta'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 5,
          border: '1px solid #F0E2E0',
          borderRadius: 30,
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'linear-gradient(150deg,#B5101F,#7C1016)',
            color: '#fff',
            fontWeight: 900,
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {initials ?? <PersonGlyph />}
        </span>
      </button>

      {open ? (
        <div
          ref={popup}
          onKeyDown={onKeyDown}
          style={{
            position: 'absolute',
            top: 'calc(100% + 9px)',
            right: 0,
            zIndex: 60,
            width: 292,
            background: '#fff',
            border: '1px solid #F2E2E0',
            borderRadius: 16,
            boxShadow: '0 26px 60px -30px rgba(181,16,31,.55)',
            overflow: 'hidden',
          }}
        >
          {/* The identity, written out. It used to live in a title attribute,
              which is invisible on touch and to most assistive technology. */}
          <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid #F6EBEA' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: name ? '#2a2024' : '#a08f93' }}>
              {name || 'Sem nome definido'}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, fontWeight: 700, color: '#8a7a7e', wordBreak: 'break-all' }}>
              {user?.email ?? ''}
            </p>
            {/* Nothing at all when the role is not known yet. A default of
                "Observador" would be this Console inventing a permission level
                and showing it as fact. */}
            {rolePt ? (
              <span
                title={role && !isKnownRole(role) ? role : undefined}
                style={{
                  display: 'inline-block',
                  marginTop: 9,
                  padding: '3px 9px',
                  borderRadius: 30,
                  background: '#FFF1F0',
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: '#B5101F',
                }}
              >
                {rolePt}
              </span>
            ) : null}
          </div>

          {editing ? (
            <form onSubmit={saveName} style={{ padding: '13px 14px', borderBottom: '1px solid #F6EBEA' }}>
              <label
                htmlFor={nameId}
                style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#6a5a5e', marginBottom: 6 }}
              >
                Nome
              </label>
              <input
                id={nameId}
                ref={nameField}
                value={draft}
                maxLength={80}
                onChange={(e) => setDraft(e.target.value)}
                aria-invalid={nameError ? true : undefined}
                placeholder="João Manuel"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 11px',
                  border: `1.5px solid ${nameError ? '#E8A0A4' : '#EBDBD9'}`,
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: '#2a2024',
                  fontFamily: 'inherit',
                }}
              />
              {nameError ? (
                <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: '#B5101F' }}>
                  {nameError}
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={!draft.trim() || saving}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    borderRadius: 9,
                    background: !draft.trim() || saving ? '#E7D8D6' : '#B5101F',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: !draft.trim() || saving ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {saving ? 'A guardar…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setNameError('');
                    setDraft(name);
                  }}
                  style={{
                    padding: '8px 14px',
                    border: '1.5px solid #EBDBD9',
                    borderRadius: 9,
                    background: '#fff',
                    color: '#5a4a4e',
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}

          <div role="menu" aria-label="Conta" style={{ padding: '6px 0' }}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setDraft(name);
                setNameError('');
                setEditing((v) => !v);
              }}
              style={ITEM}
            >
              {name ? 'Alterar nome' : 'Complete o seu nome'}
            </button>
            <Link role="menuitem" href="/settings" onClick={() => close(false)} style={ITEM}>
              Segurança
            </Link>
            <div role="separator" style={{ height: 1, background: '#F6EBEA', margin: '6px 0' }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setEditing(false);
                setConfirming(true);
              }}
              style={{ ...ITEM, color: '#B5101F' }}
            >
              Terminar sessão
            </button>
          </div>
        </div>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Terminar sessão neste dispositivo?"
          body="A sessão termina apenas neste dispositivo. Vai precisar de um novo código por email para voltar a entrar."
          subject={user?.email}
          confirmLabel="Terminar sessão"
          onConfirm={onLogout}
          onClose={() => {
            setConfirming(false);
            trigger.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
