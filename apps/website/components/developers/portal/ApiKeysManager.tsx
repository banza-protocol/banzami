'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { developerApi, type ApiKey, type NewKey } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { useToast, copyText } from './Toast';
import { Card, DocsLink, Pill, type PillKind } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import { useDialogFocus } from './use-dialog-focus';
import { ScopeDrawer, domainLabel, scopeDomain } from './ScopeDrawer';
import { IconCopy, IconRotate, IconSearch, IconShield } from './icons';

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const mono = "'JetBrains Mono', ui-monospace, monospace";
// The scopes a released Gateway route actually enforces — mirrors
// developer.EnforcedScopes in services/developer-api. Tied to it by
// api-key-scopes.test.ts so the two cannot drift.
//
// This list used to be payments:*, transfers:*, refunds:write, webhooks:* and
// customers:read. Every one of those is inert — no route consults them — and
// none of the scopes the Quickstart needs was offered at all, so a developer
// following the public docs built a key that could not call anything. A scope
// picker that offers authority the product does not grant is worse than a short
// list: the key looks right, and fails at the first request.
const ALL_SCOPES = [
  'identity:read',
  'payment_sessions:write',
  'payment_sessions:read',
  'wallet_accounts:create',
  'wallet_accounts:read',
  'application_settlements:write',
  'payment_links:write',
  'payment_links:read',
  'webhooks:write',
  'webhooks:read',
  'refunds:write',
  'refunds:read',
  'transfers:write',
  'customers:read',
];

// Plain-language purpose, shown under each scope. A developer choosing scopes is
// making an authority decision; the raw string does not say what it grants.
const SCOPE_HELP: Record<string, string> = {
  'identity:read':                 'Ler a identidade do projecto (GET /v1/me).',
  'payment_sessions:write':        'Abrir sessões de pagamento — cobrar.',
  'payment_sessions:read':         'Consultar sessões de pagamento.',
  'wallet_accounts:create':        'Abrir contas segregadas dentro do titular do projecto.',
  'wallet_accounts:read':          'Listar as contas do próprio projecto.',
  'application_settlements:write': 'Liquidar — move dinheiro para um beneficiário.',
  'payment_links:write':           'Criar links de pagamento.',
  'payment_links:read':            'Consultar links de pagamento.',
  'webhooks:write':                'Registar, desactivar e rodar o segredo de endpoints.',
  'webhooks:read':                 'Ver endpoints, eventos e entregas.',
  'refunds:write':                 'Devolver dinheiro de um pagamento seu.',
  'refunds:read':                  'Consultar os seus reembolsos.',
  'transfers:write':               'Mover valor entre contas do seu projeto.',
  'customers:read':                'Confirmar que um @banza existe antes de o indicar.',
};

// ── Reveal-once dialog ───────────────────────────────────────────────────────
// The raw secret is passed in as a prop and lives only in the parent's transient
// state. It is shown once, requires explicit acknowledgement, and the parent
// drops it on dismiss / navigation / logout. Never stored or re-fetchable.
export function SecretRevealDialog({
  secret,
  onDismiss,
  title = 'Guarde a sua chave secreta',
  description = 'Esta chave de teste (Sandbox) é mostrada uma única vez. Copie-a agora — não poderá vê-la novamente. Não movimenta dinheiro real.',
  label = 'Chave secreta',
  ack: ackLabel = 'Guardei a chave num local seguro.',
}: {
  secret: string;
  onDismiss: () => void;
  // A webhook signing secret is revealed under exactly the same rule and the
  // same dialog; only the words differ, and calling it "a sua chave secreta"
  // there would tell the developer to put it where their API key goes.
  title?: string;
  description?: string;
  label?: string;
  ack?: string;
}) {
  const { flash } = useToast();
  const [ack, setAck] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  // Focus moves into the dialog and is trapped there. Escape is deliberately
  // NOT wired: this is the one moment the secret exists, and a stray keypress
  // that dismissed it would destroy something unrecoverable. The acknowledgement
  // checkbox is the only way out, which is the point.
  useDialogFocus(surface);
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
      <div ref={surface} style={{ maxWidth: 520, width: '100%' }}>
      <Card style={{ width: '100%', padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#B5101F' }}>
            <IconShield size={17} />
          </span>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>{title}</h3>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5, color: '#8a7a7e', fontWeight: 600 }}>
          {description}
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#2A1E20',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 14,
          }}
        >
          <code aria-label={label} style={{ flex: 1, fontFamily: mono, fontSize: 12.5, color: '#EDE3E1', wordBreak: 'break-all' }}>
            {secret}
          </code>
          <button
            onClick={() => {
              void copyText(secret);
              flash(`${label} copiada — guarde-a em segurança`);
            }}
            aria-label={`Copiar ${label.toLowerCase()}`}
            style={{ flex: 'none', width: 32, height: 32, border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <IconCopy size={14} strokeWidth={1.9} />
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, fontWeight: 700, color: '#6a5a5e', marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
          {ackLabel}
        </label>
        <button
          onClick={onDismiss}
          disabled={!ack}
          style={{
            width: '100%',
            padding: 13,
            border: 'none',
            borderRadius: 12,
            background: ctaGradient,
            color: '#fff',
            fontWeight: 800,
            fontSize: 14,
            cursor: ack ? 'pointer' : 'not-allowed',
            opacity: ack ? 1 : 0.5,
          }}
        >
          Fechar
        </button>
      </Card>
      </div>
    </div>
  );
}

