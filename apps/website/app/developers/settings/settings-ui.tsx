'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ApiError, developerApi, type ProjectFootprint } from '@/lib/developer-api';
import { Card } from '@/components/developers/portal/ui';
import { IconCopy } from '@/components/developers/portal/icons';
import { useDeveloperAuth } from '@/components/developers/portal/DeveloperAuth';
import { useDeveloperData } from '@/components/developers/portal/DeveloperData';

/**
 * The pieces both Settings surfaces share.
 *
 * Settings used to be one page: a project's name and id, a WORKSPACE-scoped
 * member list folded in beneath it, and a closing paragraph. Two different
 * things with two different owners and two different blast radii, reading as
 * one screen — so "Remover" in the members section removed someone from every
 * project in the workspace while the heading above it said the name of one
 * project.
 *
 * They are now two pages. This module holds what genuinely belongs to both:
 * the tab strip that says which one you are on, the field chrome, the rename
 * control, and the environment reading.
 */

export const MONO = "'JetBrains Mono', ui-monospace, monospace";

export const FIELD_LABEL: CSSProperties = {
  margin: '0 0 5px',
  fontSize: 12,
  fontWeight: 800,
  color: '#a89a9e',
  letterSpacing: '.02em',
};

export const NOTE: CSSProperties = {
  margin: '10px 0 0',
  fontSize: 12.5,
  color: '#a89a9e',
  fontWeight: 600,
  lineHeight: 1.55,
};

// ── navigation between the two surfaces ──────────────────────────────────────

export type SettingsTab = 'project' | 'workspace';

const TABS: { key: SettingsTab; label: string; href: string }[] = [
  { key: 'project', label: 'Projeto', href: '/settings' },
  { key: 'workspace', label: 'Workspace', href: '/settings/workspace' },
];

/**
 * Which settings you are looking at.
 *
 * Sub-routes rather than in-page tabs, so the answer survives a reload and a
 * pasted link: "open your workspace settings" is a URL a colleague can send.
 */
export function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav
      aria-label="Configurações"
      style={{ display: 'flex', gap: 4, margin: '0 0 22px', borderBottom: '1px solid #F2E2E0' }}
    >
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            style={{
              padding: '10px 14px',
              marginBottom: -1,
              borderBottom: `2px solid ${on ? '#B5101F' : 'transparent'}`,
              color: on ? '#B5101F' : '#8a7a7e',
              fontSize: 14,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ── refusals ─────────────────────────────────────────────────────────────────

/**
 * What to show when the server says no.
 *
 * The provider's own mapper knows six codes and turns everything else into
 * "Serviço indisponível". The lifecycle refusals are all outside those six, so
 * WORKSPACE_NOT_EMPTY — which has an action behind it — arrived as a service
 * outage. The client already carries the right sentence on the error (it fills
 * ApiError.message from MESSAGES, falling back to the server's own words), so
 * this prefers that and keeps the provider's mapper for its 401 side effect.
 */
export function messageFor(e: unknown, generic: string): string {
  if (e instanceof ApiError && e.message) return e.message;
  return generic;
}

/** The machine-readable specifics behind a refusal, when it carried any. */
export function detailsOf(e: unknown): Record<string, unknown> {
  return (e instanceof ApiError && e.details) || {};
}

export function codeOf(e: unknown): string {
  return e instanceof ApiError ? String(e.code) : '';
}

// ── field chrome ─────────────────────────────────────────────────────────────

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p style={FIELD_LABEL}>{label}</p>
      {children}
    </div>
  );
}

export function FieldValue({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#2a2024' }}>{children}</p>;
}

/** A copy control for an identifier the developer has to put in a config file. */
export function CopyValue({ value, what }: { value: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          },
          () => {},
        );
      }}
      className="bz-icobtn"
      aria-label={done ? `${what} copiado` : `Copiar ${what}`}
      title={done ? 'Copiado' : 'Copiar'}
      style={{
        width: 26,
        height: 26,
        border: '1px solid #F0E2E0',
        borderRadius: 7,
        background: done ? '#EAF7F0' : '#fff',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: done ? '#1F8A5B' : '#6a5a5e',
        flex: 'none',
      }}
    >
      <IconCopy size={12} strokeWidth={1.9} />
    </button>
  );
}

