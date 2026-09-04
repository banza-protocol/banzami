'use client';

// P1 API reference by resource — single bilingual (PT/EN) source of truth for
// the endpoint reference rendered on /docs (PT) and /docs/en (EN).
//
// EVIDENCE RULE: every endpoint below exists in the gateway router and its
// request/response shapes were read from the actual handlers before being
// documented. Placeholder values only (bz_test_..., wacc_exemplo, idem_...).
// Statuses mirror the credential↔capability matrix: nothing is presented as
// available to a credential that would be rejected today.

import type { ReactNode } from 'react';
import { BADGE_LABELS_EN, Badge, Code, CodeBlock, H3, INK, LI, P, UL, mono, type Tone } from './ui';

type Bi = { pt: string; en: string };

export type EndpointSpec = {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  tone: Tone;
  desc: Bi;
  credential: Bi;
  headers: string[];
  requestFields?: { name: string; note: Bi }[];
  curl?: string;
  response?: string;
  errors: { code: string; note: Bi }[];
  idem?: Bi;
};

export const ENDPOINTS: EndpointSpec[] = [
  {
    id: 'ref-me',
    method: 'GET',
    path: '/v1/me',
    tone: 'ok',
    desc: {
      pt: 'Identidade da chave: devolve o ambiente, o projeto, os scopes e o estado da chave autenticada. Não devolve estado financeiro.',
      en: 'Key identity: returns the environment, project, scopes and status of the authenticated key. Returns no financial state.',
    },
    credential: {
      pt: 'Chave developer bz_test_ (scope identity:read)',
      en: 'Developer key bz_test_ (identity:read scope)',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl https://sandbox-api.banzami.com/v1/me \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "environment": "SANDBOX",
  "project": "meu-projeto",
  "scopes": ["identity:read"],
  "key_status": "ACTIVE"
}`,
    errors: [
      { code: '401 UNAUTHORIZED', note: { pt: 'chave em falta, inválida, revogada ou bz_live_ (recusada, fail-closed)', en: 'missing, invalid, revoked or bz_live_ key (rejected, fail-closed)' } },
      { code: '403 FORBIDDEN', note: { pt: 'chave sem o scope identity:read', en: 'key without the identity:read scope' } },
    ],
  },
  {
    id: 'ref-ps-create',
    method: 'POST',
    path: '/v1/business/payment-sessions',
    tone: 'ok',
    desc: {
      pt: 'Cria uma sessão de pagamento e devolve o id, o estado e as interfaces (link/QR) para apresentar ao pagador.',
      en: 'Creates a payment session and returns its id, status and the interfaces (link/QR) to present to the payer.',
    },
    credential: {
      pt: 'Chave developer (scope payment_sessions, projeto com binding ativo) ou credencial de merchant',
      en: 'Developer key (payment_sessions scope, project with an ACTIVE binding) or merchant credential',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json', 'Idempotency-Key: idem_pedido_123'],
    requestFields: [
      { name: 'wallet_account_id', note: {
        pt: 'APENAS credencial de merchant. Com uma chave developer o destinatário vem do binding do projeto — não envie este campo; a API recusa-o.',
        en: 'Merchant credential ONLY. With a Developer Platform key the recipient is derived from the project’s Banzami binding — do not provide it; the API rejects it.' } },
      { name: 'purpose', note: { pt: 'finalidade (ex.: PAGAMENTO)', en: 'purpose (e.g. PAGAMENTO)' } },
      { name: 'reference_type / reference_id', note: { pt: 'a sua referência de negócio', en: 'your business reference' } },
      { name: 'amount_minor', note: { pt: 'montante em unidades menores (AOA)', en: 'amount in minor units (AOA)' } },
      { name: 'currency', note: { pt: 'moeda (AOA)', en: 'currency (AOA)' } },
      { name: 'description', note: { pt: 'descrição apresentada ao pagador', en: 'description shown to the payer' } },
      { name: 'expires_at / metadata', note: { pt: 'opcionais', en: 'optional' } },
    ],
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/business/payment-sessions \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idem_pedido_123" \\
  -d '{
    "wallet_account_id": "wacc_exemplo",
    "purpose": "PAGAMENTO",
    "reference_type": "PEDIDO",
    "reference_id": "pedido_123",
    "amount_minor": 25000,
    "currency": "AOA",
    "description": "Pedido #123"
  }'`,
    response: `{
  "session_id": "psess_exemplo",
  "wallet_account_id": "wacc_exemplo",
  "currency": "AOA",
  "amount_minor": 25000,
  "purpose": "PAGAMENTO",
  "reference_type": "PEDIDO",
  "reference_id": "pedido_123",
  "status": "ACTIVE",
  "expires_at": "2026-07-11T12:00:00Z",
  "created_at": "2026-07-11T11:45:00Z",
  "interfaces": [
    { "type": "DYNAMIC_QR", "value": "<payload>", "format": "QR_PAYLOAD",
      "qr_url": "https://pay.banzami.com/…", "expires_at": "2026-07-11T12:00:00Z" }
  ]
}`,
    errors: [
      { code: '400 MISSING_FIELD / INVALID_BODY / VALIDATION_ERROR', note: { pt: 'corrija o pedido', en: 'fix the request' } },
      { code: '401 UNAUTHORIZED', note: { pt: 'credencial inválida', en: 'invalid credential' } },
      { code: '403 FORBIDDEN', note: { pt: 'scope insuficiente ou projeto sem binding', en: 'insufficient scope or project without binding' } },
      { code: '409 CONFLICT', note: { pt: 'Idempotency-Key em curso', en: 'Idempotency-Key in flight' } },
    ],
    idem: {
      pt: 'Suporta Idempotency-Key: a resposta original é reproduzida durante 24 horas para a mesma chave.',
      en: 'Supports Idempotency-Key: the original response is replayed for the same key for 24 hours.',
    },
  },
  {
    id: 'ref-ps-get',
    method: 'GET',
    path: '/v1/business/payment-sessions/{id}',
    tone: 'ok',
    desc: {
      pt: 'Consulta uma sessão (o mesmo corpo da criação, com o estado atual). GET /v1/business/payment-sessions lista as sessões do projeto/merchant, com filtro opcional ?status=.',
      en: 'Fetches one session (same body as creation, with the current status). GET /v1/business/payment-sessions lists the project/merchant sessions, with an optional ?status= filter.',
    },
    credential: {
      pt: 'Como na criação',
      en: 'Same as creation',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl https://sandbox-api.banzami.com/v1/business/payment-sessions/psess_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    errors: [
      { code: '404 NOT_FOUND', note: { pt: 'sessão inexistente ou fora do seu âmbito', en: 'session missing or outside your scope' } },
      { code: '401 UNAUTHORIZED', note: { pt: 'credencial inválida', en: 'invalid credential' } },
    ],
  },
  {
    id: 'ref-ps-link',
    method: 'GET',
    path: '/v1/business/payment-sessions/{id}/link',
    tone: 'ok',
    desc: {
      pt: 'Devolve o link público de pagamento da sessão.',
      en: 'Returns the session’s public payment link.',
    },
    credential: { pt: 'Como na criação', en: 'Same as creation' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    response: `{
  "type": "PAYMENT_LINK",
  "slug": "slug_exemplo",
  "url": "https://pay.banzami.com/pay/slug_exemplo"
}`,
    errors: [
      { code: '404 NO_LINK', note: { pt: 'a sessão não tem link de pagamento', en: 'the session has no payment link' } },
    ],
  },
  {
    id: 'ref-ps-qr',
    method: 'GET',
    path: '/v1/business/payment-sessions/{id}/qr',
    tone: 'ok',
    desc: {
      pt: 'Devolve o QR da sessão. Sem parâmetros devolve o valor codificável em JSON; com ?format=png|svg|pdf devolve a imagem renderizada.',
      en: 'Returns the session QR. Without parameters it returns the encodable value as JSON; with ?format=png|svg|pdf it returns the rendered image.',
    },
    credential: { pt: 'Como na criação', en: 'Same as creation' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl "https://sandbox-api.banzami.com/v1/business/payment-sessions/psess_exemplo/qr?format=svg" \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    errors: [
      { code: '404 NOT_FOUND', note: { pt: 'sessão inexistente', en: 'session missing' } },
    ],
  },
  {
    id: 'ref-pl-create',
    method: 'POST',
    path: '/v1/payment-links',
    tone: 'ok',
    desc: {
      pt: 'Cria um link de pagamento reutilizável com slug público (pay.banzami.com/pay/{slug}). GET /v1/payment-links lista; GET/DELETE /v1/payment-links/{id} consulta/desativa.',
      en: 'Creates a reusable payment link with a public slug (pay.banzami.com/pay/{slug}). GET /v1/payment-links lists; GET/DELETE /v1/payment-links/{id} fetches/deactivates.',
    },
    credential: {
      pt: 'Credencial de merchant, ou chave developer com scope payment_links (projeto com binding ativo)',
      en: 'Merchant credential, or developer key with the payment_links scope (project with an ACTIVE binding)',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json', 'Idempotency-Key: idem_link_001'],
    requestFields: [
      { name: 'wallet_id', note: { pt: 'carteira de destino', en: 'destination wallet' } },
      { name: 'amount_minor', note: { pt: 'opcional — omitido cria link de montante aberto', en: 'optional — omit for an open-amount link' } },
      { name: 'currency', note: { pt: 'AOA', en: 'AOA' } },
      { name: 'description / expires_at', note: { pt: 'opcionais', en: 'optional' } },
    ],
    response: `{
  "slug": "slug_exemplo",
  "amount_minor": 25000,
  "currency": "AOA",
  "description": "Pedido #123",
  "status": "ACTIVE",
  "expires_at": null,
  "paid_at": null,
  "merchant_name": "Loja Exemplo"
}`,
    errors: [
      { code: '400 VALIDATION_ERROR', note: { pt: 'corrija os campos', en: 'fix the fields' } },
      { code: '403 FORBIDDEN', note: { pt: 'scope insuficiente', en: 'insufficient scope' } },
    ],
    idem: {
      pt: 'Suporta Idempotency-Key como qualquer operação de escrita.',
      en: 'Supports Idempotency-Key like any write operation.',
    },
  },
];

// Compact rows for surfaces that exist but are NOT public-key callable today.
export const RESTRICTED_ROWS: { path: string; status: Bi }[] = [
  { path: 'POST/GET /v1/webhooks/endpoints · /{id} · /health · /v1/webhooks/events · /deliveries · /replay', status: { pt: 'Credencial de merchant — documentado, não público para chaves developer', en: 'Merchant credential — documented, not public for developer keys' } },
  { path: 'POST /v1/refunds · GET /v1/refunds/{id}', status: { pt: 'Verificado com credencial de merchant; scope developer refunds:write Pendente E2E (403)', en: 'Verified with a merchant credential; developer refunds:write scope Pending E2E (403)' } },
  { path: 'POST/GET /v1/transfers', status: { pt: 'Superfície de consumidor apenas — o remetente deriva do token do consumidor; não disponível a credenciais de merchant', en: 'Consumer surface only — the sender derives from the consumer token; not available to merchant credentials' } },
];

const label = (l: 'pt' | 'en', pt: string, en: string) => (l === 'pt' ? pt : en);

export function ResourceReference({ lang, onCopy }: { lang: 'pt' | 'en'; onCopy: (t: string, l: string) => void }) {
  const t = (b: Bi) => b[lang];
  const copyProps = lang === 'en' ? { toastText: 'Copied to clipboard', buttonText: 'Copy' } : {};
  return (
    <div>
      {ENDPOINTS.map((e) => (
        <div key={e.id} id={e.id} style={{ scrollMarginTop: 80 }}>
          <H3>
            <span style={{ fontFamily: mono, fontSize: 15 }}>{e.method} {e.path}</span>{' '}
            <Badge tone={e.tone}>{lang === 'en' ? BADGE_LABELS_EN[e.tone] : undefined}</Badge>
          </H3>
          <P>{t(e.desc)}</P>
          <UL>
            <LI><strong>{label(lang, 'Credencial', 'Credential')}:</strong> {t(e.credential)}</LI>
            <LI><strong>Headers:</strong> {e.headers.map((h, i) => (<span key={h}>{i > 0 ? ' · ' : ''}<Code>{h}</Code></span>))}</LI>
            {e.requestFields ? (
              <LI>
                <strong>{label(lang, 'Campos do pedido', 'Request fields')}:</strong>{' '}
                {e.requestFields.map((f, i) => (
                  <span key={f.name}>{i > 0 ? ' · ' : ''}<Code>{f.name}</Code> ({t(f.note)})</span>
                ))}
              </LI>
            ) : null}
            {e.idem ? <LI><strong>{label(lang, 'Idempotência', 'Idempotency')}:</strong> {t(e.idem)}</LI> : null}
          </UL>
          {e.curl ? <CodeBlock label={`curl · ${e.method} ${e.path}`} raw={e.curl} onCopy={onCopy} {...copyProps} /> : null}
          {e.response ? <CodeBlock label={label(lang, 'resposta (exemplo, placeholders)', 'response (example, placeholders)')} raw={e.response} onCopy={onCopy} {...copyProps} /> : null}
          <P style={{ fontSize: 13, color: '#a89a9e' }}>
            <strong>{label(lang, 'Erros comuns', 'Common errors')}:</strong>{' '}
            {e.errors.map((er, i) => (
              <span key={er.code}>{i > 0 ? ' · ' : ''}<Code>{er.code}</Code> — {t(er.note)}</span>
            ))}
          </P>
        </div>
      ))}

      <H3>{label(lang, 'Superfícies existentes com credencial restrita', 'Existing surfaces with restricted credentials')}</H3>
      <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
              <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>{label(lang, 'Rotas', 'Routes')}</th>
              <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>{label(lang, 'Estado / credencial', 'Status / credential')}</th>
            </tr>
          </thead>
          <tbody>
            {RESTRICTED_ROWS.map((r) => (
              <tr key={r.path}>
                <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontSize: 12, fontWeight: 700, color: INK }}>{r.path}</td>
                <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r.status[lang]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Convenience wrapper so pages can show a badge with the correct language label.
export function LangBadge({ tone, lang }: { tone: Tone; lang: 'pt' | 'en' }): ReactNode {
  return <Badge tone={tone}>{lang === 'en' ? BADGE_LABELS_EN[tone] : undefined}</Badge>;
}
