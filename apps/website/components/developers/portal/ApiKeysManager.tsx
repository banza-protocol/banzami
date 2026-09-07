'use client';

import { useCallback, useEffect, useState } from 'react';
import { developerApi, type ApiKey, type NewKey } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { useToast, copyText } from './Toast';
import { Card, Pill } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import { IconCopy, IconRotate, IconShield } from './icons';

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
export function SecretRevealDialog({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const { flash } = useToast();
  const [ack, setAck] = useState(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nova chave secreta"
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
      <Card style={{ maxWidth: 520, width: '100%', padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#B5101F' }}>
            <IconShield size={17} />
          </span>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Guarde a sua chave secreta</h3>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5, color: '#8a7a7e', fontWeight: 600 }}>
          Esta chave de teste (Sandbox) é mostrada <strong>uma única vez</strong>. Copie-a agora — não poderá vê-la
          novamente. Não movimenta dinheiro real.
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
          <code aria-label="Chave secreta" style={{ flex: 1, fontFamily: mono, fontSize: 12.5, color: '#EDE3E1', wordBreak: 'break-all' }}>
            {secret}
          </code>
          <button
            onClick={() => {
              void copyText(secret);
              flash('Chave copiada — guarde-a em segurança');
            }}
            aria-label="Copiar chave"
            style={{ flex: 'none', width: 32, height: 32, border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <IconCopy size={14} strokeWidth={1.9} />
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, fontWeight: 700, color: '#6a5a5e', marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
          Guardei a chave num local seguro.
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
  );
}

const statusKind = (s: string) => (s === 'ACTIVE' ? 'success' : 'neutral') as 'success' | 'neutral';

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

  const projectId = activeProject?.id ?? null;

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
      flash('Chave rotacionada — a antiga deixou de funcionar');
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
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>API Keys</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
            Projeto <strong>{activeProject.name}</strong> · apenas chaves de teste (Sandbox). Não há acesso a produção.
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
                {k === 'SECRET' ? 'Secret (sk_test)' : 'Publishable (pk_test)'}
              </button>
            ))}
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#6a5a5e', marginBottom: 8 }}>Scopes</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {ALL_SCOPES.map((sc) => {
              const on = newScopes.includes(sc);
              return (
                <button
                  key={sc}
                  onClick={() => setNewScopes((prev) => (on ? prev.filter((x) => x !== sc) : [...prev, sc]))}
                  style={{ padding: '5px 11px', borderRadius: 30, border: `1.5px solid ${on ? '#B5101F' : '#EBDBD9'}`, background: on ? '#FFF1F0' : '#fff', color: on ? '#B5101F' : '#8a7a7e', fontFamily: mono, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                  title={SCOPE_HELP[sc] ?? sc}
                >
                  {sc}
                </button>
              );
            })}
          </div>
          <p style={{ margin: '-8px 0 16px', fontSize: 12, color: '#8a7a7e', lineHeight: 1.5 }}>
            Cada scope é uma decisão de autoridade. <code style={{ fontFamily: mono }}>application_settlements:write</code>{' '}
            move dinheiro para um beneficiário — dá-o apenas a uma chave que precise de liquidar.
          </p>
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
        <Card style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Ainda não há chaves</p>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
            Crie a sua primeira chave de teste para começar a integrar em Sandbox.
          </p>
        </Card>
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                {['NOME', 'CHAVE', 'TIPO', 'SCOPES', 'ESTADO', 'ÚLTIMO USO', 'AÇÕES'].map((h, i) => (
                  <th key={h} style={{ padding: i === 0 ? '13px 22px' : '13px 12px', fontSize: 11, fontWeight: 800, textAlign: h === 'AÇÕES' ? 'right' : 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="bz-row" style={{ borderTop: '1px solid #F5E9E7' }}>
                  <td style={{ padding: '14px 22px', fontWeight: 800 }}>{k.name}</td>
                  <td style={{ padding: '14px 12px', fontFamily: mono, color: '#3a2a2e' }}>
                    {k.kind === 'PUBLISHABLE' ? k.public_value || k.prefix : `${k.prefix}…`}
                  </td>
                  <td style={{ padding: '14px 12px' }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: k.kind === 'SECRET' ? '#C4303C' : '#8a7a7e' }}>
                      {k.kind === 'SECRET' ? 'Secret' : 'Publishable'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 12px', fontFamily: mono, fontSize: 11, color: '#8a7a7e' }}>
                    {(k.scopes ?? []).join(', ') || '—'}
                  </td>
                  <td style={{ padding: '14px 12px' }}>
                    <Pill kind={statusKind(k.status)} dot>
                      {k.status === 'ACTIVE' ? 'Ativa' : 'Revogada'}
                    </Pill>
                  </td>
                  <td style={{ padding: '14px 12px', color: '#a89a9e', fontWeight: 700 }}>
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString('pt-PT') : '—'}
                  </td>
                  <td style={{ padding: '14px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {k.status === 'ACTIVE' ? (
                      <>
                        <button
                          onClick={() => setConfirming({ action: 'rotate', key: k })}
                          disabled={busy}
                          title="Rotacionar"
                          aria-label="Rotacionar chave"
                          className="bz-icobtn"
                          style={{ width: 32, height: 32, border: '1px solid #F0E2E0', borderRadius: 9, background: '#fff', cursor: 'pointer', color: '#B5101F', marginRight: 6 }}
                        >
                          <IconRotate size={14} />
                        </button>
                        <button
                          onClick={() => setConfirming({ action: 'revoke', key: k })}
                          disabled={busy}
                          style={{ padding: '6px 12px', border: '1.5px solid #EBC7C4', borderRadius: 9, background: '#fff', color: '#B5101F', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
                        >
                          Revogar
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: '#a89a9e', fontWeight: 700 }}>Inativa</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p style={{ margin: '14px 2px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#9a8a8e' }}>
        <span style={{ color: '#B5101F', display: 'inline-flex' }}>
          <IconShield size={15} />
        </span>
        Chaves revogadas e rotacionadas deixam de funcionar imediatamente. As chaves Live/produção não estão disponíveis.
      </p>

      {confirming ? (
        <ConfirmDialog
          title={confirming.action === 'revoke' ? 'Revogar chave' : 'Rotacionar chave'}
          body={
            confirming.action === 'revoke'
              ? 'A chave deixa de funcionar imediatamente e não pode ser reactivada. Qualquer integração que a use passa a receber 401.'
              : 'É emitido um segredo novo e o actual deixa de funcionar imediatamente. O novo segredo é mostrado uma única vez.'
          }
          subject={`${confirming.key.name} · ${confirming.key.prefix}…`}
          confirmLabel={confirming.action === 'revoke' ? 'Revogar' : 'Rotacionar'}
          danger
          onConfirm={() => (confirming.action === 'revoke' ? revoke(confirming.key) : rotate(confirming.key))}
          onClose={() => setConfirming(null)}
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