// ── key presentation ─────────────────────────────────────────────────────────

// Every status the key table knows how to name. Anything else is rendered as the
// server sent it: the previous mapping was `ACTIVE ? 'Ativa' : 'Revogada'`, so a
// key in any third state would have been reported to the developer as revoked —
// a credential described as dead while it still authorizes requests. An unknown
// status is shown raw, and flagged as unknown rather than dressed as either.
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativa',
  REVOKED: 'Revogada',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function statusKind(status: string): PillKind {
  if (status === 'ACTIVE') return 'success';
  if (status === 'REVOKED') return 'neutral';
  return 'pending'; // unknown: neither reassure nor condemn
}

// The mask that stands for the part of a secret key nobody can see again.
export const SECRET_MASK = '••••••••';

/**
 * What the table shows in the Chave column.
 *
 * A publishable key is non-secret by definition — it ships in browser and mobile
 * code — so its full value is displayed and copyable.
 *
 * A secret key cannot be: the server stores only HMAC-SHA-256 of it and returns
 * the raw value exactly once, at creation. What it does return on every read is
 * `prefix` — the environment/kind prefix plus the first 8 characters of the key
 * body (services/developer-api/internal/developer/crypto.go, newAPIKey). That
 * prefix is the key's published identity: it is what the developer can compare
 * against the key they hold in order to tell two keys apart.
 *
 * So the mask goes where the undisclosed part actually is — at the end. This
 * deliberately does NOT render a "last four" tail: the server never returns the
 * end of a secret key, and it must not. A tail here could only be invented, or
 * be the published head relabelled as the tail — and either one sends the
 * developer to compare against characters of their key that will not match.
 */
export function maskedKeyValue(k: Pick<ApiKey, 'kind' | 'prefix' | 'public_value'>): string {
  if (k.kind === 'PUBLISHABLE') return k.public_value || k.prefix;
  return `${k.prefix}${SECRET_MASK}`;
}

/** What a copy button on a row puts on the clipboard — never anything secret. */
export function copyableKeyValue(k: Pick<ApiKey, 'kind' | 'prefix' | 'public_value'>): string {
  return k.kind === 'PUBLISHABLE' ? k.public_value || k.prefix : k.prefix;
}

export const KIND_LABEL: Record<ApiKey['kind'], string> = {
  SECRET: 'Secreta',
  PUBLISHABLE: 'Publicável',
};

export type KeyFilter = 'ACTIVE' | 'REVOKED' | 'ALL';

