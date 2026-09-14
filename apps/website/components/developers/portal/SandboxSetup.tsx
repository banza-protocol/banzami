'use client';

import { useState, type CSSProperties } from 'react';
import { developerApi, ApiError, type FinancialSetupState, type SandboxUseCase } from '@/lib/developer-api';
import { Card, FIELD_ERROR, FIELD_HINT, SECONDARY_BUTTON, primaryButton } from './ui';

/**
 * Configuração financeira in the Sandbox (ADR-060) — no review, no operator.
 *
 * The developer says what they are building. Core provisions a Sandbox
 * Business for the Project, marked SANDBOX_SYNTHETIC — a test entity, never
 * verified — and classifies and prices it by policy. The developer never
 * chooses a type, a pricing profile or a rate; this page does not even show a
 * field for one.
 *
 * Connecting a Business that already exists stays available, with its consent
 * code; so does sharing this Project's Sandbox Business with another Project.
 */

const P: CSSProperties = { margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: '#6a5a5e', fontWeight: 600 };

export const USE_CASES: { id: SandboxUseCase; title: string; body: string; gets: string }[] = [
  {
    id: 'STANDARD',
    title: 'Loja, serviço ou negócio',
    body: 'Recebe pagamentos dos seus clientes: links, QR, checkout. O dinheiro fica no seu negócio de teste.',
    gets: 'Classificação Comerciante · preço Sandbox padrão',
  },
  {
    id: 'APPLICATION',
    title: 'Aplicação ou plataforma',
    body: 'Recebe em nome de terceiros e liquida para eles, com uma taxa de aplicação — como uma app de doações ou um marketplace.',
    gets: 'Classificação Aplicação · preço Sandbox de referência, com taxa de aplicação',
  },
];

export function useCaseTitle(u: string | null | undefined): string {
  return USE_CASES.find((x) => x.id === u)?.title ?? '—';
}

