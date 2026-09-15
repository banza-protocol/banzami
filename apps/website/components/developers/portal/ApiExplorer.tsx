'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { developerApi, type ExplorerOperation, type ExplorerResponse } from '@/lib/developer-api';
import { watchStatus, type RealtimeStatus } from '@/lib/realtime-status';
import { useDeveloperData } from './DeveloperData';
import { Card, DocsLink, FIELD_ERROR, FIELD_HINT, FIELD_INPUT, FIELD_LABEL, Pill, SECONDARY_BUTTON, primaryButton } from './ui';
import { ApiMethod, ApiPath, HttpStatus } from '../api/ApiMethod';
import { CodeView } from '../code/CodeView';
import { explorerRefusal, newIdempotencyKey, useExplorer } from './useExplorer';

/**
 * API Explorer (ADR-060 §7) — run the Developer API against the Sandbox from
 * the Console, with no key in the browser.
 *
 * The page sends an operation and its inputs to developer-api, which mints a
 * key valid for 60 seconds and ONE operation's scope, calls the Sandbox API
 * exactly as an integration would, revokes the key, and returns the answer. The
 * list of operations is the published OpenAPI's; the request shows up in Logs
 * marked "API Explorer". Sandbox only.
 */

const mono = "'JetBrains Mono', ui-monospace, monospace";

const TAG_LABEL: Record<string, string> = {
  identity: 'Identidade',
  'payment-sessions': 'Sessões de pagamento',
  'payment-links': 'Links de pagamento',
  'wallet-accounts': 'Contas',
  transfers: 'Transferências',
  refunds: 'Reembolsos',
  'application-settlements': 'Liquidações',
  webhooks: 'Webhooks',
  handles: '@banza',
  sandbox: 'Dados de teste',
};


type Realtime = { token: string; sessionId: string };

/** A realtime token in a response: a session read returns one. */
function realtimeIn(body: unknown): Realtime | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { session_id?: string; realtime?: { token?: string } };
  if (b.session_id && b.realtime?.token?.startsWith('bzst_')) return { token: b.realtime.token, sessionId: b.session_id };
  return null;
}

function RealtimeWatch({ rt }: { rt: Realtime }) {
  const [events, setEvents] = useState<{ kind: string; s: RealtimeStatus; at: string }[]>([]);
  const [state, setState] = useState<'watching' | string>('watching');
  const stop = useRef<() => void>(() => {});
  useEffect(() => {
    setEvents([]);
    setState('watching');
    stop.current = watchStatus({
      sessionId: rt.sessionId,
      token: rt.token,
      onStatus: (s, kind) => setEvents((e) => [...e, { kind, s, at: new Date().toLocaleTimeString('pt-PT') }]),
      onEnd: (reason, detail) => setState(reason + (detail ? ` (${detail})` : '')),
    });
    return () => stop.current();
  }, [rt.sessionId, rt.token]);
  const END: Record<string, string> = { terminal: 'terminou num estado final', token_expired: 'o token expirou — leia a sessão de novo', closed: 'parado' };
  return (
    <div data-testid="explorer-realtime" style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#FBF8F8', border: '1px solid #F2E2E0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <strong style={{ fontSize: 13.5 }}>Estado em tempo real</strong>
        {state === 'watching'
          ? <button type="button" onClick={() => stop.current()} style={{ ...SECONDARY_BUTTON, padding: '5px 10px', fontSize: 12 }}>Parar</button>
          : <span style={{ fontSize: 12, fontWeight: 800, color: '#8a7a7e' }}>{END[state] ?? state}</span>}
      </div>
      <p style={{ ...FIELD_HINT, marginTop: 6 }}>
        O token de estado vai no cabeçalho Authorization, não no endereço. Pague a sessão em Dados de teste e veja-a mudar aqui.
      </p>
      <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontFamily: mono, fontSize: 12.5, lineHeight: 1.7 }}>
        {events.map((e, i) => <li key={i}>{e.at} · {e.kind} · {e.s.status}{e.s.terminal ? ' (final)' : ''}</li>)}
        {events.length === 0 && state === 'watching' && <li>a ligar…</li>}
      </ol>
    </div>
  );
}

/** The hosted payment page of a session in a response — only pay.banzami.com links. */
function hostedPageIn(body: unknown): string | undefined {
  const interfaces = (body as { interfaces?: { type?: string; value?: string }[] } | undefined)?.interfaces;
  const link = interfaces?.find((i) => i.type === 'PAYMENT_LINK')?.value;
  return link && link.startsWith('https://pay.banzami.com/') ? link : undefined;
}

/** The App Banzami Web deep link for a payer-facing PAYMENT_LINK in a response —
 *  app.banzami.com/pay/{slug}. It carries ONLY the public payer slug (the same
 *  artifact pay.banzami.com and the QR use — PAYER_ARTIFACT_UNIVERSE=ONE): no
 *  key, no session, no owner id, no financial authority. The real Consumer app
 *  authenticates and resumes the payment; opening it never pays. */