export function Identifier({ value, what }: { value: string; what: string }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 13,
        fontWeight: 700,
        fontFamily: MONO,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        wordBreak: 'break-all',
        color: '#2a2024',
      }}
    >
      {value}
      <CopyValue value={value} what={what} />
    </p>
  );
}

/** UTC, stated as UTC. The server sends UTC and a local rendering would lie. */
export function utcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

// ── rename ───────────────────────────────────────────────────────────────────

/**
 * Rename in place.
 *
 * The name used to be presented as immutable — "o nome e o identificador do
 * projeto são fixos depois de criado" — which was half true and therefore
 * worse than either whole. The ID is fixed, and for a real reason: a developer
 * has it in a config file and a deployed container. The NAME is a label, the
 * API has always been willing to change it, and nothing depends on it.
 */
export function RenameField({
  label,
  value,
  hint,
  readOnlyReason,
  onSave,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Why this member may not rename, or null when they may. */
  readOnlyReason?: string | null;
  /** Rejects with a message to show against the field; resolves to close. */
  onSave: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const open = () => {
    setDraft(value);
    setError('');
    setEditing(true);
  };

  const trimmed = draft.trim();
  const changed = trimmed !== value.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 80 && changed && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError('');
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível guardar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <Field label={label}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FieldValue>{value}</FieldValue>
          {readOnlyReason ? null : (
            <button
              type="button"
              onClick={open}
              style={{
                padding: '4px 11px',
                border: '1.5px solid #EBDBD9',
                borderRadius: 8,
                background: '#fff',
                color: '#B5101F',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Alterar
            </button>
          )}
        </div>
        {readOnlyReason ? <p style={NOTE}>{readOnlyReason}</p> : null}
      </Field>
    );
  }

  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={field}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
            if (e.key === 'Escape' && !busy) setEditing(false);
          }}
          disabled={busy}
          maxLength={80}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          style={{
            flex: 1,
            minWidth: 200,
            boxSizing: 'border-box',
            padding: '9px 12px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            background: '#fff',
            color: '#2A1E20',
            border: `1.5px solid ${error ? '#D7242E' : '#EBDBD9'}`,
          }}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          style={{
            padding: '9px 16px',
            border: 'none',
            borderRadius: 10,
            background: canSave ? '#B5101F' : '#E7D8D6',
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
            cursor: canSave ? 'pointer' : 'default',
          }}
        >
          {busy ? 'A guardar…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          style={{
            padding: '9px 14px',
            border: '1.5px solid #EBDBD9',
            borderRadius: 10,
            background: '#fff',
            color: '#5a4a4e',
            fontSize: 13,
            fontWeight: 800,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
      {error ? (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: '#B5101F' }}>
          {error}
        </p>
      ) : null}
      {hint ? <p style={NOTE}>{hint}</p> : null}
    </Field>
  );
}

// ── environment ──────────────────────────────────────────────────────────────

/**
 * Which environment this project is in — read, not asserted.
 *
 * The word "Sandbox" was painted into this Console in something like a dozen
 * places: a sidebar chip, a top-bar chip, a banner, the project selector's own
 * label, the create-project dialog, and a field on this page that claimed to be
 * showing data. None of them asked anything. If this deployment were ever
 * pointed at a different environment they would all keep saying Sandbox, and
 * the one that looked like a data field would be the most convincing.
 *
 * There is no environment column on a project, and that is deliberate upstream:
 * developer-api's own comment says so — the environment is the DEPLOYMENT's,
 * set once at startup from configuration and never from a request. The places
 * it surfaces are GET /projects/{id}/financial-setup (`environment`), the
 * `environment` stamped on every issued key, and the request log. The first is
 * the only one that answers for a project with nothing in it yet, so it is the
 * one this reads.
 *
 * A deployment that cannot say reports UNAVAILABLE, and this renders that as
 * "não confirmado" rather than defaulting to Sandbox. Defaulting to Sandbox is
 * exactly the failure the hard-coded chips already had.
 */
