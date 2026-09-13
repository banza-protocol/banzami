'use client';

// The error reference, rendered from error-catalogue.json in either language.
//
// It used to be two hand-written tables, one per language, and they said
// things the API does not: a 403 FORBIDDEN "without an active binding" (that
// is 403 PAYMENTS_UNAVAILABLE), a 409 CONFLICT and a 422 VALIDATION_ERROR that
// no developer route returns. Now there is one list, derived from and checked
// against the source by tools/check-docs-error-catalogue.mjs, and both
// languages read it.

import { useState } from 'react';
import catalogue from './error-catalogue.json';
import { H3, INK, MUT, P, mono } from './ui';

type Lang = 'pt' | 'en';
type Entry = {
  code: string;
  http: (number | string)[];
  family: string;
  meaning: Record<Lang, string>;
  action: Record<Lang, string>;
  retry: 'no' | 'yes' | 'after_delay' | 'after_change';
  idempotency_key: 'new' | 'same' | 'n/a';
};

const FAMILIES: { id: string; pt: string; en: string }[] = [
  { id: 'credentials', pt: 'Chave e permissões', en: 'Key and permissions' },
  { id: 'setup', pt: 'Configuração financeira', en: 'Financial setup' },
  { id: 'request', pt: 'Pedido inválido', en: 'Invalid request' },
  { id: 'not_found', pt: 'Não encontrado', en: 'Not found' },
  { id: 'idempotency', pt: 'Idempotência', en: 'Idempotency' },
  { id: 'state', pt: 'Estado da conta ou do recurso', en: 'Account or resource state' },
  { id: 'settlement', pt: 'Liquidações', en: 'Settlements' },
  { id: 'refund', pt: 'Reembolsos', en: 'Refunds' },
  { id: 'server', pt: 'Limites e falhas do Banzami', en: 'Limits and Banzami failures' },
];

const RETRY: Record<Entry['retry'], Record<Lang, string>> = {
  no: { pt: 'Não', en: 'No' },
  yes: { pt: 'Sim', en: 'Yes' },
  after_delay: { pt: 'Depois de esperar', en: 'After waiting' },
  after_change: { pt: 'Quando a condição mudar', en: 'Once the condition changes' },
};
const KEY: Record<Entry['idempotency_key'], Record<Lang, string>> = {
  new: { pt: 'nova', en: 'new' },
  same: { pt: 'a mesma', en: 'the same' },
  'n/a': { pt: '—', en: '—' },
};

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid #EAE3E3' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #EAE3E3', verticalAlign: 'top', color: '#3f3538' };

export const ERROR_CATALOGUE = catalogue.errors as Entry[];

/**
 * Where to look, per family. Every code in a family is investigated in the same
 * place, so this is said once per family rather than 72 times — and the gate
 * fails a family that has no entry here.
 */
export const INSPECT: Record<string, Record<Lang, string>> = {
  credentials: { pt: 'Consola → Chaves de API: estado, scopes e última utilização da chave.', en: 'Console → API keys: the key’s status, scopes and last use.' },
  setup: { pt: 'Consola → Configuração financeira, ou GET /v1/financial-setup.', en: 'Console → Financial setup, or GET /v1/financial-setup.' },
  request: { pt: 'Consola → Registos, pelo request_id: método, caminho e estado do pedido. A mensagem nomeia o campo.', en: 'Console → Logs, by request_id: the request’s method, path and status. The message names the field.' },
  not_found: { pt: 'Confirme que a chave é do projeto que criou o recurso; Consola → Registos, pelo request_id.', en: 'Check the key belongs to the Project that created the resource; Console → Logs, by request_id.' },
  idempotency: { pt: 'Consola → Registos: os pedidos com a mesma Idempotency-Key, lado a lado.', en: 'Console → Logs: the requests with the same Idempotency-Key, side by side.' },
  state: { pt: 'Consola → Saldos e Transações: o estado da conta ou do recurso.', en: 'Console → Balances and Transactions: the account or resource state.' },
  settlement: { pt: 'GET /v1/financial-setup (settlement.blockers) e Consola → Configuração financeira.', en: 'GET /v1/financial-setup (settlement.blockers) and Console → Financial setup.' },
  refund: { pt: 'Consola → Transações: o pagamento e os reembolsos já feitos sobre ele.', en: 'Console → Transactions: the payment and the refunds already made against it.' },
  server: { pt: 'Consola → Registos, pelo request_id. Se persistir, suporte com esse request_id.', en: 'Console → Logs, by request_id. If it persists, support with that request_id.' },
};