function appWebPayIn(body: unknown): string | undefined {
  const hosted = hostedPageIn(body);
  if (!hosted) return undefined;
  try {
    const u = new URL(hosted); // https://pay.banzami.com/pay/{slug} | /{slug}
    const segs = u.pathname.split('/').filter(Boolean);
    const slug = segs[0] === 'pay' ? segs[1] : (segs.length === 1 ? segs[0] : undefined);
    return slug ? `https://app.banzami.com/pay/${encodeURIComponent(slug)}` : undefined;
  } catch {
    return undefined;
  }
}

export function ApiExplorer() {
  const { activeProject, csrf } = useDeveloperData();
  const projectId = activeProject?.id;
  const { run, busy } = useExplorer(projectId, csrf);

  const [ops, setOps] = useState<ExplorerOperation[] | null>(null);
  const [ttl, setTtl] = useState(60);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<ExplorerOperation | null>(null);
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [idem, setIdem] = useState('');
  const [error, setError] = useState('');
  const [response, setResponse] = useState<ExplorerResponse | null>(null);
  const [rt, setRt] = useState<Realtime | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setOps(null);
    developerApi.explorerOperations(projectId)
      .then((r) => {
        setOps(r.operations);
        setTtl(r.key_ttl_seconds);
        // "Try in Sandbox" from the API reference names the operation.
        const wanted = new URLSearchParams(window.location.search).get('op');
        const op = wanted ? r.operations.find((o) => o.operation_id === wanted) : undefined;
        if (op) choose(op);
      })
      .catch((e) => setLoadError(explorerRefusal(e)));
  }, [projectId]);

  const groups = useMemo(() => {
    const m = new Map<string, ExplorerOperation[]>();
    for (const op of ops ?? []) m.set(op.tag, [...(m.get(op.tag) ?? []), op]);
    return [...m.entries()];
  }, [ops]);

  function choose(op: ExplorerOperation) {
    setSelected(op);
    setPathParams(Object.fromEntries(op.path_params.map((p) => [p.name, ''])));
    setQuery({});
    setBody(op.body && op.example_body ? JSON.stringify(op.example_body, null, 2) : '');
    setIdem(op.idempotency ? newIdempotencyKey('explorer') : '');
    setResponse(null);
    setRt(null);
    setError('');
  }

  async function send() {
    if (!selected) return;
    setError('');
    setRt(null);
    let parsed: unknown;
    if (selected.body && body.trim()) {
      try { parsed = JSON.parse(body); } catch { setError('O corpo não é JSON válido.'); return; }
    }
    try {
      const r = await run(selected.operation_id, {
        path_params: pathParams,
        query: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '')),
        body: parsed,
        idempotency_key: selected.idempotency ? idem : undefined,
      });
      setResponse(r);
    } catch (e) {
      setError(explorerRefusal(e));
    }
  }

  if (!activeProject) return <p style={{ fontSize: 14, color: '#a89a9e', fontWeight: 700 }}>Nenhum projeto selecionado.</p>;

  return (
    <div className="bz-view">
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>API Explorer</h1>
      <p style={{ margin: '6px 0 20px', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600, maxWidth: 760 }}>
        Execute a API v1 na Sandbox com o projeto “{activeProject.name}”. Cada pedido usa uma chave de {ttl} segundos, só com o
        scope da operação, criada e revogada no servidor — nenhuma chave chega ao browser. <DocsLink href="/docs/testing">Como funciona</DocsLink>
      </p>
      {loadError && <Card style={{ padding: 18 }}><p role="alert" style={{ margin: 0, color: '#B5101F', fontWeight: 700 }}>{loadError}</p></Card>}
      {ops && (
        <div className="bz-2rail" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
          <Card style={{ padding: 12, maxHeight: '75vh', overflowY: 'auto' }}>
            <nav aria-label="Operações">
              {groups.map(([tag, list]) => (
                <div key={tag} style={{ marginBottom: 10 }}>
                  <p style={{ margin: '6px 8px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: '#a89a9e' }}>{(TAG_LABEL[tag] ?? tag).toUpperCase()}</p>
                  {list.map((op) => (
                    <button
                      key={op.operation_id}
                      type="button"
                      data-testid={`op-${op.operation_id}`}
                      aria-current={selected?.operation_id === op.operation_id ? 'true' : undefined}
                      onClick={() => choose(op)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '7px 8px', border: 0, borderRadius: 9, cursor: 'pointer',
                        background: selected?.operation_id === op.operation_id ? '#FFF1F0' : 'transparent',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ApiMethod method={op.method} size="sm" />
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2a2024' }}>{op.summary}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </Card>

          <div style={{ minWidth: 0 }}>
            {!selected ? (
              <Card style={{ padding: 22 }}><p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 600 }}>Escolha uma operação.</p></Card>
            ) : (
              <Card style={{ padding: 22 }}>
                <p data-endpoint-heading style={{ margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px' }}>
                  <ApiMethod method={selected.method} />
                  <ApiPath path={selected.path} size={15} />
                </p>
                <p style={{ ...FIELD_HINT, marginTop: 6 }}>
                  <code>{selected.operation_id}</code> · scope <code>{selected.scope}</code>
                </p>

                {selected.path_params.map((p) => (
                  <label key={p.name} style={{ display: 'block', marginTop: 12 }}>
                    <span style={FIELD_LABEL}>{p.name} <span style={{ color: '#a89a9e' }}>(caminho)</span></span>
                    <input style={{ ...FIELD_INPUT, fontFamily: mono }} value={pathParams[p.name] ?? ''} placeholder={p.example}
                      onChange={(e) => setPathParams({ ...pathParams, [p.name]: e.target.value })} />
                  </label>
                ))}
                {selected.query_params.map((p) => (
                  <label key={p.name} style={{ display: 'block', marginTop: 12 }}>
                    <span style={FIELD_LABEL}>{p.name} <span style={{ color: '#a89a9e' }}>(query, opcional)</span></span>
                    <input style={{ ...FIELD_INPUT, fontFamily: mono }} value={query[p.name] ?? ''}
                      onChange={(e) => setQuery({ ...query, [p.name]: e.target.value })} />
                  </label>
                ))}
                {selected.idempotency && (
                  <label style={{ display: 'block', marginTop: 12 }}>
                    <span style={FIELD_LABEL}>Idempotency-Key{selected.idempotency_required ? '' : ' (recomendada)'}</span>
                    <input style={{ ...FIELD_INPUT, fontFamily: mono }} value={idem} onChange={(e) => setIdem(e.target.value)} />
                    <span style={FIELD_HINT}>Repetir com a mesma chave devolve a resposta original. Mude-a para uma operação nova.</span>
                  </label>
                )}
                {selected.body && (
                  <label style={{ display: 'block', marginTop: 12 }}>
                    <span style={FIELD_LABEL}>Corpo (JSON)</span>
                    <textarea style={{ ...FIELD_INPUT, fontFamily: mono, minHeight: 160, whiteSpace: 'pre' }} value={body} onChange={(e) => setBody(e.target.value)} />
                  </label>
                )}
                <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" data-testid="explorer-send" onClick={() => void send()} disabled={busy} style={primaryButton(busy)}>
                    {busy ? 'A enviar…' : 'Enviar pedido'}
                  </button>
                  {selected.idempotency && (
                    <button type="button" onClick={() => setIdem(newIdempotencyKey('explorer'))} style={SECONDARY_BUTTON}>Nova chave de idempotência</button>
                  )}
                </div>
                {error && <p role="alert" style={FIELD_ERROR}>{error}</p>}

                {response && (
                  <div data-testid="explorer-response" style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <HttpStatus code={response.status} />
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: '#8a7a7e' }}>{response.latency_ms} ms</span>
                      {response.request_id && <span style={{ fontFamily: mono, fontSize: 12, color: '#8a7a7e' }}>request_id {response.request_id}</span>}
                      {response.headers['Idempotent-Replayed'] && <Pill kind="neutral">resposta repetida</Pill>}
                    </div>
                    {response.redacted && response.redacted.length > 0 && (
                      <p style={{ ...FIELD_HINT, marginTop: 8 }}>
                        Escondido pelo API Explorer: {response.redacted.join(', ')}. Um segredo de assinatura mostra-se uma vez, em Webhooks.
                      </p>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <CodeView
                        raw={response.body !== undefined ? JSON.stringify(response.body, null, 2) : (response.text ?? '')}
                        lang={response.body !== undefined ? 'json' : 'text'}
                        context={`${selected.method} ${selected.path}`}
                        status={<HttpStatus code={response.status} compact />}
                        title={response.body !== undefined ? 'Resposta · JSON' : 'Resposta'}
                      />
                    </div>
                    {appWebPayIn(response.body) && (
                      <a data-testid="explorer-app-web" href={appWebPayIn(response.body)} target="_blank" rel="noopener noreferrer" style={{ ...primaryButton(), display: 'inline-block', marginTop: 10, marginRight: 8, textDecoration: 'none' }}>
                        Testar na App Banzami Web ↗
                      </a>
                    )}
                    {hostedPageIn(response.body) && (
                      <a data-testid="explorer-hosted-page" href={hostedPageIn(response.body)} target="_blank" rel="noopener noreferrer" style={{ ...SECONDARY_BUTTON, display: 'inline-block', marginTop: 10, marginRight: 8, textDecoration: 'none' }}>
                        Abrir a página de pagamento
                      </a>
                    )}
                    {realtimeIn(response.body) && !rt && (
                      <button type="button" data-testid="explorer-watch" onClick={() => setRt(realtimeIn(response.body))} style={{ ...SECONDARY_BUTTON, marginTop: 10 }}>
                        Ver o estado em tempo real
                      </button>
                    )}
                    {rt && <RealtimeWatch rt={rt} />}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