/**
 * Which keys the table shows, and in what order.
 *
 * The server returns every key of the project regardless of status, oldest
 * first (store_pg.go, APIKeysForProject: `ORDER BY created_at`), and rotation
 * leaves the predecessor REVOKED in that list. So a project that has rotated a
 * few times opened on a screen led by dead credentials. Filtering and ordering
 * are done here, over the full response, rather than asked of the API: the list
 * is project-sized, and the alternative is a protocol/API change for a
 * presentation concern.
 *
 * Order: active keys first — those are the ones that can be used, rotated or
 * revoked — then newest first inside each group, so a key just created or just
 * rotated is at the top where the developer is looking.
 */
export function visibleKeys(keys: ApiKey[], filter: KeyFilter, query = ''): ApiKey[] {
  const q = query.trim().toLowerCase();
  return keys
    .filter((k) => (filter === 'ALL' ? true : filter === 'ACTIVE' ? k.status === 'ACTIVE' : k.status !== 'ACTIVE'))
    .filter((k) => !q || k.name.toLowerCase().includes(q) || k.prefix.toLowerCase().includes(q))
    .sort((a, b) => {
      const act = Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE');
      if (act !== 0) return act;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

/** The Scopes cell: a count plus the domains involved — never the raw token list. */
export function scopeSummary(scopes: string[] | null): { count: number; label: string; domains: string } {
  const list = scopes ?? [];
  const domains = [...new Set(list.map(scopeDomain))].map(domainLabel);
  return {
    count: list.length,
    label: list.length === 1 ? '1 permissão' : `${list.length} permissões`,
    domains: domains.length <= 2 ? domains.join(' · ') : `${domains.slice(0, 2).join(' · ')} +${domains.length - 2}`,
  };
}

// Rows shown before "Mostrar mais". Keys accumulate — every rotation adds one —
// and a long-lived project should not open on a table of a hundred of them.
const PAGE = 20;

const dateFmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function ApiKeysManager() {
  const data = useDeveloperData();
  const { activeWs, activeProject, wsLoad, wsError, prjLoad, prjError, csrf, onApiError } = data;
  const { flash } = useToast();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  // The raw secret of a just-created/rotated key — transient, reveal-once.
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'PUBLISHABLE' | 'SECRET'>('SECRET');
  const [newScopes, setNewScopes] = useState<string[]>(['identity:read']);
  const [busy, setBusy] = useState(false);
  // The key an irreversible action is pending on — the dialog names it.
  const [confirming, setConfirming] = useState<{ action: 'revoke' | 'rotate'; key: ApiKey } | null>(null);
  // Active keys are the default view: the API returns revoked ones too, and a
  // project that has rotated a few times is mostly dead credentials.
  const [filter, setFilter] = useState<KeyFilter>('ACTIVE');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  // The key whose scopes are being read in full.
  const [scopesOf, setScopesOf] = useState<ApiKey | null>(null);

  const projectId = activeProject?.id ?? null;

  const rows = useMemo(() => visibleKeys(keys, filter, query), [keys, filter, query]);
  // A new filter or search is a new list; keep paging from the top of it.
  useEffect(() => setShown(PAGE), [filter, query, projectId]);

  const loadKeys = useCallback(async () => {
    if (!projectId) return;
    setLoad('loading');
    setError('');
    try {
      const { keys: k } = await developerApi.listKeys(projectId);
      setKeys(k ?? []);
      setLoad('ready');
    } catch (e) {
      setError(onApiError(e));
      setLoad('error');
    }
  }, [projectId, onApiError]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  // Reveal-once safety: drop any revealed secret when the project changes
  // (navigation) or the component unmounts (route change / logout).
  useEffect(() => {
    return () => setRevealSecret(null);
  }, [projectId]);

  const create = async () => {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      const k: NewKey = await developerApi.createKey(projectId, newKind, newName || 'Chave', newScopes, csrf);
      if (k.secret) setRevealSecret(k.secret); // SECRET keys: reveal once
      setCreating(false);
      setNewName('');
      await loadKeys();
      flash('Chave criada');
    } catch (e) {
      flash(onApiError(e));
    } finally {
      setBusy(false);
    }
  };

  // Both of these stop an existing credential working, immediately and for good.
  // Neither is undoable, so both go through a confirmation that names the key —
  // and the failure stays in that dialog instead of closing over a row that did
  // not change. `onApiError` is what turns a transport error into something a
  // developer can read (and clears auth on 401), so it runs before the rethrow.
  const rotate = async (k: ApiKey) => {
    try {
      const rotated = await developerApi.rotateKey(k.id, csrf);
      if (rotated.secret) setRevealSecret(rotated.secret);
      await loadKeys();
      // Rotation produces two rows: a new ACTIVE key and the predecessor, now
      // REVOKED. The default view hides the predecessor, so the developer would
      // see one row replaced by another and have no confirmation of which one
      // stopped working. Show both, once, right after the act that made them.
      setFilter('ALL');
      setQuery('');
      flash('Chave rotacionada — a nova está ativa, a anterior ficou revogada');
    } catch (e) {
      throw new Error(onApiError(e));
    }
  };

  const revoke = async (k: ApiKey) => {
    try {
      await developerApi.revokeKey(k.id, csrf);
      await loadKeys();
      flash('Chave revogada');
    } catch (e) {
      throw new Error(onApiError(e));
    }
  };

  // ── gates: workspace / project bootstrap ──
  if (wsLoad === 'loading') return <Centered>A carregar…</Centered>;
  if (wsLoad === 'error') return <ErrorState msg={wsError} />;
  if (!activeWs) return <NeedWorkspace onCreate={data.createWorkspace} onError={onApiError} />;
  if (prjLoad === 'loading') return <Centered>A carregar…</Centered>;
  if (prjLoad === 'error') return <ErrorState msg={prjError} />;
  if (!activeProject) return <NeedProject onCreate={data.createProject} onError={onApiError} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Chaves de API</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
            Projeto <strong>{activeProject.name}</strong> · apenas chaves de teste (Sandbox). Não há acesso a produção.
          </p>
          <p style={{ margin: '4px 0 0' }}>
            <DocsLink href="/docs/console#chaves">Scopes, rotação e revogação</DocsLink>{' · '}
            <DocsLink href="/docs/trust#rotacao">Onde guardar a chave</DocsLink>
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="bz-cta"
          style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}
        >
          {creating ? 'Cancelar' : 'Criar chave'}
        </button>
      </div>

      {creating ? (
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#6a5a5e', marginBottom: 8 }}>Nome</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Servidor de produção da app"
            className="bz-in"
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #EBDBD9', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#FFFDFD', outline: 'none', marginBottom: 14 }}
          />
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {(['SECRET', 'PUBLISHABLE'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setNewKind(k)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${newKind === k ? '#B5101F' : '#EBDBD9'}`, background: newKind === k ? '#FFF1F0' : '#fff', color: newKind === k ? '#B5101F' : '#6a5a5e', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                {k === 'SECRET' ? 'Secreta (sk_test)' : 'Publicável (pk_test)'}
              </button>
            ))}
          </div>
          <p id="scopes-label" style={{ fontSize: 13, fontWeight: 800, color: '#6a5a5e', margin: '0 0 4px' }}>Permissões da chave</p>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#8a7a7e', lineHeight: 1.5 }}>
            Cada permissão (<em>scope</em>) é uma decisão de autoridade. <code style={{ fontFamily: mono }}>application_settlements:write</code>{' '}
            move dinheiro para um beneficiário — dá-o apenas a uma chave que precise de liquidar.
          </p>
          {/*
            These were pills whose only selected/unselected signal was colour,
            with no aria-pressed — so nothing announced the state, and what each
            scope actually grants lived in a `title` tooltip that never appears
            on touch and cannot be reached by keyboard. The picker asks for an
            authority decision, so the state is now programmatic and the
            explanation is on the screen.
          */}
          <div role="group" aria-labelledby="scopes-label" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: 8, marginBottom: 16 }}>
            {ALL_SCOPES.map((sc) => {
              const on = newScopes.includes(sc);
              return (
                <button
                  key={sc}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => setNewScopes((prev) => (on ? prev.filter((x) => x !== sc) : [...prev, sc]))}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 9, textAlign: 'left',
                    padding: '9px 11px', borderRadius: 11,
                    border: `1.5px solid ${on ? '#B5101F' : '#EBDBD9'}`,
                    background: on ? '#FFF1F0' : '#fff', cursor: 'pointer',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flex: 'none', width: 16, height: 16, marginTop: 1, borderRadius: 5,
                      border: `1.5px solid ${on ? '#B5101F' : '#D8C6C4'}`,
                      background: on ? '#B5101F' : '#fff', color: '#fff',
                      fontSize: 11, fontWeight: 900, lineHeight: '13px', textAlign: 'center',
                    }}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: on ? '#B5101F' : '#6a5a5e', wordBreak: 'break-all' }}>
                      {sc}
                    </span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: '#9a8a8e' }}>
                      {SCOPE_HELP[sc] ?? sc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={create}
            disabled={busy}
            className="bz-cta"
            style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'A criar…' : 'Criar chave de teste'}
          </button>
        </Card>
      ) : null}

      {load === 'loading' ? (
        <Centered>A carregar chaves…</Centered>
      ) : load === 'error' ? (
        <ErrorState msg={error} />
      ) : keys.length === 0 ? (
        // A project with no keys at all. An empty table says nothing; this says
        // what is missing and where the one action is.
        <Card style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Ainda não há chaves neste projeto</p>
          <p style={{ margin: '6px 0 14px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
            Crie a sua primeira chave de teste para começar a integrar em Sandbox.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="bz-cta"
            style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}
          >
            Criar a primeira chave
          </button>
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div role="group" aria-label="Filtrar chaves por estado" style={{ display: 'flex', gap: 6 }}>
              {([
                ['ACTIVE', 'Ativas'],
                ['REVOKED', 'Revogadas'],
                ['ALL', 'Todas'],
              ] as const).map(([value, label]) => {
                const on = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(value)}
                    style={{
                      padding: '8px 14px', borderRadius: 10,
                      border: `1.5px solid ${on ? '#B5101F' : '#EBDBD9'}`,
                      background: on ? '#FFF1F0' : '#fff',
                      color: on ? '#B5101F' : '#6a5a5e',
                      fontSize: 13, fontWeight: 800, cursor: 'pointer',
                    }}
                  >
                    {label}
                    <span style={{ marginLeft: 6, fontWeight: 700, opacity: 0.7 }}>
                      {visibleKeys(keys, value).length}
                    </span>
                  </button>
                );
              })}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200, border: '1.5px solid #EBDBD9', borderRadius: 10, padding: '0 12px', background: '#FFFDFD' }}>
              <span style={{ color: '#a89a9e', display: 'inline-flex' }}><IconSearch size={14} /></span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Procurar por nome ou prefixo"
                aria-label="Procurar chaves por nome ou prefixo"
                style={{ flex: 1, padding: '10px 0', border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontWeight: 600 }}
              />
            </label>
          </div>

          {rows.length === 0 ? (
            <Card style={{ padding: '32px 24px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>
                {query
                  ? 'Nenhuma chave corresponde à pesquisa'
                  : filter === 'ACTIVE'
                    ? 'Nenhuma chave ativa neste projeto'
                    : 'Nenhuma chave revogada neste projeto'}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8a7a7e', fontWeight: 600 }}>
                {filter === 'ALL' ? 'Limpe a pesquisa para ver todas as chaves.' : 'Mude o filtro para Todas para ver as restantes.'}
              </p>
            </Card>
          ) : (
            <Card style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    {['NOME', 'CHAVE', 'PERMISSÕES', 'CRIADA', 'ÚLTIMO USO', 'ESTADO', 'AÇÕES'].map((h, i) => (
                      <th key={h} scope="col" style={{ padding: i === 0 ? '13px 22px' : '13px 12px', fontSize: 11, fontWeight: 800, textAlign: h === 'AÇÕES' ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((k) => {
                    const scopes = scopeSummary(k.scopes);
                    const revoked = k.status !== 'ACTIVE';
                    return (
                      <tr key={k.id} className="bz-row" style={{ borderTop: '1px solid #F5E9E7', opacity: revoked ? 0.62 : 1 }}>
                        <td style={{ padding: '14px 22px', fontWeight: 800 }}>{k.name}</td>
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <code style={{ fontFamily: mono, fontSize: 12, color: '#3a2a2e', whiteSpace: 'nowrap' }}>
                              {maskedKeyValue(k)}
                            </code>
                            {/*
                              The shell delegates any [data-copy] click to the
                              clipboard and toasts it. For a secret key what is
                              copied is the published prefix — the identity, which
                              is all the server has — never the masked rendering.
                            */}
                            <button
                              type="button"
                              data-copy={copyableKeyValue(k)}
                              aria-label={k.kind === 'PUBLISHABLE' ? `Copiar chave ${k.name}` : `Copiar identificador da chave ${k.name}`}
                              title={k.kind === 'PUBLISHABLE' ? 'Copiar chave' : 'Copiar identificador'}
                              className="bz-icobtn"
                              style={{ flex: 'none', width: 26, height: 26, border: '1px solid #F0E2E0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#8a7a7e' }}
                            >
                              <IconCopy size={12} strokeWidth={1.9} />
                            </button>
                          </div>
                          <span style={{ display: 'block', marginTop: 3, fontSize: 11, fontWeight: 800, color: k.kind === 'SECRET' ? '#C4303C' : '#8a7a7e' }}>
                            {KIND_LABEL[k.kind]}
                          </span>
                        </td>
                        <td style={{ padding: '14px 12px' }}>
                          {scopes.count === 0 ? (
                            <span style={{ color: '#a89a9e', fontWeight: 700 }}>Nenhuma</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setScopesOf(k)}
                              aria-label={`Ver as ${scopes.label} da chave ${k.name}`}
                              style={{ padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
                            >
                              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#B5101F' }}>{scopes.label}</span>
                              <span style={{ display: 'block', marginTop: 1, fontSize: 11.5, fontWeight: 600, color: '#8a7a7e' }}>{scopes.domains}</span>
                            </button>
                          )}
                        </td>
                        <td style={{ padding: '14px 12px', color: '#8a7a7e', fontWeight: 700, whiteSpace: 'nowrap' }}>{dateFmt(k.created_at)}</td>
                        <td style={{ padding: '14px 12px', color: '#a89a9e', fontWeight: 700, whiteSpace: 'nowrap' }}>{dateFmt(k.last_used_at)}</td>
                        <td style={{ padding: '14px 12px' }}>
                          <Pill kind={statusKind(k.status)} dot>
                            {statusLabel(k.status)}
                          </Pill>
                        </td>
                        <td style={{ padding: '14px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {k.status === 'ACTIVE' ? (
                            <>
                              <button
                                onClick={() => setConfirming({ action: 'rotate', key: k })}
                                disabled={busy}
                                title="Rotacionar"
                                aria-label={`Rotacionar chave ${k.name}`}
                                className="bz-icobtn"
                                style={{ width: 32, height: 32, border: '1px solid #F0E2E0', borderRadius: 9, background: '#fff', cursor: 'pointer', color: '#B5101F', marginRight: 6 }}
                              >
                                <IconRotate size={14} />
                              </button>
                              <button
                                onClick={() => setConfirming({ action: 'revoke', key: k })}
                                disabled={busy}
                                aria-label={`Revogar chave ${k.name}`}
                                style={{ padding: '6px 12px', border: '1.5px solid #EBC7C4', borderRadius: 9, background: '#fff', color: '#B5101F', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
                              >
                                Revogar
                              </button>
                            </>
                          ) : (
                            // The state is already on this row, in the Estado
                            // column. Repeating it here in a different word —
                            // "Inativa" beside a pill reading "Revogada" — read
                            // as two different facts about the same key.
                            <span aria-hidden style={{ fontSize: 12, color: '#c8b8ba', fontWeight: 700 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > shown ? (
                <div style={{ padding: '12px 22px', borderTop: '1px solid #F5E9E7', textAlign: 'center' }}>
                  <button
                    onClick={() => setShown((n) => n + PAGE)}
                    style={{ padding: '9px 16px', border: '1.5px solid #EBDBD9', borderRadius: 10, background: '#fff', color: '#6a5a5e', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                  >
                    Mostrar mais ({rows.length - shown})
                  </button>
                </div>
              ) : null}
            </Card>
          )}
        </>
      )}

      <p style={{ margin: '14px 2px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#9a8a8e' }}>
        <span style={{ color: '#B5101F', display: 'inline-flex' }}>
          <IconShield size={15} />
        </span>
        Chaves revogadas e rotacionadas deixam de funcionar imediatamente. O segredo de uma chave secreta é
        mostrado uma única vez, na criação — a consola só volta a mostrar o prefixo público. As chaves
        Live/produção não estão disponíveis.
      </p>

      {confirming ? (
        <ConfirmDialog
          title={confirming.action === 'revoke' ? 'Revogar chave' : 'Rotacionar chave'}
          body={
            confirming.action === 'revoke'
              ? 'A chave deixa de funcionar imediatamente e não pode ser reactivada. Qualquer integração que a use passa a receber 401.'
              : 'É emitido um segredo novo e o actual deixa de funcionar imediatamente — a chave anterior fica revogada na lista. O novo segredo é mostrado uma única vez e não é recuperável depois.'
          }
          subject={`${confirming.key.name} · ${maskedKeyValue(confirming.key)}`}
          confirmLabel={confirming.action === 'revoke' ? 'Revogar' : 'Rotacionar'}
          danger
          onConfirm={() => (confirming.action === 'revoke' ? revoke(confirming.key) : rotate(confirming.key))}
          onClose={() => setConfirming(null)}
        />
      ) : null}

      {scopesOf ? (
        <ScopeDrawer
          keyName={scopesOf.name}
          scopes={scopesOf.scopes ?? []}
          help={SCOPE_HELP}
          onClose={() => setScopesOf(null)}
        />
      ) : null}

      {revealSecret ? <SecretRevealDialog secret={revealSecret} onDismiss={() => setRevealSecret(null)} /> : null}
    </div>
  );
}

// ── shared small states ──────────────────────────────────────────────────────
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: '#8a7a7e', fontWeight: 700, fontSize: 14 }}>{children}</div>
  );
}
function ErrorState({ msg }: { msg: string }) {
  return (
    <Card style={{ padding: '32px 24px', textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#C4303C' }}>{msg || 'Serviço indisponível.'}</p>
    </Card>
  );
}
function NeedWorkspace({ onCreate, onError }: { onCreate: (n: string) => Promise<unknown>; onError: (e: unknown) => string }) {
  return <Bootstrap title="Crie o seu primeiro workspace" placeholder="A minha empresa" cta="Criar workspace" onCreate={onCreate} onError={onError} />;
}
function NeedProject({ onCreate, onError }: { onCreate: (n: string) => Promise<unknown>; onError: (e: unknown) => string }) {
  return <Bootstrap title="Crie o seu primeiro projeto (Sandbox)" placeholder="Minha Loja Online" cta="Criar projeto" onCreate={onCreate} onError={onError} />;
}
function Bootstrap({
  title,
  placeholder,
  cta,
  onCreate,
  onError,
}: {
  title: string;
  placeholder: string;
  cta: string;
  onCreate: (n: string) => Promise<unknown>;
  onError: (e: unknown) => string;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Card style={{ maxWidth: 460, margin: '20px auto', padding: 26, textAlign: 'center' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 900 }}>{title}</h3>
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>Ambiente Sandbox — sem dinheiro real.</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="bz-in"
        style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #EBDBD9', borderRadius: 12, fontSize: 14, fontWeight: 600, background: '#FFFDFD', outline: 'none', marginBottom: 12 }}
      />
      {err ? <p style={{ margin: '0 0 12px', fontSize: 13, color: '#C4303C', fontWeight: 700 }}>{err}</p> : null}
      <button
        onClick={async () => {
          if (!name.trim() || busy) return;
          setBusy(true);
          setErr('');
          try {
            await onCreate(name.trim());
          } catch (e) {
            setErr(onError(e));
          } finally {
            setBusy(false);
          }
        }}
        className="bz-cta"
        style={{ width: '100%', padding: 13, border: 'none', borderRadius: 12, background: ctaGradient, color: '#fff', fontWeight: 800, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'A criar…' : cta}
      </button>
    </Card>
  );
}