/** Layer 1: what to do by HTTP class, before looking up a code. */
export const HTTP_CLASSES: { status: string; meaning: Record<Lang, string>; action: Record<Lang, string>; retry: Entry['retry']; key: Entry['idempotency_key'] }[] = [
  { status: '400', meaning: { pt: 'O pedido está mal formado ou um campo é inválido.', en: 'The request is malformed or a field is invalid.' }, action: { pt: 'Corrija o campo que a mensagem nomeia.', en: 'Fix the field the message names.' }, retry: 'after_change', key: 'new' },
  { status: '401', meaning: { pt: 'A chave falta, está revogada ou não é Sandbox.', en: 'The key is missing, revoked or not a Sandbox key.' }, action: { pt: 'Use uma chave ativa; confirme com GET /v1/me.', en: 'Use an active key; confirm with GET /v1/me.' }, retry: 'after_change', key: 'n/a' },
  { status: '403', meaning: { pt: 'A chave não pode fazer isto: falta um scope, ou o projeto não está pronto.', en: 'The key may not do this: a scope is missing, or the Project is not ready.' }, action: { pt: 'Leia o código: INSUFFICIENT_SCOPE pede outra chave; PAYMENTS_UNAVAILABLE pede a configuração financeira.', en: 'Read the code: INSUFFICIENT_SCOPE needs another key; PAYMENTS_UNAVAILABLE needs financial setup.' }, retry: 'after_change', key: 'n/a' },
  { status: '404', meaning: { pt: 'Não existe — ou é de outro projeto. As duas respostas são iguais de propósito.', en: 'It does not exist — or belongs to another Project. The two answers are the same on purpose.' }, action: { pt: 'Confirme o id e a chave do projeto que o criou.', en: 'Check the id and the key of the Project that created it.' }, retry: 'no', key: 'n/a' },
  { status: '409', meaning: { pt: 'Conflito: a mesma chave de idempotência noutro pedido, um pedido ainda em curso, ou o estado mudou.', en: 'Conflict: the same idempotency key on another request, a request still in flight, or the state changed.' }, action: { pt: 'IDEMPOTENCY_CONFLICT: espere e repita com a mesma chave. KEY_REUSED: é outro pedido, use outra chave.', en: 'IDEMPOTENCY_CONFLICT: wait and retry with the same key. KEY_REUSED: it is another request, use another key.' }, retry: 'after_change', key: 'same' },
  { status: '410', meaning: { pt: 'A rota foi retirada.', en: 'The route was retired.' }, action: { pt: 'Use a rota que a mensagem indica.', en: 'Use the route the message names.' }, retry: 'no', key: 'n/a' },
  { status: '422', meaning: { pt: 'O pedido está bem formado, mas o estado não o permite: saldo, limite, elegibilidade.', en: 'The request is well formed, but the state does not allow it: balance, limit, eligibility.' }, action: { pt: 'Nada aconteceu. Resolva a condição que o código nomeia e repita com uma chave nova.', en: 'Nothing happened. Resolve the condition the code names and retry with a new key.' }, retry: 'after_change', key: 'new' },
  { status: '429', meaning: { pt: 'Demasiados pedidos. Nada foi executado.', en: 'Too many requests. Nothing was executed.' }, action: { pt: 'Espere os segundos de Retry-After e repita com a mesma chave.', en: 'Wait the Retry-After seconds and retry with the same key.' }, retry: 'after_delay', key: 'same' },
  { status: '5xx', meaning: { pt: 'Falha do lado do Banzami, ou temporariamente indisponível.', en: 'A failure on Banzami’s side, or temporarily unavailable.' }, action: { pt: 'Repita com backoff e a mesma chave de idempotência; nunca conclua que nada aconteceu sem confirmar.', en: 'Retry with backoff and the same idempotency key; never conclude nothing happened without checking.' }, retry: 'yes', key: 'same' },
];