export type EnvironmentReading =
  | { state: 'loading' }
  | { state: 'read'; environment: string }
  | { state: 'unreadable' };

export function useProjectEnvironment(projectID: string | null): EnvironmentReading {
  const [reading, setReading] = useState<EnvironmentReading>({ state: 'loading' });

  useEffect(() => {
    if (!projectID) {
      setReading({ state: 'loading' });
      return;
    }
    let live = true;
    setReading({ state: 'loading' });
    developerApi.financialSetup(projectID).then(
      (s) => {
        if (!live) return;
        const env = (s.environment ?? '').trim();
        setReading(env ? { state: 'read', environment: env } : { state: 'unreadable' });
      },
      () => {
        if (live) setReading({ state: 'unreadable' });
      },
    );
    return () => {
      live = false;
    };
  }, [projectID]);

  return reading;
}

/** SANDBOX → "Sandbox". Anything else is shown as the server said it. */
export function environmentLabel(environment: string): string {
  if (environment === 'SANDBOX') return 'Sandbox';
  if (environment === 'LIVE') return 'Live';
  if (environment === 'UNAVAILABLE') return 'Não confirmado';
  return environment;
}

export function EnvironmentValue({ reading }: { reading: EnvironmentReading }) {
  if (reading.state === 'loading') {
    return (
      <p style={{ margin: 0, fontSize: 13.5, color: '#a89a9e', fontWeight: 700 }}>A ler o ambiente…</p>
    );
  }

  const confirmed = reading.state === 'read' && reading.environment !== 'UNAVAILABLE';
  const label = reading.state === 'read' ? environmentLabel(reading.environment) : 'Não confirmado';

  return (
    <>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 30,
          background: confirmed ? '#FDF3E2' : '#F3EDEC',
          fontSize: 12,
          fontWeight: 800,
          color: confirmed ? '#B8770A' : '#8a7a7e',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: confirmed ? '#E0930F' : '#b8a4a6',
          }}
        />
        {label}
      </span>
      <p style={{ ...NOTE, margin: '8px 0 0' }}>
        {confirmed
          ? 'O ambiente é desta instalação do Banzami, não deste projeto — não há ambiente por projeto. É o mesmo valor que as suas chaves levam e que a API devolve.'
          : 'Esta instalação não declarou um ambiente que a consola possa confirmar. Não assumimos Sandbox por omissão.'}
      </p>
    </>
  );
}

// ── project footprint, in words ──────────────────────────────────────────────

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What the project holds, named the way the SERVER names it.
 *
 * The phrases are built from `blockers[]` in the order the API returns them,
 * rather than from the counts in whatever order reads nicely here, so this can
 * never claim a blocker the server does not have or miss one it added.
 */
export function footprintPhrases(f: ProjectFootprint): string[] {
  const byCode: Record<string, string> = {
    FINANCIAL_SETUP: count(f.bindings, 'ligação financeira', 'ligações financeiras'),
    API_KEYS: count(f.keys, 'chave', 'chaves'),
    API_REQUESTS: count(f.request_logs, 'pedido registado', 'pedidos registados'),
  };
  return (f.blockers ?? []).map((b) => byCode[b] ?? b);
}

/** "Este projeto tem 2 chaves e 14 pedidos registados." — or nothing at all. */
export function footprintSentence(f: ProjectFootprint): string {
  const parts = footprintPhrases(f);
  if (parts.length === 0) return 'Este projeto nunca emitiu uma chave, nunca recebeu um pedido e não tem ligação financeira.';
  const listed = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
  return `Este projeto tem ${listed}.`;
}

