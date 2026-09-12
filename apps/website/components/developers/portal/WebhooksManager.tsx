'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  developerApi,
  type WebhookEndpoint,
  type WebhookEvent,
  type WebhookDelivery,
  type WebhookDeliveryAttempt,
  type NewWebhookEndpoint,
} from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { Card, Pill, type PillKind } from './ui';
import { IconSearch, IconWebhook } from './icons';
import { WebhookEndpointForm, SUPPORTED_WEBHOOK_EVENTS } from './WebhookEndpointForm';
import { SecretRevealDialog } from './ApiKeysManager';
import { ConfirmDialog } from './ConfirmDialog';

// Real, project-scoped webhook history.
//
// This screen previously rendered invented endpoints for a fictional shop and
// invented deliveries for event names Banzami does not emit, behind an
// "illustrative data" label. A developer reading a delivery history in their own
// Console reasonably takes it for their own traffic, and debugs against numbers
// that describe nothing.
//
// Everything here is now the project's own: developer-api resolves the merchant
// from the project's binding and scopes every query by it. Nothing in the
// browser names a merchant, and no response carries a signing secret — the view
// types have no field for one.

const mono = "'JetBrains Mono', ui-monospace, monospace";

// What each subscribed event means, in the same words the create form uses.
// An endpoint's subscriptions are stored as bare wire names; printing the array
// tells a reader what they typed, not what it will bring them.
const EVENT_HELP = new Map(SUPPORTED_WEBHOOK_EVENTS);

/** Map a delivery status to the Pill vocabulary, without inventing precision. */
function deliveryTone(status: string, code?: number | null): { kind: PillKind; label: string } {
  const s = status.toUpperCase();
  if (s === 'SUCCESS') return { kind: 'success', label: code ? `Entregue · ${code}` : 'Entregue' };
  if (s === 'FAILED')  return { kind: 'error',   label: code ? `Falhou · ${code}` : 'Falhou' };
  // PENDING covers "scheduled" and "retrying"; the attempt count beside it tells
  // the reader which, so the pill does not have to guess.
  return { kind: 'neutral', label: code ? `Pendente · ${code}` : 'Pendente' };
}

const ERROR_CLASS_LABEL: Record<string, string> = {
  http_status: 'resposta HTTP',
  timeout: 'sem resposta a tempo',
  connection: 'ligação recusada',
  tls: 'erro TLS',
  dns: 'domínio não resolvido',
  other: 'falha de rede',
};

/** What one attempt amounted to, in the receiver's own terms: its HTTP status,
 *  or why there was none. */