export function HttpClassTable({ lang }: { lang: Lang }) {
  const t = (pt: string, en: string) => (lang === 'pt' ? pt : en);
  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#6f6468' }}>
            <th style={th}>HTTP</th>
            <th style={th}>{t('O que significa', 'What it means')}</th>
            <th style={th}>{t('O que fazer', 'What to do')}</th>
            <th style={th}>{t('Repetir?', 'Retry?')}</th>
            <th style={th}>{t('Chave de idempotência', 'Idempotency key')}</th>
          </tr>
        </thead>
        <tbody>
          {HTTP_CLASSES.map((c) => (
            <tr key={c.status} id={`http-${c.status}`}>
              <td style={{ ...td, fontFamily: mono, fontWeight: 600, color: INK }}>{c.status}</td>
              <td style={td}>{c.meaning[lang]}</td>
              <td style={td}>{c.action[lang]}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{RETRY[c.retry][lang]}</td>
              <td style={{ ...td, whiteSpace: 'nowrap', color: MUT }}>{KEY[c.key][lang]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const statusOf = (e: Entry) => e.http.map(String);

export function ErrorCatalogue({ lang }: { lang: Lang }) {
  const t = (pt: string, en: string) => (lang === 'pt' ? pt : en);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [family, setFamily] = useState('');
  const statuses = [...new Set(ERROR_CATALOGUE.flatMap(statusOf))].sort();
  const needle = q.trim().toLowerCase();
  const matches = (e: Entry) =>
    (!status || statusOf(e).includes(status))
    && (!family || e.family === family)
    && (!needle || e.code.toLowerCase().includes(needle) || e.meaning[lang].toLowerCase().includes(needle) || e.action[lang].toLowerCase().includes(needle));
  const shown = ERROR_CATALOGUE.filter(matches).length;
  const control: React.CSSProperties = { font: 'inherit', fontSize: 13.5, padding: '8px 10px', borderRadius: 10, border: '1px solid #EBDBD9', background: '#fff', color: INK, minWidth: 0 };
  return (
    <>
      <P>{catalogue.idempotency_rule[lang]}</P>
      <div role="search" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '0 0 8px', maxWidth: 760 }}>
        <label style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 600, color: '#6f6468' }}>
          {t('Código ou palavra', 'Code or word')}
          <input type="search" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder={t('ex.: PAYMENTS_UNAVAILABLE', 'e.g. PAYMENTS_UNAVAILABLE')} style={control} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 600, color: '#6f6468' }}>
          HTTP
          <select value={status} onChange={(ev) => setStatus(ev.target.value)} style={control}>
            <option value="">{t('Todos', 'All')}</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, fontWeight: 600, color: '#6f6468' }}>
          {t('Domínio', 'Domain')}
          <select value={family} onChange={(ev) => setFamily(ev.target.value)} style={control}>
            <option value="">{t('Todos', 'All')}</option>
            {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f[lang]}</option>)}
          </select>
        </label>
      </div>
      <p aria-live="polite" style={{ margin: '0 0 12px', fontSize: 12.5, color: MUT, fontWeight: 700 }}>
        {t(`${shown} de ${ERROR_CATALOGUE.length} códigos`, `${shown} of ${ERROR_CATALOGUE.length} codes`)}
        {' · '}
        {t('Em todos: guarde o request_id da resposta — é por ele que encontra o pedido nos Registos e que o suporte o segue.', 'For all of them: keep the response’s request_id — it finds the request in Logs, and it is what support follows.')}
      </p>
      {FAMILIES.map((f) => {
        const rows = ERROR_CATALOGUE.filter((e) => e.family === f.id);
        const visible = rows.filter(matches);
        if (!rows.length) return null;
        return (
          <div key={f.id} hidden={visible.length === 0}>
            <H3 id={`${t('erros', 'errors')}-${f.id.replace('_', '-')}`}>{f[lang]}</H3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#3f3538', maxWidth: 760 }}>
              <strong>{t('Onde ver', 'Where to look')}:</strong> {INSPECT[f.id][lang]}
            </p>
            <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6f6468' }}>
                    <th style={th}>{t('Código', 'Code')}</th>
                    <th style={th}>HTTP</th>
                    <th style={th}>{t('O que significa', 'What it means')}</th>
                    <th style={th}>{t('O que fazer', 'What to do')}</th>
                    <th style={th}>{t('Repetir?', 'Retry?')}</th>
                    <th style={th}>{t('Chave de idempotência', 'Idempotency key')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.code} id={`error-${e.code}`} hidden={!matches(e)}>
                      <td style={{ ...td, fontFamily: mono, fontSize: 12, fontWeight: 700, color: '#9A1B22', whiteSpace: 'nowrap' }}>{e.code}</td>
                      <td style={{ ...td, fontFamily: mono, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{e.http.join(' · ')}</td>
                      <td style={td}>{e.meaning[lang]}</td>
                      <td style={td}>{e.action[lang]}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{RETRY[e.retry][lang]}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: MUT }}>{KEY[e.idempotency_key][lang]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