// ── a project or workspace that has been retired ─────────────────────────────

/**
 * ARCHIVED, said out loud.
 *
 * An archived project keeps its page, its id and its history, and has no keys
 * and no authority left. Without this mark the page is indistinguishable from a
 * working project, and the developer's next twenty minutes go into wondering
 * why a key they just created does not authenticate.
 */
export function ArchivedBanner({ what }: { what: 'projeto' | 'workspace' }) {
  return (
    <Card
      style={{
        padding: '14px 18px',
        marginBottom: 16,
        background: '#F7F3F2',
        borderColor: '#E4D8D6',
        boxShadow: 'none',
      }}
    >
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: '#5a4a4e' }}>
        {what === 'projeto' ? 'Este projeto está arquivado' : 'Este workspace está arquivado'}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600, color: '#8a7a7e', lineHeight: 1.6 }}>
        {what === 'projeto'
          ? 'As chaves foram revogadas e não é possível emitir novas. O histórico e os registos continuam disponíveis para consulta.'
          : 'O workspace foi encerrado. Continua visível para consulta do histórico.'}
      </p>
    </Card>
  );
}

/** The one place that decides whether something counts as archived. */
export function isArchived(status: string | undefined | null): boolean {
  return status === 'ARCHIVED';
}

// ── loading the project footprint ────────────────────────────────────────────

export type FootprintReading =
  | { state: 'loading' }
  | { state: 'read'; footprint: ProjectFootprint }
  | { state: 'unreadable' };

/**
 * Asked BEFORE delete or archive is offered, never after.
 *
 * The dialog has to be able to say "this project has 2 keys and 14 recorded
 * requests, so it can be archived and not deleted". Discovering that from a 409
 * means the reader typed a name, pressed a red button and was then told the
 * thing they asked for was never possible.
 */
export function useProjectFootprint(projectID: string | null): {
  reading: FootprintReading;
  reload: () => void;
} {
  const [reading, setReading] = useState<FootprintReading>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!projectID) {
      setReading({ state: 'loading' });
      return;
    }
    let live = true;
    setReading({ state: 'loading' });
    developerApi.projectFootprint(projectID).then(
      (f) => {
        if (live) setReading({ state: 'read', footprint: f });
      },
      () => {
        if (live) setReading({ state: 'unreadable' });
      },
    );
    return () => {
      live = false;
    };
  }, [projectID, nonce]);

  return { reading, reload };
}

// ── this member's authority ──────────────────────────────────────────────────

/**
 * My role in the ACTIVE workspace, or null while it is not known.
 *
 * Never defaulted to VIEWER, and never defaulted to OWNER. A default in either
 * direction is a claim: one hides an action the member is entitled to, the
 * other offers an action the server will refuse after they have typed the name
 * of the thing they meant to destroy.
 *
 * The members list is the only place the API states it — there is no
 * GET /workspaces/{id}/me — so this reads it the same way MembersManager does.
 * Advice for rendering only; every mutation is authorised again server-side.
 */
export function useWorkspaceRole(): { role: string | null; load: 'loading' | 'ready' | 'error' } {
  const { user } = useDeveloperAuth();
  const { activeWs } = useDeveloperData();
  const [role, setRole] = useState<string | null>(null);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading');

  const wsID = activeWs?.id ?? null;
  const userID = user?.id ?? null;

  useEffect(() => {
    if (!wsID || !userID) {
      setRole(null);
      setLoad('loading');
      return;
    }
    let live = true;
    setLoad('loading');
    developerApi.listMembers(wsID).then(
      ({ members }) => {
        if (!live) return;
        setRole((members ?? []).find((m) => m.user_id === userID)?.role ?? null);
        setLoad('ready');
      },
      () => {
        if (!live) return;
        setRole(null);
        setLoad('error');
      },
    );
    return () => {
      live = false;
    };
  }, [wsID, userID]);

  return { role, load };
}