function attemptLabel(a: WebhookDeliveryAttempt): string {
  if (a.status_code != null) return `HTTP ${a.status_code}`;
  return ERROR_CLASS_LABEL[a.error_class ?? 'other'] ?? 'falha de rede';
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

const th = { padding: '13px 12px', fontSize: 11, fontWeight: 800, textAlign: 'left' } as const;
const ghostButton = {
  padding: '7px 13px', border: '1.5px solid #EBDBD9', borderRadius: 9, background: '#fff',
  color: '#5a4a4e', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
} as const;

export function WebhooksManager() {
  const { activeProject, csrf, onApiError } = useDeveloperData();
  const projectId = activeProject?.id ?? null;

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  // The endpoint whose detail is expanded. Everything about one endpoint used to
  // live in a single table row, so the subscriptions were a comma-joined array
  // and there was nowhere to put an action that needs explaining.
  const [detail, setDetail] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'unprovisioned'>('idle');
  const [error, setError] = useState('');
  // The signing secret, transiently, exactly once — same rule as a secret key.
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  // The endpoint an irreversible action is pending on. Rotation invalidates the
  // secret the developer's server is holding; disabling stops delivery; deleting
  // removes the row. None should happen because a row was clicked.
  const [confirming, setConfirming] = useState<{ action: 'rotate' | 'disable' | 'enable' | 'delete'; ep: WebhookEndpoint } | null>(null);
  // A delete the server refused because the endpoint has delivery history. The
  // refusal is permanent and correct, so it has to lead somewhere rather than
  // end in a red sentence.
  const [blocked, setBlocked] = useState<{ ep: WebhookEndpoint; message: string } | null>(null);
  // The failed delivery a replay is pending on. A replay posts to the
  // integrator's own server, so it is asked for rather than fired by a click on
  // a row.
  const [replaying, setReplaying] = useState<{ eventId: string; delivery: WebhookDelivery } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setState('loading');
    setError('');
    try {
      const [{ endpoints: eps }, { events: evs }] = await Promise.all([
        developerApi.listWebhookEndpoints(projectId),
        developerApi.listWebhookEvents(projectId, 25),
      ]);
      setEndpoints(eps);
      setEvents(evs);
      setState('ready');
    } catch (e) {
      // A project with no financial binding is refused rather than shown an
      // empty list — an empty list would assert the question was meaningful and
      // the answer was "none".
      //
      // The code is read off ApiError, not off whatever property a thrown value
      // happens to carry: a TypeError from a broken fetch has no `code` and used
      // to fall through to the branch below, which then printed the exception's
      // own message — an English string written for a developer console, not for
      // this reader.
      if (e instanceof ApiError && e.code === 'NOT_FOUND') { setState('unprovisioned'); return; }
      setError(onApiError(e));
      setState('error');
    }
  }, [projectId, onApiError]);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async (eventId: string) => {
    if (open === eventId) { setOpen(null); return; }
    setOpen(eventId);
    if (deliveries[eventId] || !projectId) return;
    try {
      const { deliveries: ds } = await developerApi.listWebhookDeliveries(projectId, eventId);
      setDeliveries((prev) => ({ ...prev, [eventId]: ds }));
    } catch {
      setDeliveries((prev) => ({ ...prev, [eventId]: [] }));
    }
  }, [open, deliveries, projectId]);

  /** Re-read one event's deliveries, so a row shows what the server now holds. */
  const refreshDeliveries = useCallback(async (eventId: string) => {
    if (!projectId) return;
    try {
      const { deliveries: ds } = await developerApi.listWebhookDeliveries(projectId, eventId);
      setDeliveries((prev) => ({ ...prev, [eventId]: ds }));
    } catch {
      // Keep what is on screen: an unreadable refresh is not evidence that the
      // deliveries went away.
    }
  }, [projectId]);

  // Re-queue a delivery the receiver never accepted. The SAME delivery goes back
  // to PENDING — there is one delivery row per event per endpoint and the
  // attempts are counted on it — so nothing here should suggest a second
  // delivery was created.
  const replay = async (eventId: string, d: WebhookDelivery) => {
    if (!projectId) return;
    try {
      await developerApi.replayWebhookDelivery(projectId, d.id, csrf);
      await refreshDeliveries(eventId);
    } catch (e) {
      // The button is only offered on a failed delivery, but a delivery can
      // succeed between the render and the click. Then the row on screen is
      // stale, so it is re-read, and the reader is told what the server said
      // about THIS delivery rather than that something went wrong.
      if (e instanceof ApiError && e.code === 'DELIVERY_ALREADY_SUCCEEDED') {
        await refreshDeliveries(eventId);
      }
      throw new Error(onApiError(e));
    }
  };

  const rotate = async (ep: WebhookEndpoint) => {
    if (!projectId) return;
    try {
      const rotated = await developerApi.rotateWebhookSecret(projectId, ep.id, csrf);
      setRevealSecret(rotated.secret);
      await load();
    } catch (e) {
      throw new Error(onApiError(e));
    }
  };

  const setActive = async (ep: WebhookEndpoint, active: boolean) => {
    if (!projectId) return;
    try {
      await developerApi.setWebhookEndpointActive(projectId, ep.id, active, csrf);
      setBlocked(null);
      await load();
    } catch (e) {
      throw new Error(onApiError(e));
    }
  };

  const remove = async (ep: WebhookEndpoint) => {
    if (!projectId) return;
    try {
      await developerApi.deleteWebhookEndpoint(projectId, ep.id, csrf);
      if (detail === ep.id) setDetail(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ENDPOINT_HAS_DELIVERIES') {
        // Not a failure to retry: the deliveries reference this endpoint and
        // that history is not the endpoint's to take with it. What the reader
        // actually wanted — stop sending to this address — is still available,
        // so hand them that instead of closing on a dead end.
        setConfirming(null);
        setBlocked({ ep, message: onApiError(e) });
        return;
      }
      throw new Error(onApiError(e));
    }
  };

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) =>
      ev.event_type.toLowerCase().includes(q) || ev.id.toLowerCase().includes(q));
  }, [events, query]);

  if (!projectId) {
    return (
      <Card style={{ padding: '40px 30px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: '#8a7a7e', fontWeight: 600 }}>
          Escolha um projecto para ver os seus webhooks.
        </p>
      </Card>
    );
  }

  if (state === 'unprovisioned') {
    return (
      <Card style={{ padding: '40px 30px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: '#B5101F' }}>
          <IconWebhook size={26} />
        </div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Projecto ainda sem titular financeiro</h3>
        <p style={{ margin: '10px auto 0', maxWidth: 420, fontSize: 14, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
          Os webhooks pertencem ao titular que o binding do projecto define. Enquanto
          o projecto não estiver provisionado, não há eventos para mostrar.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card style={{ overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: '16px 22px', borderBottom: '1px solid #F5E9E7' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>
            Endpoints registados{' '}
            <span style={{ fontSize: 12, color: '#a89a9e', fontWeight: 700 }}>
              {state === 'loading' ? '· a carregar…' : `· ${endpoints.length}`}
            </span>
          </h3>
          <WebhookEndpointForm onCreated={(ep: NewWebhookEndpoint) => { setRevealSecret(ep.secret); void load(); }} />
        </div>

        {state === 'loading' && endpoints.length === 0 ? (
          <p style={{ margin: 0, padding: '28px 22px', textAlign: 'center', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
            A carregar os endpoints deste projecto…
          </p>
        ) : endpoints.length === 0 && state === 'ready' ? (
          <div style={{ padding: '28px 22px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 800 }}>Ainda não há endpoints</p>
            <p style={{ margin: 0, fontSize: 13, color: '#8a7a7e', fontWeight: 600 }}>
              Use <strong>Registar endpoint</strong>, aqui em cima, para começar a receber eventos.
              Também pode fazê-lo pela API, com <code style={{ fontFamily: mono }}>createWebhookEndpoint</code>.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#a89a9e' }}>
                <th scope="col" style={{ ...th, padding: '13px 22px' }}>ENDEREÇO</th>
                <th scope="col" style={th}>SUBSCRIÇÕES</th>
                <th scope="col" style={th}>ESTADO</th>
                <th scope="col" style={th}>CRIADO</th>
                <th scope="col" style={{ ...th, padding: '13px 22px', textAlign: 'right' }}>
                  <span className="bz-sr-only">Detalhes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => {
                const expanded = detail === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr className="bz-row" style={{ borderTop: '1px solid #F5E9E7' }}>
                      <td style={{ padding: '15px 22px', fontFamily: mono, fontWeight: 600, color: '#2a2024', wordBreak: 'break-all' }}>{e.url}</td>
                      <td style={{ padding: '15px 12px', color: '#8a7a7e', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {e.events.length === 0
                          ? 'Nenhuma'
                          : e.events.length === 1 ? '1 evento' : `${e.events.length} eventos`}
                      </td>
                      <td style={{ padding: '15px 12px' }}>
                        {/* The dot is decoration; the word is the state. */}
                        <Pill kind={e.active ? 'success' : 'neutral'} dot>{e.active ? 'Ativo' : 'Inativo'}</Pill>
                      </td>
                      <td style={{ padding: '15px 12px', color: '#a89a9e', fontWeight: 700, whiteSpace: 'nowrap' }}>{when(e.created_at)}</td>
                      <td style={{ padding: '15px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => setDetail(expanded ? null : e.id)}
                          aria-expanded={expanded}
                          aria-controls={`wh-ep-${e.id}`}
                          style={ghostButton}
                        >
                          {expanded ? 'Fechar detalhes' : 'Detalhes'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`wh-ep-${e.id}`} style={{ borderTop: '1px solid #F7EDEB', background: '#FFFBFB' }}>
                        <td colSpan={5} style={{ padding: '4px 22px 20px' }}>
                          <dl style={{ margin: '0 0 16px', display: 'grid', gridTemplateColumns: 'minmax(120px,auto) 1fr', gap: '10px 18px', fontSize: 13 }}>
                            <dt style={{ fontWeight: 800, color: '#6a5a5e' }}>Endereço</dt>
                            <dd style={{ margin: 0, fontFamily: mono, fontSize: 12.5, wordBreak: 'break-all', color: '#2a2024' }}>{e.url}</dd>

                            <dt style={{ fontWeight: 800, color: '#6a5a5e' }}>Subscrições</dt>
                            <dd style={{ margin: 0 }}>
                              {e.events.length === 0 ? (
                                <span style={{ color: '#8a7a7e', fontWeight: 600 }}>
                                  Este endpoint não subscreve nenhum evento, por isso nunca recebe entregas.
                                </span>
                              ) : (
                                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7 }}>
                                  {e.events.map((name) => (
                                    <li key={name}>
                                      <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#B5101F' }}>{name}</span>
                                      {EVENT_HELP.has(name) ? (
                                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#8a7a7e', lineHeight: 1.45 }}>
                                          {EVENT_HELP.get(name)}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </dd>

                            <dt style={{ fontWeight: 800, color: '#6a5a5e' }}>Estado</dt>
                            <dd style={{ margin: 0 }}>
                              <Pill kind={e.active ? 'success' : 'neutral'} dot>{e.active ? 'Ativo' : 'Inativo'}</Pill>
                              <span style={{ marginLeft: 9, fontSize: 12.5, fontWeight: 600, color: '#8a7a7e' }}>
                                {e.active
                                  ? 'O Banzami entrega os eventos subscritos a este endereço.'
                                  : 'O Banzami não entrega nada a este endereço enquanto estiver inativo.'}
                              </span>
                            </dd>

                            <dt style={{ fontWeight: 800, color: '#6a5a5e' }}>Criado</dt>
                            <dd style={{ margin: 0, fontFamily: mono, fontSize: 12.5, color: '#8a7a7e' }}>{when(e.created_at)}</dd>
                          </dl>

                          {/* The API has no route that changes an endpoint's address or
                              its subscriptions — the PATCH takes `active` and nothing
                              else. Saying so is the honest answer; an edit form here
                              would collect changes the server discards. */}
                          <p style={{ margin: '0 0 14px', fontSize: 12.5, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
                            O endereço e as subscrições não podem ser alterados depois de
                            registados. Para mudar qualquer um deles, registe um endpoint novo
                            e desactive ou elimine este.
                          </p>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <button onClick={() => setConfirming({ action: 'rotate', ep: e })} style={ghostButton}>
                              Rodar segredo
                            </button>
                            <button
                              onClick={() => setConfirming({ action: e.active ? 'disable' : 'enable', ep: e })}
                              style={{ ...ghostButton, border: `1.5px solid ${e.active ? '#EBC7C4' : '#EBDBD9'}`, color: e.active ? '#B5101F' : '#5a4a4e' }}
                            >
                              {e.active ? 'Desactivar' : 'Reactivar'}
                            </button>
                            <button
                              onClick={() => setConfirming({ action: 'delete', ep: e })}
                              style={{ ...ghostButton, border: '1.5px solid #EBC7C4', color: '#B5101F' }}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #F5E9E7' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Eventos e entregas</h3>
          <button
            onClick={() => void load()}
            style={{ border: 'none', background: 'none', fontSize: 12.5, fontWeight: 800, color: '#B5101F', cursor: 'pointer' }}
          >
            Actualizar
          </button>
        </div>

        {/* The list is the last 25 events and every row looks alike from two
            metres away. Finding the one event a developer is debugging meant
            reading ids by eye. */}
        {events.length > 0 ? (
          <div style={{ padding: '14px 22px', borderBottom: '1px solid #F7EDEB' }}>
            <label htmlFor="wh-filter" className="bz-sr-only">Filtrar eventos</label>
            <div style={{ position: 'relative' }}>
              <span aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#b8a4a6' }}>
                <IconSearch size={16} />
              </span>
              <input
                id="wh-filter"
                className="bz-in"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                placeholder="Filtrar por tipo de evento ou id…"
                style={{
                  width: '100%', padding: '10px 14px 10px 40px', border: '1.5px solid #EBDBD9',
                  borderRadius: 12, fontSize: 13.5, fontWeight: 600, color: '#2a2024',
                  background: '#fff', outline: 'none',
                }}
              />
            </div>
          </div>
        ) : null}

        {state === 'loading' && events.length === 0 ? (
          <p style={{ margin: 0, padding: '28px 22px', textAlign: 'center', fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
            A carregar os eventos deste projecto…
          </p>
        ) : events.length === 0 && state === 'ready' ? (
          <div style={{ padding: '28px 22px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
              Ainda não há eventos para este projecto.
            </p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ padding: '28px 22px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13.5, color: '#8a7a7e', fontWeight: 600 }}>
              Nenhum dos {events.length} eventos mais recentes corresponde a «{query.trim()}».
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            {/* The events list had no header row: every cell is inside one
                expanding button, so it read as a wall of ids to anything not
                looking at it. The columns are named here and the header is
                hidden visually rather than removed, because the layout is a
                disclosure row and a printed header would be noise. */}
            <thead className="bz-sr-only">
              <tr>
                <th scope="col">Tipo de evento</th>
                <th scope="col">ID do evento</th>
                <th scope="col">Data</th>
                <th scope="col">Entregas</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((ev) => {
                const ds = deliveries[ev.id];
                return (
                  <tr key={ev.id} className="bz-row" style={{ borderTop: '1px solid #F7EDEB' }}>
                    <td style={{ padding: 0 }} colSpan={4}>
                      <button
                        onClick={() => void toggle(ev.id)}
                        style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', padding: '13px 22px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                        aria-expanded={open === ev.id}
                      >
                        <span style={{ fontFamily: mono, fontWeight: 700, flex: '0 0 220px' }}>{ev.event_type}</span>
                        <span style={{ fontFamily: mono, fontSize: 11, color: '#a89a9e', flex: 1 }}>{ev.id}</span>
                        <span style={{ color: '#a89a9e', fontWeight: 700, fontSize: 12 }}>{when(ev.created_at)}</span>
                        <span aria-hidden style={{ color: '#B5101F', fontWeight: 900 }}>{open === ev.id ? '−' : '+'}</span>
                      </button>
                      {open === ev.id && (
                        <div style={{ padding: '0 22px 14px 22px' }}>
                          {ds === undefined ? (
                            <p style={{ margin: 0, fontSize: 12.5, color: '#a89a9e' }}>A carregar entregas…</p>
                          ) : ds.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 12.5, color: '#a89a9e' }}>Sem entregas registadas.</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                              <thead>
                                <tr style={{ color: '#a89a9e' }}>
                                  <th scope="col" style={{ padding: '6px 0', fontSize: 10.5, fontWeight: 800, textAlign: 'left' }}>ESTADO</th>
                                  <th scope="col" style={{ padding: '6px 0', fontSize: 10.5, fontWeight: 800, textAlign: 'left' }}>TENTATIVAS</th>
                                  <th scope="col" style={{ padding: '6px 0', fontSize: 10.5, fontWeight: 800, textAlign: 'left' }}>ENTREGUE</th>
                                  <th scope="col" style={{ padding: '6px 0', fontSize: 10.5, fontWeight: 800, textAlign: 'right' }}>
                                    <span className="bz-sr-only">Acções</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {ds.map((d) => {
                                  const tone = deliveryTone(d.status, d.status_code);
                                  const attempts = d.attempts ?? [];
                                  return (
                                    <Fragment key={d.id}>
                                      <tr>
                                        <td style={{ padding: '6px 0' }}><Pill kind={tone.kind}>{tone.label}</Pill></td>
                                        <td style={{ padding: '6px 0', fontWeight: 800 }}>{d.attempt_count}</td>
                                        <td style={{ padding: '6px 0', color: '#a89a9e', fontWeight: 700 }}>
                                          {d.delivered_at ? when(d.delivered_at) : '—'}
                                        </td>
                                        <td style={{ padding: '6px 0', textAlign: 'right' }}>
                                          {/* Only on a delivery that failed. A delivery
                                              that was accepted is not re-sent — the
                                              integrator acted on that event — and one
                                              still pending is already in the queue. */}
                                          {d.status.toUpperCase() === 'FAILED' ? (
                                            <button
                                              onClick={() => setReplaying({ eventId: ev.id, delivery: d })}
                                              style={{ ...ghostButton, padding: '5px 11px', fontSize: 12 }}
                                            >
                                              Reenviar
                                            </button>
                                          ) : null}
                                        </td>
                                      </tr>
                                      {attempts.length > 0 && (
                                        <tr>
                                          <td colSpan={4} style={{ padding: '2px 0 8px 0' }}>
                                            <ol data-testid="webhook-attempts" style={{ margin: 0, paddingLeft: 18, color: '#6a5a5e', fontSize: 12 }}>
                                              {attempts.map((a) => (
                                                <li key={a.attempt_number} style={{ padding: '2px 0' }}>
                                                  <span style={{ fontWeight: 800, color: a.outcome === 'SUCCESS' ? '#1f9d57' : '#B5101F' }}>
                                                    {a.outcome === 'SUCCESS' ? 'Entregue' : 'Falhou'}
                                                  </span>
                                                  {' · '}
                                                  {attemptLabel(a)}
                                                  {' · '}
                                                  <span style={{ fontFamily: mono }}>{when(a.attempted_at)}</span>
                                                </li>
                                              ))}
                                            </ol>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {state === 'error' && (
        <p role="alert" style={{ marginTop: 12, fontSize: 13, color: '#B5101F', fontWeight: 700 }}>{error}</p>
      )}

      {/* A refusal supersedes the question that provoked it — two stacked
          dialogs would leave the answered one behind the live one. */}
      {confirming && !blocked ? (
        <ConfirmDialog
          title={
            confirming.action === 'rotate' ? 'Rodar o segredo de assinatura'
              : confirming.action === 'disable' ? 'Desactivar endpoint'
              : confirming.action === 'delete' ? 'Eliminar endpoint'
              : 'Reactivar endpoint'
          }
          body={
            confirming.action === 'rotate'
              ? 'É emitido um segredo novo e o actual deixa de assinar imediatamente. O seu servidor recusa as entregas até o novo estar instalado. O segredo é mostrado uma única vez.'
              : confirming.action === 'disable'
                ? 'O Banzami deixa de entregar eventos a este endereço. O histórico de entregas mantém-se, e pode reactivá-lo depois.'
                : confirming.action === 'delete'
                  ? 'O endpoint sai da lista e o seu segredo de assinatura deixa de existir. Não pode ser recuperado. Só é possível eliminar um endpoint que ainda não recebeu entregas — se já recebeu, desactive-o.'
                  : 'O Banzami volta a entregar eventos a este endereço.'
          }
          subject={confirming.ep.url}
          confirmLabel={
            confirming.action === 'rotate' ? 'Rodar segredo'
              : confirming.action === 'disable' ? 'Desactivar'
              : confirming.action === 'delete' ? 'Eliminar'
              : 'Reactivar'
          }
          danger={confirming.action !== 'enable'}
          onConfirm={() =>
            confirming.action === 'rotate'
              ? rotate(confirming.ep)
              : confirming.action === 'delete'
                ? remove(confirming.ep)
                : setActive(confirming.ep, confirming.action === 'enable')
          }
          onClose={() => setConfirming(null)}
        />
      ) : null}

      {blocked ? (
        <ConfirmDialog
          title="Este endpoint não pode ser eliminado"
          body={
            blocked.ep.active
              ? `${blocked.message} As entregas já feitas apontam para este endpoint, e esse histórico não é dele para levar consigo. Desactivá-lo pára as entregas e mantém o registo.`
              : `${blocked.message} As entregas já feitas apontam para este endpoint, e esse histórico não é dele para levar consigo. Já está inativo, por isso não recebe mais nada.`
          }
          subject={blocked.ep.url}
          confirmLabel={blocked.ep.active ? 'Desactivar' : 'Entendido'}
          danger={blocked.ep.active}
          onConfirm={blocked.ep.active ? () => setActive(blocked.ep, false) : async () => {}}
          onClose={() => setBlocked(null)}
        />
      ) : null}

      {replaying ? (
        <ConfirmDialog
          title="Reenviar esta entrega"
          body="A mesma entrega volta para a fila e é tentada outra vez — não é criada uma entrega nova, e as tentativas continuam a ser contadas nesta. O seu servidor recebe o mesmo evento, com o mesmo id, por isso deve tratá-lo de forma idempotente."
          // The address it is going back to — the same thing every other dialog
          // on this screen names, and the id if the endpoint is not in the list.
          subject={endpoints.find((e) => e.id === replaying.delivery.endpoint_id)?.url ?? replaying.delivery.endpoint_id}
          confirmLabel="Reenviar"
          onConfirm={() => replay(replaying.eventId, replaying.delivery)}
          onClose={() => setReplaying(null)}
        />
      ) : null}

      {revealSecret ? (
        <SecretRevealDialog
          secret={revealSecret}
          onDismiss={() => setRevealSecret(null)}
          title="Guarde o segredo de assinatura"
          description="Este segredo é mostrado uma única vez. Instale-o no servidor que recebe os webhooks — é com ele que verifica a assinatura de cada entrega. Não é uma chave de API e não deve ser usado para autenticar chamadas."
          label="Segredo de assinatura"
          ack="Instalei o segredo no meu servidor."
        />
      ) : null}
    </>
  );
}
