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
      { name: 'purpose', note: { pt: 'finalidade — um de GENERIC, DONATION, ORDER, TICKET, STORE, EVENT, CAMPAIGN, CUSTOM', en: 'purpose — one of GENERIC, DONATION, ORDER, TICKET, STORE, EVENT, CAMPAIGN, CUSTOM' } },
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
    "purpose": "ORDER",
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
  "purpose": "ORDER",
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
  {
    id: 'ref-wacc-create',
    method: 'POST',
    path: '/v1/business/wallet-accounts',
    tone: 'ok',
    desc: {
      pt: 'Abre uma conta do seu projeto para segregar valor por referência de negócio (por exemplo, uma campanha). O titular vem do binding — não há campo que o possa indicar.',
      en: 'Opens an account of your project to segregate value by business reference (a campaign, say). The owner comes from the binding — no field can name it.',
    },
    credential: { pt: 'Chave de projeto (scope wallet_accounts:create)', en: 'Project key (wallet_accounts:create scope)' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json'],
    requestFields: [
      { name: 'purpose', note: { pt: 'finalidade da conta — um de CAMPAIGN, PROJECT, EVENT, STORE, ESCROW, RESERVE, SETTLEMENT, CUSTOM (PRIMARY é criada com a carteira)', en: 'account purpose — one of CAMPAIGN, PROJECT, EVENT, STORE, ESCROW, RESERVE, SETTLEMENT, CUSTOM (PRIMARY is created with the wallet)' } },
      { name: 'reference_type / reference_id', note: { pt: 'a sua referência de negócio', en: 'your business reference' } },
      { name: 'label', note: { pt: 'nome legível, opcional', en: 'human-readable label, optional' } },
    ],
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/business/wallet-accounts \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "purpose": "CAMPAIGN",
    "reference_type": "CAMPANHA",
    "reference_id": "campanha_123",
    "label": "Campanha 123"
  }'`,
    response: `{
  "id": "wacc_exemplo",
  "wallet_id": "wlt_exemplo",
  "purpose": "CAMPAIGN",
  "reference_type": "CAMPANHA",
  "reference_id": "campanha_123",
  "label": "Campanha 123",
  "status": "ACTIVE",
  "available_balance_minor": 0,
  "currency": "AOA",
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '400 MISSING_FIELD / VALIDATION_ERROR', note: { pt: 'corrija o pedido', en: 'fix the request' } },
      { code: '403 FORBIDDEN', note: { pt: 'scope insuficiente ou projeto sem binding', en: 'insufficient scope or project without binding' } },
      { code: '404 NOT_FOUND', note: { pt: 'uma conta de outro projeto é indistinguível de uma que não existe', en: 'another project’s account is indistinguishable from one that does not exist' } },
    ],
  },
  {
    id: 'ref-transfer-create',
    method: 'POST',
    path: '/v1/business/transfers',
    tone: 'ok',
    desc: {
      pt: 'Move valor entre duas contas do mesmo titular do seu projeto. Débito e crédito atómicos: o total do titular não muda, apenas a distribuição.',
      en: 'Moves value between two accounts of your project’s own owner. Atomic debit and credit: the owner’s total does not change, only its distribution.',
    },
    credential: { pt: 'Chave de projeto (scope transfers:write)', en: 'Project key (transfers:write scope)' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json'],
    requestFields: [
      { name: 'source_wallet_account_id', note: { pt: 'conta de origem — tem de ser sua', en: 'source account — must be yours' } },
      { name: 'destination_wallet_account_id', note: { pt: 'conta de destino — tem de ser sua e diferente da origem', en: 'destination account — must be yours and different from the source' } },
      { name: 'amount_minor', note: { pt: 'montante em unidades menores (AOA), inteiro positivo', en: 'amount in minor units (AOA), a positive integer' } },
      { name: 'currency', note: { pt: 'moeda (AOA)', en: 'currency (AOA)' } },
      { name: 'idempotency_key', note: { pt: 'obrigatório — sem ele cada repetição seria uma transferência nova', en: 'required — without it every retry would be a new transfer' } },
      { name: 'description', note: { pt: 'opcional', en: 'optional' } },
    ],
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/business/transfers \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_wallet_account_id": "wacc_origem",
    "destination_wallet_account_id": "wacc_destino",
    "amount_minor": 50000,
    "currency": "AOA",
    "idempotency_key": "idem_transferencia_123"
  }'`,
    response: `{
  "id": "wtr_exemplo",
  "source_wallet_account_id": "wacc_origem",
  "destination_wallet_account_id": "wacc_destino",
  "amount_minor": 50000,
  "currency": "AOA",
  "status": "COMPLETED",
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '400 INVALID_DESTINATION', note: { pt: 'origem e destino iguais', en: 'source and destination are the same' } },
      { code: '400 INVALID_AMOUNT', note: { pt: 'amount_minor tem de ser positivo', en: 'amount_minor must be positive' } },
      { code: '400 MISSING_FIELD', note: { pt: 'idempotency_key ou currency em falta', en: 'idempotency_key or currency missing' } },
      { code: '403 FORBIDDEN', note: { pt: 'scope insuficiente ou projeto sem binding', en: 'insufficient scope or project without binding' } },
      { code: '404 NOT_FOUND', note: { pt: 'uma conta que não é sua responde 404, indistinguível de uma que não existe', en: 'an account that is not yours answers 404, indistinguishable from one that does not exist' } },
      { code: '409 CONFLICT', note: { pt: 'a mesma idempotency_key com um pedido diferente', en: 'the same idempotency_key with a different request' } },
      { code: '422 UNPROCESSABLE', note: { pt: 'saldo insuficiente — nada se move', en: 'insufficient funds — nothing moves' } },
    ],
    idem: {
      pt: 'Repetir o mesmo idempotency_key devolve a transferência original sem mover fundos duas vezes.',
      en: 'Replaying the same idempotency_key returns the original transfer without moving funds twice.',
    },
  },
  {
    id: 'ref-refund-create',
    method: 'POST',
    path: '/v1/refunds',
    tone: 'ok',
    desc: {
      pt: 'Devolve, total ou parcialmente, um pagamento elegível. O reembolso debita a conta que recebeu o pagamento — não o saldo geral do titular.',
      en: 'Returns an eligible payment, fully or partially. The refund debits the account that received the payment — not the owner’s general balance.',
    },
    credential: { pt: 'Chave de projeto (scope refunds:write) ou credencial de merchant', en: 'Project key (refunds:write scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json'],
    requestFields: [
      { name: 'source_type', note: { pt: 'ACQUIRING_PAYMENT ou WALLET_PAYMENT', en: 'ACQUIRING_PAYMENT or WALLET_PAYMENT' } },
      { name: 'source_id', note: { pt: 'o pagamento a reembolsar', en: 'the payment to refund' } },
      { name: 'amount_minor', note: { pt: 'montante em unidades menores, até ao limite acumulado da origem', en: 'amount in minor units, up to the source’s accrued cap' } },
      { name: 'currency', note: { pt: 'confirmada contra a origem', en: 'validated against the source' } },
      { name: 'idempotency_key', note: { pt: 'obrigatório', en: 'required' } },
      { name: 'reason', note: { pt: 'opcional', en: 'optional' } },
    ],
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/refunds \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_type": "WALLET_PAYMENT",
    "source_id": "wpay_exemplo",
    "amount_minor": 50000,
    "currency": "AOA",
    "idempotency_key": "idem_reembolso_123"
  }'`,
    response: `{
  "id": "rfnd_exemplo",
  "source_type": "WALLET_PAYMENT",
  "source_id": "wpay_exemplo",
  "amount_minor": 50000,
  "currency": "AOA",
  "status": "COMPLETED",
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '400 VALIDATION_ERROR', note: { pt: 'moeda diferente da origem, montante acima do limite, campos em falta', en: 'currency differs from the source, amount above the cap, missing fields' } },
      { code: '403 FORBIDDEN', note: { pt: 'chave sem refunds:write — uma chave de leitura não reembolsa', en: 'key without refunds:write — a read-only key cannot refund' } },
      { code: '404 NOT_FOUND', note: { pt: 'um pagamento de outro projeto responde 404: conhecer um id não é autoridade sobre ele', en: 'another project’s payment answers 404: knowing an id is not authority over it' } },
    ],
    idem: {
      pt: 'Repetir o mesmo idempotency_key devolve o reembolso original e não devolve valor duas vezes.',
      en: 'Replaying the same idempotency_key returns the original refund and does not refund twice.',
    },
  },
  {
    id: 'ref-webhook-register',
    method: 'POST',
    path: '/v1/business/webhooks/endpoints',
    tone: 'ok',
    desc: {
      pt: 'Regista o endpoint HTTPS que recebe os eventos do seu projeto. O segredo de assinatura é devolvido uma única vez, na criação, e nunca mais é legível.',
      en: 'Registers the HTTPS endpoint that receives your project’s events. The signing secret is returned exactly once, on creation, and is never readable again.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:write); leitura com webhooks:read', en: 'Project key (webhooks:write scope); reads with webhooks:read' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json'],
    requestFields: [
      { name: 'url', note: { pt: 'destino https público — http, loopback e endereços privados são recusados', en: 'public https destination — http, loopback and private addresses are refused' } },
      { name: 'events', note: { pt: 'pelo menos um tipo de evento suportado; um nome desconhecido é recusado em vez de aceite em silêncio', en: 'at least one supported event type; an unknown name is refused rather than silently accepted' } },
    ],
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/business/webhooks/endpoints \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://o-seu-servidor.exemplo/webhooks/banzami",
    "events": ["payment_session.paid"]
  }'`,
    response: `{
  "id": "whep_exemplo",
  "url": "https://o-seu-servidor.exemplo/webhooks/banzami",
  "events": ["payment_session.paid"],
  "active": true,
  "secret": "<devolvido apenas nesta resposta>",
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '400 INVALID_WEBHOOK_URL', note: { pt: 'o destino não é um https público', en: 'the destination is not a public https endpoint' } },
      { code: '400 UNSUPPORTED_EVENT', note: { pt: 'tipo de evento não suportado', en: 'unsupported event type' } },
      { code: '403 FORBIDDEN', note: { pt: 'scope insuficiente ou projeto sem binding', en: 'insufficient scope or project without binding' } },
      { code: '404 NOT_FOUND', note: { pt: 'um endpoint de outro projeto responde 404', en: 'another project’s endpoint answers 404' } },
    ],
  },

];

// Compact rows for surfaces that exist but are NOT public-key callable today.
export const RESTRICTED_ROWS: { path: string; status: Bi }[] = [
  { path: 'POST/GET /v1/webhooks/endpoints · /{id} · /health · /v1/webhooks/events · /deliveries · /replay', status: { pt: 'Caminho legado de merchant. Uma chave de projeto usa /v1/business/webhooks/*, documentado acima.', en: 'Legacy merchant path. A project key uses /v1/business/webhooks/*, documented above.' } },
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
