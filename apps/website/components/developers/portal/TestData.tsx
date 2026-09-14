'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { developerApi, ApiError, type SandboxResetResult } from '@/lib/developer-api';
import { formatMoneyDisplay, tryParseMoneyInput } from '@/lib/money';
import { useDeveloperData } from './DeveloperData';
import { Card, DocsLink, FIELD_ERROR, FIELD_HINT, FIELD_INPUT, FIELD_LABEL, Pill, SECONDARY_BUTTON, primaryButton } from './ui';
import { explorerRefusal, newIdempotencyKey, useExplorer } from './useExplorer';

/**
 * Dados de teste — the Project's Sandbox test payers, the deterministic
 * scenarios, and the reset (ADR-060 §4, §5, §10).
 *
 * Every operation here is the published API, run through the API Explorer's
 * broker: what this page does, an integration can do with the same calls, and
 * each one appears in Logs. Value is fictitious and only ever moves through the
 * ledger — a top-up is a posting, never a balance edit; a reset retires value,
 * never deletes history.
 */

const mono = "'JetBrains Mono', ui-monospace, monospace";
const P: CSSProperties = { margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#6a5a5e', fontWeight: 600 };

type TestPayer = {
  id: string; handle: string; label: string | null; status: string; balance_minor: number | null;
  currency: string; created_at: string; retired_at: string | null;
};
type Scenario = { id: string; group: string; simulated: boolean; goal: { pt: string }; trigger: { pt: string }; result: { pt: string }; event?: string | null };

const kz = (minor: number | null) => formatMoneyDisplay(minor);

function responseError(status: number, body: unknown): string {
  const code = (body as { code?: string } | undefined)?.code ?? '';
  const MSG: Record<string, string> = {
    SANDBOX_QUOTA_EXCEEDED: 'Chegou a um limite da Sandbox do projeto: 10 pagadores ativos, ou 20 carregamentos e 100 000 Kz em 24 horas.',
    SANDBOX_FUNDING_REFUSED: 'O carregamento passaria o saldo máximo de um pagador de teste (50 000 Kz).',
    TEST_PAYER_RETIRED: 'Este pagador foi retirado.',
    INSUFFICIENT_FUNDS: 'O pagador não tem saldo suficiente. Carregue-o primeiro.',
    INTERFACE_UNAVAILABLE: 'A sessão não oferece esta via (uma sessão de montante aberto paga-se por link).',
    NOT_FOUND: 'Não encontrado neste projeto.',
    PAYMENTS_UNAVAILABLE: 'Configure a Sandbox primeiro, em Configuração financeira.',
    PAYMENT_DECLINED: 'Simulação: o rail externo recusou. Nada se moveu.',
    PROVIDER_UNAVAILABLE: 'Simulação: fornecedor indisponível. Nada se moveu.',
    SANDBOX_SIMULATED_TIMEOUT: 'Simulação: sem resposta a tempo. O pagamento foi feito — repita com a mesma chave para ler o resultado.',
    LINK_ALREADY_PAID: 'Este link já foi pago.',
    LINK_NOT_ACTIVE: 'O link já não está ativo.',
  };
  return MSG[code] ?? `A API respondeu ${status}${code ? ` ${code}` : ''}.`;
}

export function TestData() {
  const { activeProject, csrf } = useDeveloperData();
  const projectId = activeProject?.id;
  const { run, busy } = useExplorer(projectId, csrf);

  const [payers, setPayers] = useState<TestPayer[] | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [label, setLabel] = useState('');
  const [fund, setFund] = useState<{ id: string; amount: string; key: string } | null>(null);
  const [pay, setPay] = useState<{ id: string; target: string; kind: 'session' | 'link'; via: 'LINK' | 'QR'; simulate: string; key: string } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError('');
    try {
      const [p, s] = await Promise.all([run('listTestPayers'), run('listSandboxScenarios')]);
      if (p.status === 200) setPayers(((p.body as { data?: TestPayer[] })?.data) ?? []);
      else setError(responseError(p.status, p.body));
      if (s.status === 200) setScenarios(((s.body as { scenarios?: Scenario[] })?.scenarios) ?? []);
    } catch (e) {
      setError(explorerRefusal(e));
    }
  }, [projectId, run]);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    setError(''); setNotice('');
    try {
      const r = await run('createTestPayer', { body: label.trim() ? { label: label.trim() } : {}, idempotency_key: newIdempotencyKey('payer') });
      if (r.status !== 201) { setError(responseError(r.status, r.body)); return; }
      const p = r.body as TestPayer;
      setNotice(`@${p.handle} criado.`);
      setLabel('');
      await load();
    } catch (e) { setError(explorerRefusal(e)); }
  }

  async function doFund() {
    if (!fund) return;
    const amount = tryParseMoneyInput(fund.amount);
    if (amount === null || amount <= 0) { setError('Indique um montante positivo em Kz, por exemplo 5 000 ou 5 000,50.'); return; }
    setError('');
    try {
      const r = await run('fundTestPayer', { path_params: { id: fund.id }, body: { amount_minor: amount }, idempotency_key: fund.key });
      if (r.status !== 200) { setError(responseError(r.status, r.body)); return; }
      setNotice(`Carregados ${formatMoneyDisplay(amount)} (valor fictício).`);
      setFund(null);
      await load();
    } catch (e) { setError(explorerRefusal(e)); }
  }

  async function doPay() {
    if (!pay || !pay.target.trim()) return;
    setError('');
    const body: Record<string, unknown> = pay.kind === 'session'
      ? { payment_session_id: pay.target.trim(), via: pay.via }
      : { payment_link_id: pay.target.trim() };
    if (pay.simulate) body.simulate = pay.simulate;
    try {
      const r = await run('payAsTestPayer', { path_params: { id: pay.id }, body, idempotency_key: pay.key });
      if (r.status !== 200) { setError(responseError(r.status, r.body)); return; }
      const t = r.body as { transfer_id?: string; proof_reference?: string | null };
      setNotice(`Pago. Transferência ${t.transfer_id ?? '—'}${t.proof_reference ? ` · comprovativo ${t.proof_reference}` : ''}.`);
      setPay(null);
      await load();
    } catch (e) { setError(explorerRefusal(e)); }
  }

  async function retire(p: TestPayer) {
    setError('');
    try {
      const r = await run('retireTestPayer', { path_params: { id: p.id } });
      if (r.status !== 200) { setError(responseError(r.status, r.body)); return; }
      setNotice(`@${p.handle} foi retirado. O histórico fica.`);
      await load();
    } catch (e) { setError(explorerRefusal(e)); }
  }

  if (!activeProject) return <p style={{ fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>Nenhum projeto selecionado.</p>;

  return (
    <div className="bz-view" style={{ maxWidth: 980 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>Dados de teste</h1>
      <p style={{ margin: '6px 0 20px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
        Pagadores de teste com valor fictício, cenários determinísticos e a reposição da Sandbox do projeto “{activeProject.name}”.{' '}
        <DocsLink href="/docs/testing">Guia de testes</DocsLink>
      </p>

      {notice && <p role="status" style={{ margin: '0 0 12px', padding: '10px 14px', borderRadius: 11, background: '#EEF7EF', color: '#1E6B34', fontWeight: 800, fontSize: 13.5 }}>{notice}</p>}
      {error && <p role="alert" style={{ ...FIELD_ERROR, margin: '0 0 12px' }}>{error}</p>}

      <Card style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Pagadores de teste</h2>
        <p style={P}>Um pagador de teste é um cliente Sandbox do seu projeto. Paga as suas sessões e links pelo mesmo caminho de um cliente real.</p>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 240px' }}>
            <span style={FIELD_LABEL}>Nome (opcional)</span>
            <input style={FIELD_INPUT} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Maria (teste)" />
          </label>
          <button type="button" data-testid="create-payer" onClick={() => void create()} disabled={busy} style={primaryButton(busy)}>Criar pagador</button>
        </div>
        <p style={FIELD_HINT}>Começa com 10 000 Kz fictícios. Até 10 pagadores ativos por projeto. Um pagador de teste paga só pela API deste projeto, às sessões e links do seu negócio — não entra em nenhuma app.</p>


        {payers === null ? (
          <p style={P}>A carregar…</p>
        ) : payers.length === 0 ? (
          <p style={P}>Ainda não há pagadores de teste.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 620 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#a89a9e', fontSize: 11, letterSpacing: '.04em' }}>
                  <th style={{ padding: 8 }}>PAGADOR</th><th style={{ padding: 8 }}>SALDO</th><th style={{ padding: 8 }}>ESTADO</th><th style={{ padding: 8 }} />
                </tr>
              </thead>
              <tbody>
                {payers.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid #F7EDEB' }}>
                    <td style={{ padding: 8 }}>
                      <strong>@{p.handle}</strong>{p.label ? <span style={{ color: '#8a7a7e' }}> · {p.label}</span> : null}
                    </td>
                    <td style={{ padding: 8, fontWeight: 800 }}>{kz(p.balance_minor)}</td>
                    <td style={{ padding: 8 }}><Pill kind={p.status === 'ACTIVE' ? 'success' : 'neutral'}>{p.status === 'ACTIVE' ? 'Ativo' : p.status === 'RETIRED' ? 'Retirado' : p.status}</Pill></td>
                    <td style={{ padding: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {p.status === 'ACTIVE' && (
                        <>
                          <button type="button" onClick={() => setFund({ id: p.id, amount: '', key: newIdempotencyKey('topup') })} style={{ ...SECONDARY_BUTTON, padding: '5px 10px', fontSize: 12 }}>Carregar</button>{' '}
                          <button type="button" onClick={() => setPay({ id: p.id, target: '', kind: 'session', via: 'LINK', simulate: '', key: newIdempotencyKey('pay') })} style={{ ...SECONDARY_BUTTON, padding: '5px 10px', fontSize: 12 }}>Pagar</button>{' '}
                          <button type="button" onClick={() => void retire(p)} style={{ ...SECONDARY_BUTTON, padding: '5px 10px', fontSize: 12 }}>Retirar</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {fund && (
          <div data-testid="fund-form" style={{ marginTop: 14, padding: 14, borderRadius: 12, border: '1px solid #F2E2E0' }}>
            <label>
              <span style={FIELD_LABEL}>Montante a carregar (Kz)</span>
              <input style={FIELD_INPUT} inputMode="decimal" value={fund.amount} onChange={(e) => setFund({ ...fund, amount: e.target.value })} placeholder="5000" />
            </label>
            <p style={FIELD_HINT}>Até 25 000 Kz por carregamento. Idempotency-Key: <code style={{ fontFamily: mono }}>{fund.key}</code></p>
            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => void doFund()} disabled={busy} style={primaryButton(busy)}>Carregar</button>
              <button type="button" onClick={() => setFund(null)} style={SECONDARY_BUTTON}>Cancelar</button>
            </div>
          </div>
        )}

        {pay && (
          <div data-testid="pay-form" style={{ marginTop: 14, padding: 14, borderRadius: 12, border: '1px solid #F2E2E0' }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label><input type="radio" checked={pay.kind === 'session'} onChange={() => setPay({ ...pay, kind: 'session' })} /> Sessão de pagamento</label>
              <label><input type="radio" checked={pay.kind === 'link'} onChange={() => setPay({ ...pay, kind: 'link' })} /> Link de pagamento</label>
            </div>
            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={FIELD_LABEL}>{pay.kind === 'session' ? 'session_id' : 'id do link'}</span>
              <input style={{ ...FIELD_INPUT, fontFamily: mono }} value={pay.target} onChange={(e) => setPay({ ...pay, target: e.target.value })} />
            </label>
            {pay.kind === 'session' && (
              <label style={{ display: 'block', marginTop: 10 }}>
                <span style={FIELD_LABEL}>Via</span>
                <select style={FIELD_INPUT} value={pay.via} onChange={(e) => setPay({ ...pay, via: e.target.value as 'LINK' | 'QR' })}>
                  <option value="LINK">Link</option>
                  <option value="QR">QR dinâmico</option>
                </select>
              </label>
            )}
            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={FIELD_LABEL}>Resultado da rede externa</span>
              <select style={FIELD_INPUT} value={pay.simulate} onChange={(e) => setPay({ ...pay, simulate: e.target.value })}>
                <option value="">Nenhuma simulação — pagar</option>
                <option value="DECLINED">Simular recusa (DECLINED)</option>
                <option value="PROVIDER_UNAVAILABLE">Simular fornecedor indisponível</option>
                <option value="TIMEOUT">Simular sem resposta (TIMEOUT)</option>
              </select>
            </label>
            <p style={FIELD_HINT}>Idempotency-Key: <code style={{ fontFamily: mono }}>{pay.key}</code> — repetir com a mesma chave não paga duas vezes.</p>
            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => void doPay()} disabled={busy || !pay.target.trim()} style={primaryButton(busy || !pay.target.trim())}>Pagar como este pagador</button>
              <button type="button" onClick={() => setPay(null)} style={SECONDARY_BUTTON}>Fechar</button>
            </div>
          </div>
        )}
      </Card>

      <Card style={{ padding: 22, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Cenários</h2>
        <p style={P}>Como produzir cada resultado. Sem montantes mágicos: só os resultados de rede externa são simulados, e dizem-no (simulated: true).</p>
        {scenarios === null ? <p style={P}>A carregar…</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#a89a9e', fontSize: 11, letterSpacing: '.04em' }}>
                  <th style={{ padding: 8 }}>CENÁRIO</th><th style={{ padding: 8 }}>COMO</th><th style={{ padding: 8 }}>RESULTADO</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid #F7EDEB', verticalAlign: 'top' }}>
                    <td style={{ padding: 8 }}>
                      <strong>{s.goal.pt}</strong>
                      <span style={{ display: 'block', fontFamily: mono, fontSize: 11, color: '#a89a9e' }}>{s.id}{s.simulated ? ' · simulado' : ''}</span>
                    </td>
                    <td style={{ padding: 8, color: '#5a4a4e' }}>{s.trigger.pt}</td>
                    <td style={{ padding: 8, color: '#5a4a4e' }}>{s.result.pt}{s.event ? <span style={{ display: 'block', fontFamily: mono, fontSize: 11.5 }}>{s.event}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ResetCard projectId={activeProject.id} csrf={csrf} onReset={() => void load()} />
    </div>
  );
}

function ResetCard({ projectId, csrf, onReset }: { projectId: string; csrf: string; onReset: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SandboxResetResult | null>(null);

  async function reset() {
    if (typed !== 'RESET' || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await developerApi.resetSandbox(projectId, csrf));
      setTyped('');
      onReset();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setError(
        code === 'SANDBOX_RESET_LIMIT' ? 'Já repôs a Sandbox 5 vezes nas últimas 24 horas.'
          : code === 'PENDING_SETTLEMENT' ? 'Há uma liquidação por terminar. Reponha quando terminar.'
            : code === 'FORBIDDEN' ? 'Só um Owner ou Admin do workspace pode repor a Sandbox.'
              : 'Não foi possível repor agora. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ padding: 22 }}>
      <section data-testid="sandbox-reset" aria-labelledby="reset-h">
        <h2 id="reset-h" style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>Repor a Sandbox</h2>
        <p style={P}>
          Retira os pagadores de teste deste projeto e, no negócio de teste do projeto, cancela as sessões e links em aberto,
          retira o saldo fictício e encerra as contas extra. <strong>Nada é apagado</strong>: pagamentos, reembolsos,
          comprovativos, registos e o ledger ficam. Chaves e webhooks mantêm-se. Até 5 vezes por dia.
        </p>
        <label style={{ display: 'block', marginTop: 12, maxWidth: 320 }}>
          <span style={FIELD_LABEL}>Escreva RESET para confirmar</span>
          <input style={{ ...FIELD_INPUT, fontFamily: mono }} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        <button type="button" data-testid="reset-go" onClick={() => void reset()} disabled={typed !== 'RESET' || busy}
          style={{ ...primaryButton(typed !== 'RESET' || busy), marginTop: 12 }}>
          {busy ? 'A repor…' : 'Repor a Sandbox'}
        </button>
        {error && <p role="alert" style={FIELD_ERROR}>{error}</p>}
        {result && (
          <p role="status" data-testid="reset-result" style={{ ...P, color: '#1E6B34', fontWeight: 800 }}>
            Reposta: {result.test_payers_retired} pagador(es) retirado(s), {result.payment_sessions_cancelled} sessão(ões) e{' '}
            {result.payment_links_cancelled} link(s) cancelados, {result.accounts_closed} conta(s) encerrada(s), {formatMoneyDisplay(result.retired_minor)} fictícios retirados.
          </p>
        )}
      </section>
    </Card>
  );
}