function UseCaseChoice({ value, onChange, disabled }: { value: SandboxUseCase | null; onChange: (u: SandboxUseCase) => void; disabled?: boolean }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '16px 0 0' }}>
      <legend style={{ fontSize: 13, fontWeight: 900, color: '#2a2024', marginBottom: 8 }}>O que está a construir?</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {USE_CASES.map((u) => {
          const on = value === u.id;
          return (
            <label
              key={u.id}
              data-testid={`use-case-${u.id}`}
              style={{
                display: 'block', padding: 16, borderRadius: 14, cursor: disabled ? 'default' : 'pointer',
                border: `1.5px solid ${on ? '#B5101F' : '#EBDBD9'}`, background: on ? '#FFF7F6' : '#fff',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="radio" name="use_case" value={u.id} checked={on} disabled={disabled} onChange={() => onChange(u.id)} />
                <span style={{ fontSize: 15, fontWeight: 900, color: '#2a2024' }}>{u.title}</span>
              </span>
              <span style={{ display: 'block', margin: '6px 0 0 24px', fontSize: 13.5, lineHeight: 1.55, color: '#6a5a5e', fontWeight: 600 }}>{u.body}</span>
              <span style={{ display: 'block', margin: '8px 0 0 24px', fontSize: 12, color: '#8a7a7e', fontWeight: 800 }}>{u.gets}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function refusalText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  switch (code) {
    case 'SANDBOX_ONLY': return 'A configuração automática só existe na Sandbox.';
    case 'USE_CASE_SEALED': return 'Este projeto já emitiu pagamentos: o tipo de uso já não pode mudar.';
    case 'APPLICATION_IN_PROGRESS': return 'Este projeto tem uma candidatura em curso.';
    case 'PROJECT_ALREADY_RECEIVING': return 'Este projeto já recebe num negócio.';
    case 'FORBIDDEN': return 'Só um Owner ou Admin do workspace pode fazer isto.';
    case 'NO_SANDBOX_BUSINESS': return 'Este projeto não tem um negócio de teste próprio para partilhar.';
    default: return 'Não foi possível concluir agora. Tente novamente.';
  }
}

/** A Project without a Business, in the Sandbox: pick a use case, done. */
export function SandboxSetupStart({
  projectId, csrf, canAct, onDone, onConnectExisting,
}: { projectId: string; csrf: string; canAct: boolean; onDone: (message: string) => void; onConnectExisting: () => void }) {
  const [useCase, setUseCase] = useState<SandboxUseCase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    if (!useCase || busy) return;
    setBusy(true);
    setError('');
    try {
      await developerApi.setUpSandboxBusiness(projectId, useCase, csrf);
      onDone('Negócio de teste criado e ligado a este projeto. Já pode receber pagamentos na Sandbox.');
    } catch (e) {
      setError(refusalText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="sandbox-setup-start">
      <p style={P}>
        Na Sandbox, o Banzami cria um negócio de teste para este projeto — sem candidatura e sem esperar por ninguém. É
        uma entidade de teste: não é verificado, e o valor é fictício.
      </p>
      <UseCaseChoice value={useCase} onChange={setUseCase} disabled={!canAct || busy} />
      <p style={FIELD_HINT}>
        A classificação e o preço são atribuídos pelo Banzami para o uso que escolher. A sua aplicação nunca envia uma taxa.
      </p>
      {canAct ? (
        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" data-testid="sandbox-setup-go" onClick={() => void go()} disabled={!useCase || busy} style={primaryButton(!useCase || busy)}>
            {busy ? 'A configurar…' : 'Configurar a Sandbox'}
          </button>
          <button type="button" onClick={onConnectExisting} style={SECONDARY_BUTTON}>
            Ligar um negócio que já existe
          </button>
        </div>
      ) : (
        <p style={{ ...P, fontSize: 13.5, color: '#8a7a7e', fontWeight: 700 }}>Só um Owner ou Admin do workspace pode configurar.</p>
      )}
      {error && <p role="alert" style={FIELD_ERROR}>{error}</p>}
    </div>
  );
}

/** A Project that receives into its Sandbox Business: use case, change, share. */
export function SandboxBusinessPanel({
  setup, projectId, csrf, canAct, onChanged,
}: { setup: FinancialSetupState; projectId: string; csrf: string; canAct: boolean; onChanged: (message: string) => void }) {
  const current = (setup.sandbox_use_case ?? null) as SandboxUseCase | null;
  const [changing, setChanging] = useState(false);
  const [next, setNext] = useState<SandboxUseCase | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [share, setShare] = useState<{ code: string; expires_at: string } | null>(null);

  if (!current) return null; // connected to a Business this Project does not own

  async function change() {
    if (!next || next === current || busy) return;
    setBusy(true);
    setError('');
    try {
      await developerApi.changeSandboxUseCase(projectId, next, csrf);
      setChanging(false);
      onChanged(`Uso alterado para “${useCaseTitle(next)}”. A classificação e o preço foram atualizados.`);
    } catch (e) {
      setError(refusalText(e));
    } finally {
      setBusy(false);
    }
  }

  async function issueShare() {
    setBusy(true);
    setError('');
    try {
      setShare(await developerApi.shareSandboxBusiness(projectId, csrf));
    } catch (e) {
      setError(refusalText(e));
    } finally {
      setBusy(false);
    }
  }

  const expires = share ? new Date(share.expires_at) : null;
  return (
    <Card style={{ padding: 22, marginBottom: 16 }}>
      <div data-testid="sandbox-business-panel">
        <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 900 }}>Negócio de teste deste projeto</h2>
        <p style={{ ...P, fontSize: 13.5 }}>
          Uso: <strong style={{ color: '#2a2024' }}>{useCaseTitle(current)}</strong>. É um negócio de teste da Sandbox
          (<code style={{ fontSize: 12 }}>SANDBOX_SYNTHETIC</code>): não passa por verificação e não existe fora da Sandbox.
        </p>

        {canAct && !setup.sealed && !changing && (
          <button type="button" onClick={() => { setNext(current); setChanging(true); }} style={{ ...SECONDARY_BUTTON, marginTop: 12 }}>
            Mudar o tipo de uso
          </button>
        )}
        {setup.sealed && (
          <p style={{ ...FIELD_HINT, marginTop: 10 }}>O tipo de uso fixou-se com o primeiro pagamento emitido.</p>
        )}
        {changing && (
          <>
            <UseCaseChoice value={next} onChange={setNext} disabled={busy} />
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => void change()} disabled={busy || next === current} style={primaryButton(busy || next === current)}>
                {busy ? 'A alterar…' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setChanging(false)} style={SECONDARY_BUTTON}>Cancelar</button>
            </div>
          </>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F3EDEC' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>Usar este negócio noutro projeto</h3>
          <p style={{ ...P, fontSize: 13.5 }}>
            Gere um código e introduza-o no outro projeto, em “Ligar um negócio que já existe”. Vale dez minutos e uma vez.
          </p>
          {canAct ? (
            <button type="button" data-testid="sandbox-share" onClick={() => void issueShare()} disabled={busy} style={{ ...SECONDARY_BUTTON, marginTop: 10 }}>
              Gerar código de ligação
            </button>
          ) : (
            <p style={{ ...FIELD_HINT }}>Só um Owner ou Admin do workspace pode gerar um código.</p>
          )}
          {share && (
            <p role="status" data-testid="sandbox-share-code" style={{ margin: '12px 0 0', fontSize: 14, fontWeight: 800, color: '#2a2024' }}>
              <code style={{ fontSize: 18, letterSpacing: '.08em' }}>{share.code}</code>
              {expires && !Number.isNaN(expires.getTime()) && (
                <span style={{ marginLeft: 10, fontSize: 12.5, color: '#8a7a7e' }}>
                  válido até {expires.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          )}
        </div>
        {error && <p role="alert" style={FIELD_ERROR}>{error}</p>}
      </div>
    </Card>
  );
}
