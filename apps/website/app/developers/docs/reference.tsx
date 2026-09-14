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
import { BADGE_LABELS_EN, Badge, Code, CodeBlock, H2, INK, P, mono, type Tone } from './ui';
import { ENDPOINT_META, type EndpointMeta, type Param, type ParamIn } from './endpoint-meta';
import explorerOperations from './explorer-operations.json';
import { ApiMethod, ApiPath, HttpStatus } from '@/components/developers/api/ApiMethod';
import openapiStatuses from './openapi-statuses.json';

/** Success statuses per operation, generated from the OpenAPI mirror (tools/docs/build-openapi-statuses.mjs). */
const OPENAPI_STATUSES = openapiStatuses as Record<string, number[]>;
const SUBHEAD: React.CSSProperties = { margin: '0 0 8px', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6f6468' };

// The operations the Console's API Explorer can run (generated from the OpenAPI by
// tools/docs/build-explorer-allowlist.mjs): those entries get "Try in Sandbox".
const EXPLORER_OP = new Map(explorerOperations.operations.map((o) => [o.method + ' ' + o.path, o.operation_id]));

type Bi = { pt: string; en: string };

export type EndpointSpec = {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  tone: Tone;
  desc: Bi;
  credential: Bi;
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
      pt: 'Devolve o ambiente, o projeto, os scopes e o estado da chave. Use-o para confirmar uma chave antes de a pôr em uso; não devolve estado financeiro.',
      en: 'Returns the environment, project, scopes and status of the key. Use it to confirm a key before deploying it; it returns no financial state.',
    },
    credential: { pt: 'Chave secreta do projeto', en: 'Project secret key' },
    curl: `curl https://sandbox-api.banzami.com/v1/me \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "environment": "SANDBOX",
  "project": {
    "id": "6f1c2d3e-0000-4000-8000-000000000000",
    "name": "Meu Projeto",
    "ref": "meu-projeto"
  },
  "scopes": ["identity:read"],
  "key_status": "ACTIVE"
}`,
    errors: [
      { code: '401 UNAUTHORIZED', note: { pt: 'a chave falta, é inválida ou foi revogada; uma chave bz_live_ é sempre recusada', en: 'the key is missing, invalid or revoked; a bz_live_ key is always refused' } },
      { code: '403 FORBIDDEN', note: { pt: 'chave sem o scope identity:read', en: 'key without the identity:read scope' } },
    ],
  },
  {
    id: 'ref-financial-setup',
    method: 'GET',
    path: '/v1/financial-setup',
    tone: 'ok',
    desc: {
      pt: 'Devolve a prontidão financeira do projeto: se pode receber e liquidar e, se não puder, o que falta. Cada bloqueio em settlement.blockers é a recusa que uma liquidação devolveria; um projeto por configurar responde 200 com UNCONFIGURED.',
      en: 'Returns the project’s financial readiness: whether it can receive payments and settle and, if not, what is missing. Each entry in settlement.blockers is the refusal a settlement would return; an unconfigured project answers 200 with UNCONFIGURED.',
    },
    credential: { pt: 'Chave secreta do projeto', en: 'Project secret key' },
    curl: `curl https://sandbox-api.banzami.com/v1/financial-setup \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "environment": "SANDBOX",
  "project": { "id": "6f1c2d3e-0000-4000-8000-000000000000", "name": "Meu Projeto", "ref": "meu-projeto" },
  "financial_setup": { "state": "READY", "configured": true, "sealed": false },
  "financial_identity": { "handle": "@meu-negocio" },
  "kyb": { "status": "APPROVED" },
  "wallet": { "status": "ACTIVE", "ready": true, "currency": "AOA" },
  "pricing": { "profile": "sandbox-default", "settlement_bps": 0, "payout_bps": 75 },
  "fee_destination": { "handle": "@meu-negocio", "required": false, "resolved": true, "owned_by_project": true,
    "kyb_approved": true, "wallet_active": true, "type_allowed": false, "application_account_ready": true,
    "eligible": false, "blocker": "FEE_DESTINATION_TYPE_NOT_ALLOWED" },
  "settlement": { "ready": true, "blockers": [], "warnings": ["WEBHOOK_ENDPOINT_MISSING"] }
}`,
    errors: [
      { code: '401 UNAUTHORIZED', note: { pt: 'a chave falta, é inválida ou foi revogada; uma chave bz_live_ é sempre recusada', en: 'the key is missing, invalid or revoked; a bz_live_ key is always refused' } },
      { code: '403 INSUFFICIENT_SCOPE', note: { pt: 'chave sem o scope identity:read', en: 'key without the identity:read scope' } },
      { code: '409 FINANCIAL_SETUP_CONFLICT', note: { pt: 'a configuração financeira do projeto está inconsistente; contacte o suporte com o request_id', en: 'the project’s Financial Setup is inconsistent; contact support with the request_id' } },
      { code: '503 SERVICE_UNAVAILABLE', note: { pt: 'a prontidão não pôde ser avaliada neste momento; repita o pedido', en: 'readiness could not be evaluated right now; retry the request' } },
    ],
  },
  {
    id: 'ref-ps-create',
    method: 'POST',
    path: '/v1/payment-sessions',
    tone: 'ok',
    desc: {
      pt: 'Cria uma sessão de pagamento com um link e um QR que o pagador abre para pagar. O destinatário vem da configuração financeira do projeto.',
      en: 'Creates a Payment Session with a link and a QR code the payer opens to pay. The payee comes from the project’s Financial Setup.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idem_pedido_123" \\
  -d '{
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
    { "type": "PAYMENT_LINK", "value": "https://pay.banzami.com/pay/slug_exemplo", "format": "URL",
      "expires_at": "2026-07-11T12:00:00Z" },
    { "type": "DEEP_LINK", "value": "banzami://pay/slug_exemplo", "format": "URL",
      "expires_at": "2026-07-11T12:00:00Z" },
    { "type": "DYNAMIC_QR", "value": "https://pay.banzami.com/pay/slug_exemplo", "format": "QR_PAYLOAD",
      "qr_url": "/v1/payment-sessions/psess_exemplo/qr", "expires_at": "2026-07-11T12:00:00Z" }
  ]
}`,
    errors: [
      { code: '400 MISSING_FIELD / INVALID_BODY / INVALID_METADATA', note: { pt: 'o JSON é inválido, falta um campo ou metadata excede os limites', en: 'the JSON is invalid, a field is missing, or metadata exceeds its limits' } },
      { code: '400 PAYEE_NOT_ALLOWED', note: { pt: 'o corpo indica um destinatário (merchant_id, wallet_id ou payee); o destinatário vem da configuração financeira', en: 'the body names a payee (merchant_id, wallet_id or payee); the payee comes from Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'wallet_account_id não existe ou pertence a outro projeto', en: 'wallet_account_id does not exist or belongs to another project' } },
      { code: '401 UNAUTHORIZED', note: { pt: 'a chave falta, é inválida ou foi revogada', en: 'the key is missing, invalid or revoked' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_sessions:write, ou projeto sem configuração financeira concluída', en: 'key without payment_sessions:write, or project without completed Financial Setup' } },
      { code: '409 IDEMPOTENCY_CONFLICT', note: { pt: 'um pedido com a mesma Idempotency-Key ainda está em curso', en: 'a request with the same Idempotency-Key is still in flight' } },
      { code: '409 IDEMPOTENCY_KEY_REUSED', note: { pt: 'a mesma Idempotency-Key com um corpo diferente', en: 'the same Idempotency-Key with a different body' } },
      { code: '409 BINDING_CHANGED', note: { pt: 'a configuração financeira mudou durante o pedido; repita com uma Idempotency-Key nova', en: 'Financial Setup changed during the request; retry with a new Idempotency-Key' } },
    ],
    idem: {
      pt: 'Suporta Idempotency-Key: a resposta original é reproduzida durante 24 horas para a mesma chave.',
      en: 'Supports Idempotency-Key: the original response is replayed for the same key for 24 hours.',
    },
  },
  {
    id: 'ref-ps-get',
    method: 'GET',
    path: '/v1/payment-sessions/{id}',
    tone: 'ok',
    desc: {
      pt: 'Devolve uma sessão com o estado atual. Consulte-a no servidor para confirmar um pagamento; depois de paga, inclui refund_source.',
      en: 'Returns a session with its current status. Read it on your server to confirm a payment; once paid, it includes refund_source.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/payment-sessions/psess_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "session_id": "psess_exemplo",
  "wallet_account_id": "wacc_exemplo",
  "currency": "AOA",
  "amount_minor": 25000,
  "purpose": "ORDER",
  "reference_type": "PEDIDO",
  "reference_id": "pedido_123",
  "status": "PAID",
  "expires_at": "2026-07-11T12:00:00Z",
  "created_at": "2026-07-11T11:45:00Z",
  "interfaces": [
    { "type": "PAYMENT_LINK", "value": "https://pay.banzami.com/pay/slug_exemplo", "format": "URL" }
  ],
  "refund_source": { "source_type": "WALLET_PAYMENT", "source_id": "wpay_exemplo" }
}`,
    errors: [
      { code: '404 NOT_FOUND', note: { pt: 'a sessão não existe ou pertence a outro projeto', en: 'the session does not exist or belongs to another project' } },
      { code: '401 UNAUTHORIZED', note: { pt: 'a chave falta, é inválida ou foi revogada', en: 'the key is missing, invalid or revoked' } },
    ],
  },
  {
    id: 'ref-ps-list',
    method: 'GET',
    path: '/v1/payment-sessions',
    tone: 'ok',
    desc: {
      pt: 'Lista as sessões do projeto, da mais recente para a mais antiga, com filtro por estado. Não tem paginação por cursor.',
      en: 'Lists the project’s sessions, newest first, with a status filter. It has no cursor pagination.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl "https://sandbox-api.banzami.com/v1/payment-sessions?status=PAID&limit=20" \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "data": [
    {
      "session_id": "psess_exemplo",
      "status": "PAID",
      "amount_minor": 25000,
      "currency": "AOA",
      "reference_type": "PEDIDO",
      "reference_id": "pedido_123",
      "created_at": "2026-07-11T11:45:00Z"
    }
  ]
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_sessions:read, ou projeto sem configuração financeira concluída', en: 'key without payment_sessions:read, or project without completed Financial Setup' } },
      { code: '401 UNAUTHORIZED', note: { pt: 'a chave falta, é inválida ou foi revogada', en: 'the key is missing, invalid or revoked' } },
    ],
  },
  {
    id: 'ref-ps-link',
    method: 'GET',
    path: '/v1/payment-sessions/{id}/link',
    tone: 'ok',
    desc: {
      pt: 'Devolve o link de pagamento da sessão, para o apresentar ao pagador.',
      en: 'Returns the session’s payment link, to show to the payer.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
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
    path: '/v1/payment-sessions/{id}/qr',
    tone: 'ok',
    desc: {
      pt: 'Devolve o QR da sessão, como valor JSON ou como imagem PNG ou SVG. O QR codifica o URL da página de pagamento, que qualquer câmara abre.',
      en: 'Returns the session’s QR code, as a JSON value or as a PNG or SVG image. The QR code encodes the payment page URL, which any camera opens.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl "https://sandbox-api.banzami.com/v1/payment-sessions/psess_exemplo/qr?format=svg" \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "type": "QR",
  "value": "https://pay.banzami.com/pay/slug_exemplo"
}`,
    errors: [
      { code: '404 NOT_FOUND', note: { pt: 'a sessão não existe ou pertence a outro projeto', en: 'the session does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-pl-create',
    method: 'POST',
    path: '/v1/payment-links',
    tone: 'ok',
    desc: {
      pt: 'Cria um link de pagamento reutilizável em pay.banzami.com, para partilhar sem criar uma sessão por cliente. O destinatário vem da configuração financeira do projeto.',
      en: 'Creates a reusable Payment Link on pay.banzami.com, to share without creating a session per customer. The payee comes from the project’s Financial Setup.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
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
      { code: '400 MISSING_FIELD / INVALID_AMOUNT / INVALID_EXPIRY', note: { pt: 'falta currency, o montante não é positivo ou expires_at não está no futuro', en: 'currency is missing, the amount is not positive, or expires_at is not in the future' } },
      { code: '400 PAYEE_NOT_ALLOWED', note: { pt: 'o corpo indica merchant_id ou wallet_id; o destinatário vem da configuração financeira', en: 'the body names merchant_id or wallet_id; the payee comes from Financial Setup' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_links:write, ou projeto sem configuração financeira concluída', en: 'key without payment_links:write, or project without completed Financial Setup' } },
    ],
    idem: {
      pt: 'Suporta Idempotency-Key como qualquer operação de escrita.',
      en: 'Supports Idempotency-Key like any write operation.',
    },
  },
  {
    id: 'ref-wacc-create',
    method: 'POST',
    path: '/v1/wallet-accounts',
    tone: 'ok',
    desc: {
      pt: 'Abre uma conta segregada no Business do projeto, para separar valores por campanha, loja ou evento.',
      en: 'Opens a segregated account in the project’s Business, to keep funds apart per campaign, store or event.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/wallet-accounts \\
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
      { code: '400 MISSING_FIELD / INVALID_BODY', note: { pt: 'falta purpose, ou o JSON é inválido', en: 'purpose is missing, or the JSON is invalid' } },
      { code: '400 PAYEE_NOT_ALLOWED', note: { pt: 'o pedido indica wallet_id; a carteira vem da configuração financeira', en: 'the request names wallet_id; the wallet comes from Financial Setup' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem wallet_accounts:create, ou projeto sem configuração financeira concluída', en: 'key without wallet_accounts:create, or project without completed Financial Setup' } },
      { code: '422 PRIMARY_NOT_CREATABLE', note: { pt: 'purpose PRIMARY não pode ser criada: a conta principal já existe', en: 'purpose PRIMARY cannot be created: the main account already exists' } },
    ],
  },
  {
    id: 'ref-wacc-list',
    method: 'GET',
    path: '/v1/wallet-accounts',
    tone: 'ok',
    desc: {
      pt: 'Lista as contas do Business do projeto, com o saldo de cada uma.',
      en: 'Lists the accounts of the project’s Business, with the balance of each.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/wallet-accounts \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "data": [
    {
      "id": "wacc_exemplo",
      "wallet_id": "wlt_exemplo",
      "purpose": "CAMPAIGN",
      "reference_type": "CAMPANHA",
      "reference_id": "campanha_123",
      "label": "Campanha 123",
      "status": "ACTIVE",
      "available_balance_minor": 250000,
      "currency": "AOA"
    }
  ]
}`,
    errors: [
      { code: '400 PAYEE_NOT_ALLOWED', note: { pt: 'o pedido indica wallet_id; a carteira vem da configuração financeira', en: 'the request names wallet_id; the wallet comes from Financial Setup' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem wallet_accounts:read, ou projeto sem configuração financeira concluída', en: 'key without wallet_accounts:read, or project without completed Financial Setup' } },
    ],
  },
  {
    id: 'ref-wacc-get',
    method: 'GET',
    path: '/v1/wallet-accounts/{id}',
    tone: 'ok',
    desc: {
      pt: 'Devolve uma conta do projeto e o seu saldo. A conta de outro projeto responde 404, tal como uma conta inexistente.',
      en: 'Returns one of the project’s accounts and its balance. Another project’s account returns 404, like one that does not exist.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/wallet-accounts/wacc_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "wacc_exemplo",
  "wallet_id": "wlt_exemplo",
  "purpose": "CAMPAIGN",
  "reference_type": "CAMPANHA",
  "reference_id": "campanha_123",
  "label": "Campanha 123",
  "status": "ACTIVE",
  "available_balance_minor": 250000,
  "currency": "AOA",
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem wallet_accounts:read, ou projeto sem configuração financeira concluída', en: 'key without wallet_accounts:read, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'a conta não existe ou pertence a outro projeto', en: 'the account does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-transfer-create',
    method: 'POST',
    path: '/v1/wallet-account-transfers',
    tone: 'ok',
    desc: {
      pt: 'Move valor entre duas contas do mesmo Business, de forma síncrona e atómica. O total do Business não muda.',
      en: 'Moves value between two accounts of the same Business, synchronously and atomically. The Business total does not change.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/wallet-account-transfers \\
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
      { code: '400 INVALID_DESTINATION', note: { pt: 'a conta de origem e a de destino são a mesma', en: 'the source and destination accounts are the same' } },
      { code: '400 INVALID_AMOUNT', note: { pt: 'amount_minor tem de ser um inteiro positivo', en: 'amount_minor must be a positive integer' } },
      { code: '400 MISSING_FIELD', note: { pt: 'falta idempotency_key ou currency', en: 'idempotency_key or currency is missing' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem transfers:write, ou projeto sem configuração financeira concluída', en: 'key without transfers:write, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'uma das contas não existe ou pertence a outro projeto', en: 'one of the accounts does not exist or belongs to another project' } },
      { code: '409 IDEMPOTENCY_KEY_REUSED', note: { pt: 'a idempotency_key já foi usada com outro pedido', en: 'the idempotency_key was already used with a different request' } },
      { code: '422 INSUFFICIENT_FUNDS', note: { pt: 'a conta de origem não tem saldo suficiente; nada é movido', en: 'the source account does not hold enough; nothing moves' } },
      { code: '422 ACCOUNTS_NOT_SAME_WALLET / CURRENCY_MISMATCH', note: { pt: 'as contas não pertencem ao mesmo Business ou não têm a mesma moeda', en: 'the accounts do not belong to the same Business, or do not share a currency' } },
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
      pt: 'Devolve ao pagador a totalidade ou parte de um pagamento confirmado. O valor é debitado da conta que recebeu o pagamento.',
      en: 'Returns all or part of a confirmed payment to the payer. The amount is debited from the account that received the payment.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
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
  "status": "SUCCEEDED",
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '400 MISSING_FIELD / INVALID_AMOUNT / INVALID_CURRENCY / INVALID_SOURCE_TYPE', note: { pt: 'falta um campo obrigatório, ou o montante, a moeda ou source_type é inválido', en: 'a required field is missing, or the amount, currency or source_type is invalid' } },
      { code: '403 INSUFFICIENT_SCOPE', note: { pt: 'chave sem refunds:write', en: 'key without refunds:write' } },
      { code: '409 IDEMPOTENCY_KEY_CONFLICT', note: { pt: 'a idempotency_key já foi usada neste pagamento com outro montante ou moeda', en: 'the idempotency_key was already used on this payment with a different amount or currency' } },
      { code: '422 REFUND_EXCEEDS_CAPTURED', note: { pt: 'o montante excede o que falta reembolsar', en: 'the amount exceeds what is left to refund' } },
      { code: '422 REFUND_NOT_FUNDABLE', note: { pt: 'a conta que recebeu o pagamento não tem saldo suficiente', en: 'the account that received the payment does not hold enough' } },
      { code: '422 CURRENCY_MISMATCH / INVALID_PAYMENT_STATUS', note: { pt: 'a moeda não é a do pagamento, ou o pagamento não pode ser reembolsado', en: 'the currency is not the payment’s, or the payment cannot be refunded' } },
      { code: '404 NOT_FOUND', note: { pt: 'o pagamento não existe ou pertence a outro projeto', en: 'the payment does not exist or belongs to another project' } },
    ],
    idem: {
      pt: 'Repetir o mesmo idempotency_key devolve o reembolso original e não devolve valor duas vezes.',
      en: 'Replaying the same idempotency_key returns the original refund and does not refund twice.',
    },
  },
  {
    id: 'ref-webhook-register',
    method: 'POST',
    path: '/v1/webhooks/endpoints',
    tone: 'ok',
    desc: {
      pt: 'Regista o endpoint HTTPS que recebe os eventos do projeto. O segredo de assinatura é devolvido nesta resposta e em mais nenhuma.',
      en: 'Registers the HTTPS endpoint that receives the project’s events. The signing secret is returned in this response and never again.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/webhooks/endpoints \\
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
      { code: '400 INVALID_WEBHOOK_URL', note: { pt: 'o URL não é HTTPS público', en: 'the URL is not public HTTPS' } },
      { code: '400 UNSUPPORTED_EVENT', note: { pt: 'um dos eventos não existe no catálogo', en: 'one of the events is not in the catalogue' } },
      { code: '400 MISSING_FIELD', note: { pt: 'falta url ou events', en: 'url or events is missing' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed Financial Setup' } },
    ],
  },

  {
    id: 'ref-settlement-create',
    method: 'POST',
    path: '/v1/application-settlements',
    tone: 'ok',
    desc: {
      pt: 'Liquida todo o saldo de uma conta segregada para um beneficiário. O Banzami calcula a taxa pelo perfil de preço do Business; o pedido não indica montante nem taxa.',
      en: 'Settles the whole balance of a segregated account to a beneficiary. Banzami calculates the fee from the Business’s pricing profile; the request names no amount and no fee.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/application-settlements \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_account_id": "wacc_exemplo",
    "beneficiary_banza_name": "@beneficiario_exemplo",
    "fee_destination_banza_name": "@meu-negocio",
    "reference_id": "campanha_123",
    "idempotency_key": "idem_liquidacao_123"
  }'`,
    response: `{
  "id": "apstl_exemplo",
  "owner_ref": "campanha_123",
  "status": "COMPLETED",
  "gross_amount_minor": 1000000,
  "application_fee_minor": 0,
  "net_amount_minor": 1000000,
  "currency": "AOA",
  "environment": "SANDBOX",
  "pricing": { "profile": "sandbox-default", "applied_bps": 0, "flat_minor": 0 },
  "created_at": "2026-07-11T11:45:00Z",
  "completed_at": "2026-07-11T11:45:01Z",
  "failure_reason": null
}`,
    errors: [
      { code: '400 MISSING_FIELD / INVALID_BODY', note: { pt: 'falta idempotency_key, source_account_id ou beneficiary_banza_name, ou o JSON é inválido', en: 'idempotency_key, source_account_id or beneficiary_banza_name is missing, or the JSON is invalid' } },
      { code: '400 PRICING_FIELD_NOT_ACCEPTED', note: { pt: 'o pedido indica uma taxa, um perfil de preço ou uma categoria; o preço é definido pelo Banzami', en: 'the request names a rate, pricing profile or category; pricing is set by Banzami' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem application_settlements:write, ou projeto sem configuração financeira concluída', en: 'key without application_settlements:write, or project without completed Financial Setup' } },
            { code: '403 FEE_DESTINATION_NOT_OWNED', note: { pt: 'o destino da taxa não pertence ao seu Business', en: 'the fee destination does not belong to your Business' } },
      { code: '404 NOT_FOUND', note: { pt: 'a conta de origem não existe ou pertence a outro projeto', en: 'the source account does not exist or belongs to another project' } },
      { code: '409 PRICING_NOT_CONFIGURED', note: { pt: 'o Business ainda não tem perfil de preço atribuído pelo Banzami', en: 'the Business has no pricing profile assigned by Banzami yet' } },
      { code: '409 IDEMPOTENCY_CONFLICT', note: { pt: 'a idempotency_key já foi usada com outra conta de origem ou outro beneficiário', en: 'the idempotency_key was already used with another source account or beneficiary' } },
      { code: '409 PRICING_CONFIGURATION_ERROR', note: { pt: 'a configuração de preço é ambígua; contacte o suporte com o request_id', en: 'the pricing configuration is ambiguous; contact support with the request_id' } },
      { code: '422 INSUFFICIENT_FUNDS / FEE_EXCEEDS_GROSS', note: { pt: 'o saldo mudou durante o pedido, ou a taxa excederia o montante bruto', en: 'the balance changed during the request, or the fee would exceed the gross' } },
      { code: '422 ACCOUNT_FROZEN', note: { pt: 'a conta está bloqueada; contacte o suporte com o request_id', en: 'the account is frozen; contact support with the request_id' } },
      { code: '422 SOURCE_NOT_SEGREGATED', note: { pt: 'a origem é a conta principal do Business, que não pode ser liquidada', en: 'the source is the Business’s main account, which cannot be settled' } },
      { code: '422 NOTHING_TO_SETTLE', note: { pt: 'a conta de origem não tem saldo disponível', en: 'the source account has no available balance' } },
      { code: '422 BENEFICIARY_NOT_FOUND', note: { pt: 'o @banza não tem carteira ativa nesta moeda', en: 'the @banza has no active wallet in this currency' } },
      { code: '422 FEE_DESTINATION_*', note: { pt: 'falta o destino da taxa, ou não é elegível (REQUIRED, NOT_FOUND, NOT_ACTIVE, KYB_NOT_APPROVED, WALLET_UNAVAILABLE, TYPE_NOT_ALLOWED, NOT_BUSINESS_ACCOUNT)', en: 'the fee destination is missing or not eligible (REQUIRED, NOT_FOUND, NOT_ACTIVE, KYB_NOT_APPROVED, WALLET_UNAVAILABLE, TYPE_NOT_ALLOWED, NOT_BUSINESS_ACCOUNT)' } },
      { code: '422 SETTLEMENT_NOT_COMPLETED', note: { pt: 'a liquidação foi criada mas não concluída; repita com a mesma idempotency_key para a retomar', en: 'the settlement was created but did not complete; retry with the same idempotency_key to resume it' } },
      { code: '503 UPSTREAM_ERROR / SERVICE_UNAVAILABLE', note: { pt: 'falha temporária; repita com a mesma idempotency_key', en: 'temporary failure; retry with the same idempotency_key' } },
    ],
    idem: {
      pt: 'Repetir a mesma idempotency_key para a mesma origem e o mesmo beneficiário devolve (200) a liquidação já feita, sem liquidar duas vezes.',
      en: 'Replaying the same idempotency_key for the same source and beneficiary returns (200) the settlement already made, without settling twice.',
    },
  },
  {
    id: 'ref-pl-list',
    method: 'GET',
    path: '/v1/payment-links',
    tone: 'ok',
    desc: {
      pt: 'Lista os links de pagamento do projeto, do mais recente para o mais antigo, com paginação por cursor.',
      en: 'Lists the project’s Payment Links, newest first, with cursor pagination.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl "https://sandbox-api.banzami.com/v1/payment-links?limit=20" \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "data": [
    {
      "slug": "slug_exemplo",
      "amount_minor": 25000,
      "currency": "AOA",
      "description": "Pedido #123",
      "status": "ACTIVE"
    }
  ],
  "next_cursor": "6f1c2d3e-0000-4000-8000-000000000000"
}`,
    errors: [
      { code: '400 INVALID_PARAM', note: { pt: 'limit fora de 1–100, ou um cursor que não é um next_cursor', en: 'limit outside 1–100, or a cursor that is not a next_cursor' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_links:read, ou projeto sem configuração financeira concluída', en: 'key without payment_links:read, or project without completed Financial Setup' } },
    ],
  },
  {
    id: 'ref-pl-get',
    method: 'GET',
    path: '/v1/payment-links/{id}',
    tone: 'ok',
    desc: {
      pt: 'Devolve um link de pagamento pelo id devolvido na criação (o slug responde 404). Para reembolsar, use o refund_source do evento payment_link.paid.',
      en: 'Returns a Payment Link by the id returned at creation (a slug returns 404). To refund, use the refund_source from the payment_link.paid event.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/payment-links/plink_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "plink_exemplo",
  "slug": "slug_exemplo",
  "wallet_id": "wlt_exemplo",
  "wallet_account_id": "wacc_exemplo",
  "amount_minor": 25000,
  "currency": "AOA",
  "description": "Pedido #123",
  "status": "ACTIVE",
  "expires_at": null,
  "paid_at": null,
  "created_at": "2026-07-11T11:45:00Z",
  "updated_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '401 UNAUTHORIZED', note: { pt: 'a chave falta, é inválida ou foi revogada', en: 'the key is missing, invalid or revoked' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_links:read, ou projeto sem configuração financeira concluída', en: 'key without payment_links:read, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'o link não existe, o id é inválido ou o link pertence a outro projeto', en: 'the link does not exist, the id is invalid, or the link belongs to another project' } },
    ],
  },
  {
    id: 'ref-pl-cancel',
    method: 'DELETE',
    path: '/v1/payment-links/{id}',
    tone: 'ok',
    desc: {
      pt: 'Cancela um link ACTIVE, que deixa de poder ser pago. É a forma de fechar um link por pagar.',
      en: 'Cancels an ACTIVE link so it can no longer be paid. This is how you close an unpaid link.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X DELETE https://sandbox-api.banzami.com/v1/payment-links/plink_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "plink_exemplo",
  "slug": "slug_exemplo",
  "wallet_id": "wlt_exemplo",
  "wallet_account_id": "wacc_exemplo",
  "amount_minor": 25000,
  "currency": "AOA",
  "description": "Pedido #123",
  "status": "CANCELLED",
  "expires_at": null,
  "paid_at": null,
  "created_at": "2026-07-11T11:45:00Z",
  "updated_at": "2026-07-11T12:10:00Z"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_links:write, ou projeto sem configuração financeira concluída', en: 'key without payment_links:write, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'o link não existe ou pertence a outro projeto', en: 'the link does not exist or belongs to another project' } },
      { code: '422 LINK_NOT_ACTIVE', note: { pt: 'o link já foi pago, expirou ou foi cancelado', en: 'the link was already paid, expired or was cancelled' } },
    ],
    idem: {
      pt: 'Suporta Idempotency-Key como qualquer operação de escrita.',
      en: 'Supports Idempotency-Key like any write operation.',
    },
  },
  {
    id: 'ref-refund-list',
    method: 'GET',
    path: '/v1/refunds',
    tone: 'ok',
    desc: {
      pt: 'Lista os reembolsos do Business do projeto, do mais recente para o mais antigo, com filtro por pagamento.',
      en: 'Lists the refunds of the project’s Business, newest first, with a per-payment filter.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl "https://sandbox-api.banzami.com/v1/refunds?source_id=wpay_exemplo&limit=20" \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "data": [
    {
      "id": "rfnd_exemplo",
      "source_type": "WALLET_PAYMENT",
      "source_id": "wpay_exemplo",
      "amount_minor": 50000,
      "currency": "AOA",
      "status": "SUCCEEDED",
      "reason": null,
      "created_at": "2026-07-11T11:45:00Z"
    }
  ]
}`,
    errors: [
      { code: '400 INVALID_PARAM', note: { pt: 'limit fora de 1–100', en: 'limit outside 1–100' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem refunds:read, ou projeto sem configuração financeira concluída', en: 'key without refunds:read, or project without completed Financial Setup' } },
    ],
  },
  {
    id: 'ref-refund-get',
    method: 'GET',
    path: '/v1/refunds/{id}',
    tone: 'ok',
    desc: {
      pt: 'Devolve um reembolso do Business do projeto. Um reembolso de outro projeto responde 404.',
      en: 'Returns a refund of the project’s Business. Another project’s refund returns 404.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/refunds/rfnd_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "rfnd_exemplo",
  "source_type": "WALLET_PAYMENT",
  "source_id": "wpay_exemplo",
  "amount_minor": 50000,
  "currency": "AOA",
  "status": "SUCCEEDED",
  "reason": null,
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem refunds:read, ou projeto sem configuração financeira concluída', en: 'key without refunds:read, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'o reembolso não existe ou pertence a outro projeto', en: 'the refund does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-handle-resolve',
    method: 'GET',
    path: '/v1/consumers/handle/{handle}',
    tone: 'ok',
    desc: {
      pt: 'Confirma que um @banza de consumidor existe antes de o indicar como beneficiário. Devolve apenas o handle e o nome apresentado; um @banza de negócio responde 404.',
      en: 'Confirms a consumer @banza exists before you name it as a beneficiary. Returns only the handle and display name; a business @banza returns 404.',
    },
    credential: { pt: 'Chave secreta do projeto · não requer configuração financeira', en: 'Project secret key · no Financial Setup required' },
    curl: `curl https://sandbox-api.banzami.com/v1/consumers/handle/cliente_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "handle": "cliente_exemplo",
  "display_name": "Cliente Exemplo"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE', note: { pt: 'chave sem customers:read', en: 'key without customers:read' } },
      { code: '404 NOT_FOUND', note: { pt: 'nenhum consumidor tem este @banza', en: 'no consumer holds this @banza' } },
    ],
  },
  {
    id: 'ref-webhook-list',
    method: 'GET',
    path: '/v1/webhooks/endpoints',
    tone: 'ok',
    desc: {
      pt: 'Lista os endpoints do projeto, incluindo os desativados. O segredo nunca é incluído.',
      en: 'Lists the project’s endpoints, including disabled ones. The secret is never included.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/webhooks/endpoints \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "data": [
    {
      "id": "whep_exemplo",
      "url": "https://o-seu-servidor.exemplo/webhooks/banzami",
      "events": ["payment_session.paid"],
      "active": true,
      "created_at": "2026-07-11T11:45:00Z"
    }
  ]
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed Financial Setup' } },
    ],
  },
  {
    id: 'ref-webhook-get',
    method: 'GET',
    path: '/v1/webhooks/endpoints/{id}',
    tone: 'ok',
    desc: {
      pt: 'Devolve um endpoint do projeto, sem o segredo.',
      en: 'Returns one of the project’s endpoints, without its secret.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/webhooks/endpoints/whep_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "whep_exemplo",
  "url": "https://o-seu-servidor.exemplo/webhooks/banzami",
  "events": ["payment_session.paid"],
  "active": true,
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'o endpoint não existe ou pertence a outro projeto', en: 'the endpoint does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-webhook-deactivate',
    method: 'DELETE',
    path: '/v1/webhooks/endpoints/{id}',
    tone: 'ok',
    desc: {
      pt: 'Desativa um endpoint: deixa de receber eventos e mantém-se listado com active: false. Responde 204, também se já estava desativado.',
      en: 'Disables an endpoint: it stops receiving events and stays listed with active: false. Returns 204, also when it was already disabled.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X DELETE https://sandbox-api.banzami.com/v1/webhooks/endpoints/whep_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'o endpoint não existe ou pertence a outro projeto', en: 'the endpoint does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-webhook-health',
    method: 'GET',
    path: '/v1/webhooks/endpoints/{id}/health',
    tone: 'ok',
    desc: {
      pt: 'Resume as entregas das últimas 24 horas ao endpoint: total, sucessos, falhas e taxa de sucesso.',
      en: 'Summarises the endpoint’s deliveries over the last 24 hours: total, successes, failures and success rate.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/webhooks/endpoints/whep_exemplo/health \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "endpoint_id": "whep_exemplo",
  "total_last_24h": 12,
  "success_last_24h": 11,
  "failed_last_24h": 1,
  "success_rate_pct": 91.66666666666666,
  "last_delivered_at": "2026-07-11T11:50:01Z",
  "last_failed_at": "2026-07-11T09:12:00Z"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'o endpoint não existe ou pertence a outro projeto', en: 'the endpoint does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-webhook-rotate',
    method: 'POST',
    path: '/v1/webhooks/endpoints/{id}/rotate-secret',
    tone: 'ok',
    desc: {
      pt: 'Emite um segredo de assinatura novo e devolve-o apenas nesta resposta. A troca é imediata: prepare o servidor antes de rodar.',
      en: 'Issues a new signing secret and returns it only in this response. The switch is immediate: prepare your server before rotating.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/webhooks/endpoints/whep_exemplo/rotate-secret \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "whep_exemplo",
  "url": "https://o-seu-servidor.exemplo/webhooks/banzami",
  "events": ["payment_session.paid"],
  "active": true,
  "secret": "<devolvido apenas nesta resposta>",
  "created_at": "2026-07-11T11:45:00Z"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'o endpoint não existe ou pertence a outro projeto', en: 'the endpoint does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-webhook-events',
    method: 'GET',
    path: '/v1/webhooks/events',
    tone: 'ok',
    desc: {
      pt: 'Lista os eventos emitidos para o projeto, do mais recente para o mais antigo, tenham ou não sido entregues.',
      en: 'Lists the events emitted for the project, newest first, whether or not they were delivered.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl "https://sandbox-api.banzami.com/v1/webhooks/events?limit=20" \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "data": [
    {
      "id": "whevt_exemplo",
      "event_type": "payment_session.paid",
      "payload": {
        "id": "whevt_exemplo",
        "type": "payment_session.paid",
        "created_at": "2026-07-11T11:50:00Z",
        "data": { "payment_session_id": "psess_exemplo", "amount_minor": 25000, "interface": "PAYMENT_LINK", "reference_id": "pedido_123" }
      },
      "created_at": "2026-07-11T11:50:00Z"
    }
  ]
}`,
    errors: [
      { code: '400 INVALID_PARAM', note: { pt: 'limit fora de 1–100', en: 'limit outside 1–100' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed Financial Setup' } },
    ],
  },
  {
    id: 'ref-webhook-deliveries',
    method: 'GET',
    path: '/v1/webhooks/events/{id}/deliveries',
    tone: 'ok',
    desc: {
      pt: 'Devolve o histórico de entrega de um evento: uma entrega por endpoint, com cada tentativa, o código HTTP e a resposta do seu servidor.',
      en: 'Returns an event’s delivery history: one delivery per endpoint, with each attempt, the HTTP status and your server’s response.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/webhooks/events/whevt_exemplo/deliveries \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "data": [
    {
      "id": "whdel_exemplo",
      "event_id": "whevt_exemplo",
      "endpoint_id": "whep_exemplo",
      "attempt_number": 1,
      "status": "SUCCESS",
      "status_code": 200,
      "response_body": "ok",
      "delivered_at": "2026-07-11T11:50:01Z",
      "created_at": "2026-07-11T11:50:00Z",
      "attempts": [
        { "attempt_number": 1, "outcome": "SUCCESS", "status_code": 200, "error_class": null,
          "duration_ms": 184, "attempted_at": "2026-07-11T11:50:01Z" }
      ]
    }
  ]
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'o evento não existe ou pertence a outro projeto', en: 'the event does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-webhook-replay',
    method: 'POST',
    path: '/v1/webhooks/deliveries/{id}/replay',
    tone: 'ok',
    desc: {
      pt: 'Volta a pôr em fila uma entrega que falhou, com o mesmo id. Uma entrega que já teve sucesso responde 409 e não é reenviada — exceto a de um evento de teste webhook.test, que não move nada e pode ser reenviada sempre.',
      en: 'Queues a failed delivery again, with the same id. A delivery that already succeeded returns 409 and is not sent again — except one of a webhook.test event, which moves nothing and can always be replayed.',
    },
    credential: { pt: 'Chave secreta do projeto · configuração financeira concluída', en: 'Project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/webhooks/deliveries/whdel_exemplo/replay \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "whdel_exemplo",
  "event_id": "whevt_exemplo",
  "endpoint_id": "whep_exemplo",
  "attempt_number": 5,
  "status": "PENDING",
  "created_at": "2026-07-11T12:30:00Z",
  "attempts": null
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed Financial Setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'a entrega não existe ou pertence a outro projeto', en: 'the delivery does not exist or belongs to another project' } },
      { code: '409 DELIVERY_ALREADY_SUCCEEDED', note: { pt: 'a entrega já teve sucesso; só as entregas falhadas podem ser reenviadas', en: 'the delivery already succeeded; only failed deliveries can be replayed' } },
    ],
  },
  {
    id: 'ref-public-proof',
    method: 'GET',
    path: '/v1/public/proofs/{ref}',
    tone: 'ok',
    desc: {
      pt: 'Verifica um comprovativo pela referência BZM-…, sem autenticação — a mesma verificação de banzami.com/r/{ref}. A referência é exata, sem normalização; um 503 não indica que o comprovativo é falso.',
      en: 'Verifies a receipt by its BZM-… reference, with no authentication — the same check as banzami.com/r/{ref}. The reference is exact, with no normalisation; a 503 does not mean the receipt is forged.',
    },
    credential: { pt: 'Nenhuma — rota pública, com limite por IP', en: 'None — a public route, rate-limited per IP' },
    curl: `curl https://sandbox-api.banzami.com/v1/public/proofs/BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`,
    response: `{
  "exists": true,
  "status": "CONFIRMED",
  "amount": 250000,
  "currency": "AOA",
  "payee_handle": "@loja-exemplo",
  "description": "Pedido #123"
}`,
    errors: [
      { code: '429 RATE_LIMITED', note: { pt: 'demasiadas verificações a partir do mesmo IP; aguarde os segundos de Retry-After', en: 'too many checks from the same IP; wait the Retry-After seconds' } },
    ],
  },
  {
    id: 'ref-webhook-test',
    method: 'POST',
    path: '/v1/webhooks/endpoints/{id}/test',
    tone: 'ok',
    desc: {
      pt: 'Só na Sandbox. Envia a este endpoint um evento de teste webhook.test, assinado como qualquer outro, para verificar o seu recetor e a verificação da assinatura. Vem marcado synthetic: true, não descreve nenhum pagamento e não move nada; a entrega pode ser reenviada mesmo depois de ter sucesso.',
      en: 'Sandbox only. Sends a webhook.test event to this endpoint, signed like any other, to check your receiver and your signature verification. It is marked synthetic: true, describes no payment and moves nothing; its delivery can be replayed even after it succeeds.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto · configuração financeira concluída', en: 'Sandbox project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/webhooks/endpoints/whep_exemplo/test \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "event_id": "whevt_exemplo",
  "delivery_id": "whdel_exemplo",
  "type": "webhook.test",
  "synthetic": true,
  "status": "PENDING"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed Financial Setup' } },
      { code: '403 SANDBOX_ONLY', note: { pt: 'a chave não é Sandbox: os eventos de teste só existem na Sandbox', en: 'the key is not a Sandbox key: test events exist only in the Sandbox' } },
      { code: '404 NOT_FOUND', note: { pt: 'o endpoint não existe ou pertence a outro projeto', en: 'the endpoint does not exist or belongs to another project' } },
      { code: '409 ENDPOINT_DISABLED', note: { pt: 'o endpoint está desativado; reative-o primeiro', en: 'the endpoint is disabled; enable it first' } },
    ],
  },
  {
    id: 'ref-realtime-status',
    method: 'GET',
    path: '/v1/realtime/payment-sessions/{id}',
    tone: 'ok',
    desc: {
      pt: 'Para uma página no browser: o estado de uma sessão de pagamento em tempo real, por Server-Sent Events — um snapshot, um evento status em cada mudança, um heartbeat a cada 5 s, e o fecho num estado final. Com Accept: application/json, uma leitura única. Abre-se com o token de estado da sessão, nunca com uma chave. Serve o ecrã; não é prova de pagamento.',
      en: 'For a browser page: a Payment Session’s status in real time, over Server-Sent Events — a snapshot, a status event on each change, a heartbeat every 5 s, and a close on a terminal status. With Accept: application/json, a single read. Opened with the session’s status token, never with a key. It serves the screen; it is not proof of payment.',
    },
    credential: { pt: 'Token de estado bzst_ da sessão, no cabeçalho Authorization — nunca no endereço. Sem chave de API.', en: 'The session’s bzst_ status token, in the Authorization header — never in the URL. No API key.' },
    curl: `curl -N https://sandbox-api.banzami.com/v1/realtime/payment-sessions/payment_session_exemplo \\
  -H "Authorization: Bearer bzst_XXXXXXXXXXXXXXXX" \\
  -H "Accept: text/event-stream"`,
    response: `retry: 3000

id: ACTIVE-1
event: snapshot
data: {"session_id":"payment_session_exemplo","status":"ACTIVE","amount_minor":250000,"currency":"AOA","expires_at":"2026-09-14T11:00:00Z","terminal":false,"observed_at":"2026-09-14T10:04:00Z"}

: heartbeat

id: PAID-2
event: status
data: {"session_id":"payment_session_exemplo","status":"PAID","amount_minor":250000,"currency":"AOA","expires_at":"2026-09-14T11:00:00Z","terminal":true,"observed_at":"2026-09-14T10:05:01Z"}`,
    errors: [
      { code: '400 REALTIME_TOKEN_IN_URL', note: { pt: 'o token foi enviado no endereço; é recusado mesmo que válido', en: 'the token was sent in the URL; it is refused even when valid' } },
      { code: '401 REALTIME_TOKEN_REQUIRED / REALTIME_TOKEN_INVALID / REALTIME_TOKEN_EXPIRED', note: { pt: 'leia a sessão no seu backend para um token novo', en: 'read the session on your backend for a new token' } },
      { code: '403 REALTIME_TOKEN_WRONG_RESOURCE', note: { pt: 'o token é de outra sessão', en: 'the token belongs to another session' } },
      { code: '429 REALTIME_STREAM_LIMIT / RATE_LIMITED', note: { pt: 'no máximo 3 ligações por sessão e 20 por IP', en: 'at most 3 streams per session and 20 per IP' } },
      { code: '503 REALTIME_UNAVAILABLE', note: { pt: 'use GET no seu backend, a um intervalo moderado', en: 'use GET on your backend at a modest interval' } },
    ],
  },
  {
    id: 'ref-sandbox-scenarios',
    method: 'GET',
    path: '/v1/sandbox/scenarios',
    tone: 'ok',
    desc: {
      pt: 'Os cenários determinísticos da Sandbox: como produzir cada resultado, o que volta e que evento se segue. Cada resultado vem de uma operação real, exceto os resultados de rede externa, pedidos com simulate. Não há montantes mágicos.',
      en: 'The deterministic Sandbox scenarios: how to produce each outcome, what comes back and which event follows. Every outcome comes from a real operation, except external-rail outcomes, requested with simulate. There are no magic amounts.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto', en: 'Sandbox project secret key' },
    curl: `curl https://sandbox-api.banzami.com/v1/sandbox/scenarios \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "version": 1,
  "note": { "pt": "…", "en": "…" },
  "scenarios": [
    {
      "id": "PAYMENT_DECLINED",
      "group": "payments",
      "simulated": true,
      "goal": { "pt": "Uma recusa do rail externo", "en": "An external-rail decline" },
      "trigger": { "pt": "… com simulate DECLINED", "en": "… with simulate DECLINED" },
      "result": { "pt": "402 PAYMENT_DECLINED, simulated: true; nada se move", "en": "402 PAYMENT_DECLINED, simulated: true; nothing moves" },
      "event": null
    }
  ]
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / SANDBOX_ONLY', note: { pt: 'chave sem sandbox:read, ou chave que não é Sandbox', en: 'key without sandbox:read, or a key that is not a Sandbox key' } },
    ],
  },
  {
    id: 'ref-sandbox-external-rail-get',
    method: 'GET',
    path: '/v1/sandbox/external-rail',
    tone: 'ok',
    desc: {
      pt: 'O rail externo simulado que o seu projeto usa para o negócio Sandbox: AVAILABLE ou UNAVAILABLE. O valor que já está dentro do Banzami move-se pelo Core e pelo ledger sem rail externo; um rail externo só é atravessado quando o valor entra ou sai da rede.',
      en: 'The simulated external rail your Project uses for its Sandbox Business: AVAILABLE or UNAVAILABLE. Value already inside Banzami moves through Core and the ledger without an external rail; an external rail is crossed only when value enters or leaves the network.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto · configuração financeira concluída', en: 'Sandbox project secret key · Financial Setup complete' },
    curl: `curl https://sandbox-api.banzami.com/v1/sandbox/external-rail \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "state": "AVAILABLE",
  "simulated": true
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / SANDBOX_ONLY / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem sandbox:read, chave que não é Sandbox, ou projeto sem configuração financeira', en: 'key without sandbox:read, a key that is not a Sandbox key, or a project with no Financial Setup' } },
    ],
  },
  {
    id: 'ref-sandbox-external-rail-set',
    method: 'PUT',
    path: '/v1/sandbox/external-rail',
    tone: 'ok',
    desc: {
      pt: 'Coloca o rail externo simulado do seu projeto em UNAVAILABLE ou repõe-no. Com UNAVAILABLE, o pagamento de um pagador de teste a partir da carteira continua a concluir-se; um pagamento com simulate, e um pagamento iniciado na página alojada de uma sessão ou link que este projeto criou, respondem 503 PROVIDER_UNAVAILABLE e nada se move. Afeta só este projeto: outro projeto ligado ao mesmo negócio mantém o seu próprio rail.',
      en: 'Takes your Project’s simulated external rail down, or brings it back. With UNAVAILABLE, a test payer’s wallet payment still completes; a payment with simulate, and a payment started on the hosted page of a session or link this Project created, return 503 PROVIDER_UNAVAILABLE and nothing moves. It affects only this Project: another Project connected to the same Business keeps its own rail.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto · configuração financeira concluída', en: 'Sandbox project secret key · Financial Setup complete' },
    curl: `curl -X PUT https://sandbox-api.banzami.com/v1/sandbox/external-rail \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{"state":"UNAVAILABLE"}'`,
    response: `{
  "state": "UNAVAILABLE",
  "simulated": true
}`,
    errors: [
      { code: '400 INVALID_BODY / INVALID_PARAM', note: { pt: 'state não é AVAILABLE nem UNAVAILABLE', en: 'state is neither AVAILABLE nor UNAVAILABLE' } },
      { code: '403 INSUFFICIENT_SCOPE / SANDBOX_ONLY / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem sandbox:write, chave que não é Sandbox, ou projeto sem configuração financeira', en: 'key without sandbox:write, a key that is not a Sandbox key, or a project with no Financial Setup' } },
    ],
  },
  {
    id: 'ref-test-payer-create',
    method: 'POST',
    path: '/v1/sandbox/test-payers',
    tone: 'ok',
    desc: {
      pt: 'Cria um pagador de teste do seu projeto: um consumidor Sandbox com carteira e saldo fictício. Age só pela API do projeto — não entra em nenhuma app. No máximo 10 pagadores ativos por projeto.',
      en: 'Creates a test payer owned by your Project: a Sandbox consumer with a wallet and a fictitious balance. It acts only through the Project’s API — it signs in to no app. At most 10 active payers per Project.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto', en: 'Sandbox project secret key' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/sandbox/test-payers \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{"label":"Maria (teste)","initial_balance_minor":1000000}'`,
    response: `{
  "id": "tp_exemplo",
  "handle": "tpexemplo01",
  "label": "Maria (teste)",
  "status": "ACTIVE",
  "balance_minor": 1000000,
  "currency": "AOA",
  "environment": "SANDBOX",
  "created_at": "2026-09-14T10:00:00Z",
  "retired_at": null
}`,
    errors: [
      { code: '400 INVALID_BODY / INVALID_PARAM', note: { pt: 'um campo desconhecido, label com mais de 60 caracteres, ou saldo fora de 0–1 000 000', en: 'an unknown field, a label over 60 characters, or a balance outside 0–1,000,000' } },
      { code: '403 INSUFFICIENT_SCOPE / SANDBOX_ONLY', note: { pt: 'chave sem sandbox:write, ou chave que não é Sandbox', en: 'key without sandbox:write, or a key that is not a Sandbox key' } },
      { code: '429 SANDBOX_QUOTA_EXCEEDED', note: { pt: 'já há 10 pagadores ativos; retire um', en: 'there are already 10 active payers; retire one' } },
    ],
  },
  {
    id: 'ref-test-payer-list',
    method: 'GET',
    path: '/v1/sandbox/test-payers',
    tone: 'ok',
    desc: {
      pt: 'Lista os pagadores de teste do projeto, com o saldo fictício atual.',
      en: 'Lists the Project’s test payers, with their current fictitious balance.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto', en: 'Sandbox project secret key' },
    curl: `curl https://sandbox-api.banzami.com/v1/sandbox/test-payers \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "data": [
    { "id": "tp_exemplo", "handle": "tpexemplo01", "label": "Maria (teste)", "status": "ACTIVE",
      "balance_minor": 750000, "currency": "AOA", "environment": "SANDBOX",
      "created_at": "2026-09-14T10:00:00Z", "retired_at": null }
  ]
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / SANDBOX_ONLY', note: { pt: 'chave sem sandbox:read, ou chave que não é Sandbox', en: 'key without sandbox:read, or a key that is not a Sandbox key' } },
    ],
  },
  {
    id: 'ref-test-payer-get',
    method: 'GET',
    path: '/v1/sandbox/test-payers/{id}',
    tone: 'ok',
    desc: {
      pt: 'Devolve um pagador de teste do projeto. O de outro projeto responde 404.',
      en: 'Returns one of the Project’s test payers. Another Project’s returns 404.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto', en: 'Sandbox project secret key' },
    curl: `curl https://sandbox-api.banzami.com/v1/sandbox/test-payers/tp_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "tp_exemplo",
  "handle": "tpexemplo01",
  "label": "Maria (teste)",
  "status": "ACTIVE",
  "balance_minor": 750000,
  "currency": "AOA",
  "environment": "SANDBOX",
  "created_at": "2026-09-14T10:00:00Z",
  "retired_at": null
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / SANDBOX_ONLY', note: { pt: 'chave sem sandbox:read, ou chave que não é Sandbox', en: 'key without sandbox:read, or a key that is not a Sandbox key' } },
      { code: '404 NOT_FOUND', note: { pt: 'o pagador não existe ou pertence a outro projeto', en: 'the payer does not exist or belongs to another project' } },
    ],
  },
  {
    id: 'ref-test-payer-fund',
    method: 'POST',
    path: '/v1/sandbox/test-payers/{id}/fund',
    tone: 'ok',
    desc: {
      pt: 'Carrega valor fictício num pagador de teste, pelo ledger — nunca editando um saldo. O cabeçalho Idempotency-Key é obrigatório e identifica o carregamento. Limites: 2 500 000 por carregamento, saldo de 5 000 000, e 20 carregamentos e 10 000 000 por projeto em 24 h.',
      en: 'Adds fictitious value to a test payer, through the ledger — never by editing a balance. The Idempotency-Key header is required and identifies the top-up. Limits: 2,500,000 per top-up, a 5,000,000 balance, and 20 top-ups and 10,000,000 per Project in 24 h.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto', en: 'Sandbox project secret key' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/sandbox/test-payers/tp_exemplo/fund \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Idempotency-Key: carregamento_001" \\
  -H "Content-Type: application/json" \\
  -d '{"amount_minor":500000}'`,
    response: `{
  "id": "tp_exemplo",
  "handle": "tpexemplo01",
  "label": "Maria (teste)",
  "status": "ACTIVE",
  "balance_minor": 1500000,
  "currency": "AOA",
  "environment": "SANDBOX",
  "created_at": "2026-09-14T10:00:00Z",
  "retired_at": null
}`,
    errors: [
      { code: '400 IDEMPOTENCY_KEY_REQUIRED / INVALID_PARAM', note: { pt: 'sem Idempotency-Key, ou montante fora de 1–2 500 000', en: 'no Idempotency-Key, or an amount outside 1–2,500,000' } },
      { code: '409 IDEMPOTENCY_KEY_REUSED', note: { pt: 'a chave já foi usada para outro carregamento', en: 'the key was already used for another top-up' } },
      { code: '422 TEST_PAYER_RETIRED / SANDBOX_FUNDING_REFUSED', note: { pt: 'pagador retirado, ou o saldo passaria o limite', en: 'a retired payer, or the balance would pass its limit' } },
      { code: '429 SANDBOX_QUOTA_EXCEEDED', note: { pt: 'limite de 24 h do projeto', en: 'the Project’s 24-hour limit' } },
    ],
  },
  {
    id: 'ref-test-payer-pay',
    method: 'POST',
    path: '/v1/sandbox/test-payers/{id}/payments',
    tone: 'ok',
    desc: {
      pt: 'Paga uma sessão (pelo link ou pelo QR dinâmico) ou um link de pagamento do seu projeto como este pagador, pelo mesmo caminho de um pagador real: a sessão fica PAID, payment_session.paid é emitido e o comprovativo é emitido. Sem simulate é um pagamento a partir da carteira: o valor move-se dentro do Banzami e não depende de nenhum rail externo (rail: WALLET). simulate representa um pagamento que atravessa um rail externo e pede o resultado desse rail (rail: EXTERNAL_SIMULATED); com o rail externo do seu negócio em UNAVAILABLE responde 503 PROVIDER_UNAVAILABLE. TIMEOUT paga e responde 503, e repetir com a mesma Idempotency-Key lê o resultado real.',
      en: 'Pays one of your Project’s sessions (by its link or dynamic QR) or payment links as this payer, through the same path a real payer uses: the session becomes PAID, payment_session.paid is emitted and the receipt is issued. Without simulate it is a wallet payment: value moves inside Banzami and depends on no external rail (rail: WALLET). simulate stands in for a payment that crosses an external rail and requests that rail’s outcome (rail: EXTERNAL_SIMULATED); with your Business’s external rail UNAVAILABLE it returns 503 PROVIDER_UNAVAILABLE. TIMEOUT pays and returns 503, and repeating with the same Idempotency-Key reads the real result.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto · configuração financeira concluída', en: 'Sandbox project secret key · Financial Setup complete' },
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/sandbox/test-payers/tp_exemplo/payments \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Idempotency-Key: pagamento_001" \\
  -H "Content-Type: application/json" \\
  -d '{"payment_session_id":"payment_session_exemplo","via":"QR"}'`,
    response: `{
  "test_payer_id": "tp_exemplo",
  "via": "QR",
  "rail": "WALLET",
  "payment_session_id": "payment_session_exemplo",
  "status": "PAID",
  "transfer_id": "transfer_exemplo",
  "amount_minor": 250000,
  "currency": "AOA",
  "paid_at": "2026-09-14T10:05:00Z",
  "proof_reference": "BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX",
  "simulated": false
}`,
    errors: [
      { code: '400 INVALID_PARAM / IDEMPOTENCY_KEY_REQUIRED', note: { pt: 'não nomeia exatamente um alvo, via ou simulate inválido, ou TIMEOUT sem chave', en: 'not exactly one target, an invalid via or simulate, or TIMEOUT without a key' } },
      { code: '402 PAYMENT_DECLINED', note: { pt: 'simulate DECLINED; nada se move', en: 'simulate DECLINED; nothing moves' } },
      { code: '403 PAYMENTS_UNAVAILABLE / SANDBOX_ONLY', note: { pt: 'projeto sem configuração financeira, ou chave que não é Sandbox', en: 'a project without Financial Setup, or a key that is not a Sandbox key' } },
      { code: '404 NOT_FOUND', note: { pt: 'o pagador, a sessão ou o link não existem ou são de outro projeto', en: 'the payer, session or link does not exist or belongs to another project' } },
      { code: '409 LINK_ALREADY_PAID', note: { pt: 'o link já foi pago', en: 'the link was already paid' } },
      { code: '422 INSUFFICIENT_FUNDS / INTERFACE_UNAVAILABLE / TEST_PAYER_RETIRED', note: { pt: 'saldo insuficiente, a sessão não oferece essa via, ou pagador retirado', en: 'not enough balance, the session does not offer that via, or a retired payer' } },
      { code: '503 PROVIDER_UNAVAILABLE', note: { pt: 'simulate PROVIDER_UNAVAILABLE, ou qualquer simulate com o rail externo em UNAVAILABLE; nada se move', en: 'simulate PROVIDER_UNAVAILABLE, or any simulate with the external rail UNAVAILABLE; nothing moves' } },
      { code: '503 SANDBOX_SIMULATED_TIMEOUT', note: { pt: 'simulate TIMEOUT: o pagamento foi feito; repita com a mesma chave', en: 'simulate TIMEOUT: the payment was made; repeat with the same key' } },
    ],
  },
  {
    id: 'ref-test-payer-retire',
    method: 'DELETE',
    path: '/v1/sandbox/test-payers/{id}',
    tone: 'ok',
    desc: {
      pt: 'Retira um pagador de teste: o saldo fictício é retirado pelo ledger e o pagador deixa de pagar e de receber carregamentos. Nada é apagado; os pagamentos e o histórico continuam legíveis.',
      en: 'Retires a test payer: its fictitious balance is retired through the ledger and the payer can no longer pay or be funded. Nothing is deleted; its payments and history remain readable.',
    },
    credential: { pt: 'Chave secreta Sandbox do projeto', en: 'Sandbox project secret key' },
    curl: `curl -X DELETE https://sandbox-api.banzami.com/v1/sandbox/test-payers/tp_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "id": "tp_exemplo",
  "handle": "tpexemplo01",
  "label": "Maria (teste)",
  "status": "RETIRED",
  "balance_minor": 0,
  "currency": "AOA",
  "environment": "SANDBOX",
  "created_at": "2026-09-14T10:00:00Z",
  "retired_at": "2026-09-14T12:00:00Z"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / SANDBOX_ONLY', note: { pt: 'chave sem sandbox:write, ou chave que não é Sandbox', en: 'key without sandbox:write, or a key that is not a Sandbox key' } },
      { code: '404 NOT_FOUND', note: { pt: 'o pagador não existe ou pertence a outro projeto', en: 'the payer does not exist or belongs to another project' } },
      { code: '503 RETIREMENT_FAILED', note: { pt: 'não ficou retirado por completo; repita', en: 'not fully retired; repeat the request' } },
    ],
  },
];

// Compact rows for surfaces that exist but are NOT public-key callable today.
export const RESTRICTED_ROWS: { path: string; status: Bi }[] = [
  { path: 'GET /v1/application-settlements/{id}', status: { pt: 'Não disponível a uma chave de projeto (responde 401). Guarde a resposta de POST /v1/application-settlements e o evento application_settlement.completed.', en: 'Not available to a project key (returns 401). Keep the POST /v1/application-settlements response and the application_settlement.completed event.' } },
  { path: 'GET /v1/integration', status: { pt: 'Não disponível a uma chave de projeto (responde 403 USE_FINANCIAL_SETUP). Use GET /v1/financial-setup.', en: 'Not available to a project key (returns 403 USE_FINANCIAL_SETUP). Use GET /v1/financial-setup.' } },
  { path: 'POST /v1/payment-links/{id}/mark-used', status: { pt: 'Retirada: responde 410 ROUTE_RETIRED. Um link só é marcado como pago por um pagamento; para fechar um link por pagar, use DELETE /v1/payment-links/{id}.', en: 'Retired: returns 410 ROUTE_RETIRED. A link is marked paid only by a payment; to close an unpaid link, use DELETE /v1/payment-links/{id}.' } },
  { path: 'POST/GET /v1/transfers', status: { pt: 'Transferências entre consumidores, na app Banzami. Não disponível a uma chave de projeto; para mover valor entre as suas contas, use POST /v1/wallet-account-transfers.', en: 'Consumer-to-consumer transfers, in the Banzami app. Not available to a project key; to move value between your accounts, use POST /v1/wallet-account-transfers.' } },
]

const label = (l: 'pt' | 'en', pt: string, en: string) => (l === 'pt' ? pt : en);

/** Resources, in the order a developer meets them. Every endpoint belongs to one. */
export const RESOURCE_GROUPS: { id: string; title: Bi; ids: string[] }[] = [
  { id: 'resource-identity', title: { pt: 'Identidade e prontidão', en: 'Identity and readiness' }, ids: ['ref-me', 'ref-financial-setup'] },
  { id: 'resource-sessions', title: { pt: 'Sessões de pagamento', en: 'Payment Sessions' }, ids: ['ref-ps-create', 'ref-ps-get', 'ref-ps-list', 'ref-ps-link', 'ref-ps-qr'] },
  { id: 'resource-links', title: { pt: 'Links de pagamento', en: 'Payment Links' }, ids: ['ref-pl-create', 'ref-pl-list', 'ref-pl-get', 'ref-pl-cancel'] },
  { id: 'resource-accounts', title: { pt: 'Contas e transferências', en: 'Accounts and transfers' }, ids: ['ref-wacc-create', 'ref-wacc-list', 'ref-wacc-get', 'ref-transfer-create'] },
  { id: 'resource-refunds', title: { pt: 'Reembolsos', en: 'Refunds' }, ids: ['ref-refund-create', 'ref-refund-list', 'ref-refund-get'] },
  { id: 'resource-settlements', title: { pt: 'Liquidações', en: 'Settlements' }, ids: ['ref-settlement-create', 'ref-handle-resolve'] },
  { id: 'resource-webhooks', title: { pt: 'Webhooks', en: 'Webhooks' }, ids: ['ref-webhook-register', 'ref-webhook-list', 'ref-webhook-get', 'ref-webhook-deactivate', 'ref-webhook-health', 'ref-webhook-rotate', 'ref-webhook-events', 'ref-webhook-deliveries', 'ref-webhook-replay', 'ref-webhook-test'] },
  { id: 'resource-realtime', title: { pt: 'Estado em tempo real', en: 'Realtime status' }, ids: ['ref-realtime-status'] },
  { id: 'resource-sandbox', title: { pt: 'Dados de teste da Sandbox', en: 'Sandbox test data' }, ids: ['ref-sandbox-scenarios', 'ref-sandbox-external-rail-get', 'ref-sandbox-external-rail-set', 'ref-test-payer-create', 'ref-test-payer-list', 'ref-test-payer-get', 'ref-test-payer-fund', 'ref-test-payer-pay', 'ref-test-payer-retire'] },
  { id: 'resource-receipts', title: { pt: 'Comprovativos', en: 'Receipts' }, ids: ['ref-public-proof'] },
];

const GUIDE_LABEL: Record<string, Bi> = {
  'get-started': { pt: 'Quickstart', en: 'Quickstart' },
  payments: { pt: 'Aceitar pagamentos', en: 'Accept payments' },
  webhooks: { pt: 'Webhooks', en: 'Webhooks' },
  events: { pt: 'Eventos', en: 'Events' },
  refunds: { pt: 'Reembolsos', en: 'Refunds' },
  settlements: { pt: 'Liquidações', en: 'Settlements' },
  receipts: { pt: 'Comprovativos', en: 'Receipts' },
  transfers: { pt: 'Contas e transferências', en: 'Accounts and transfers' },
  doa: { pt: 'Construir como o DOA', en: 'Build like DOA' },
  testing: { pt: 'Testar no Sandbox', en: 'Sandbox testing' },
  'going-live': { pt: 'Do Sandbox ao Live', en: 'From Sandbox toward Live' },
  trust: { pt: 'Segurança', en: 'Security' },
  troubleshooting: { pt: 'Resolução de problemas', en: 'Troubleshooting' },
};

const IN_LABEL: Record<ParamIn, Bi> = {
  path: { pt: 'Caminho', en: 'Path' },
  query: { pt: 'Query', en: 'Query' },
  header: { pt: 'Headers', en: 'Headers' },
  body: { pt: 'Corpo (JSON)', en: 'Body (JSON)' },
};

const docsBase = (lang: 'pt' | 'en') => (lang === 'pt' ? '/docs' : '/docs/en');
const link: React.CSSProperties = { color: '#9A1B22', fontWeight: 600, textDecoration: 'none' };
const cell: React.CSSProperties = { padding: '7px 9px', borderBottom: '1px solid #EAE3E3', verticalAlign: 'top', color: '#3f3538' };

/** The error codes inside a reference line such as "403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE". */
// A trailing * names a family (FEE_DESTINATION_*): kept whole and not linked, since no single entry has that id.
const codesIn = (line: string) => [...line.matchAll(/\b[A-Z][A-Z0-9_]{2,}(?:\*|\b)/g)].map((m) => m[0]);

/** One endpoint joined with its contract; throws for an endpoint without one. */
export function endpointWithMeta(e: EndpointSpec): EndpointSpec & EndpointMeta {
  const meta = ENDPOINT_META[e.id];
  if (!meta) throw new Error('endpoint ' + (e.id) + ' has no entry in endpoint-meta.ts');
  return { ...e, ...meta };
}

function Required({ lang, required }: { lang: 'pt' | 'en'; required: Param['required'] }) {
  // Words, not colour: "Obrigatório" reads as required with no colour at all; the
  // dot is a second signal for a reader scanning the column.
  const kind = required === 'conditional' ? 'conditional' : required ? 'required' : 'optional';
  const text = kind === 'required' ? label(lang, 'Obrigatório', 'Required') : kind === 'conditional' ? label(lang, 'Condicional', 'Conditional') : label(lang, 'Opcional', 'Optional');
  return (
    <span data-required={kind} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: kind === 'optional' ? 500 : 650, color: kind === 'required' ? INK : '#6f6468', whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: kind === 'required' ? '#B5101F' : kind === 'conditional' ? '#C98A1B' : 'transparent', border: kind === 'optional' ? '1px solid #B9ADB0' : 'none', boxSizing: 'border-box' }} />
      {text}
    </span>
  );
}

function Params({ lang, params }: { lang: 'pt' | 'en'; params: Param[] }) {
  const groups = (['path', 'query', 'header', 'body'] as ParamIn[]).map((where) => ({ where, rows: params.filter((p) => p.in === where) })).filter((g) => g.rows.length);
  const heads = [label(lang, 'Parâmetro', 'Parameter'), label(lang, 'Tipo', 'Type'), label(lang, 'Obrigatório', 'Required'), label(lang, 'Aceita', 'Accepts')];
  return (
    <div className="bz-reftable-wrap" style={{ margin: '4px 0 18px' }}>
      <table className="bz-reftable bz-params" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>{heads.map((h) => <th key={h} scope="col" style={TH_REF}>{h}</th>)}</tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.where}>
            <tr className="bz-reftable-group"><th colSpan={4} scope="colgroup" style={{ ...CELL, padding: '10px 10px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#6f6468', background: 'transparent', textAlign: 'left', textTransform: 'uppercase' }}>{IN_LABEL[g.where][lang]}</th></tr>
            {g.rows.map((p) => (
              <tr key={p.in + p.name}>
                <td data-label={heads[0]} style={{ ...CELL, fontFamily: mono, fontSize: 12.5, fontWeight: 650, color: INK, whiteSpace: 'nowrap' }}>{p.name}</td>
                <td data-label={heads[1]} style={{ ...CELL, fontFamily: mono, fontSize: 12, color: '#5b4f53', whiteSpace: 'nowrap' }}>{p.type}</td>
                <td data-label={heads[2]} style={CELL}><Required lang={lang} required={p.required} /></td>
                <td data-label={heads[3]} style={{ ...CELL, lineHeight: 1.55 }}>
                  {p.note[lang]}
                  {p.example ? <div style={{ marginTop: 4 }}><span style={{ fontSize: 11.5, color: '#6f6468' }}>{label(lang, 'Exemplo', 'Example')} </span><Code>{p.example}</Code></div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="bz-fact" style={{ display: 'contents' }}>
      <dt style={{ fontSize: 12, fontWeight: 600, color: '#6f6468', paddingTop: 2 }}>{k}</dt>
      <dd style={{ margin: 0, fontSize: 13.5, color: '#3f3538', minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.55 }}>{children}</dd>
    </div>
  );
}

/** An emitted event: a technical chip that links to its entry in the event catalogue. */
function EventChip({ lang, name }: { lang: 'pt' | 'en'; name: string }) {
  return (
    <a href={docsBase(lang) + '/events#event-' + name.replace('.', '-')} className="bz-eventchip" title={label(lang, 'Ver o evento no catálogo', 'See the event in the catalogue')}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px', borderRadius: 6, border: '1px solid #E4DCDD', background: '#FBF8F8', fontFamily: mono, fontSize: 12, fontWeight: 600, color: '#3f3538', textDecoration: 'none', whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: '#8B7BD6' }} />
      {name}
    </a>
  );
}

/** "Available in Sandbox": environment truth — a rounded sans label with a dot, never a mono verb or status. */
function SandboxAvailability({ lang, tone }: { lang: 'pt' | 'en'; tone: Tone }) {
  return <Badge tone={tone}>{lang === 'en' ? BADGE_LABELS_EN[tone] : undefined}</Badge>;
}

const CELL: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #EFE8E8', verticalAlign: 'top', color: '#3f3538' };
const TH_REF: React.CSSProperties = { padding: '8px 10px', fontSize: 11.5, fontWeight: 650, letterSpacing: '.02em', color: '#6f6468', textAlign: 'left', borderBottom: '1px solid #E2D9DA', background: '#FAF7F7', whiteSpace: 'nowrap' };

/** The error line "403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE" as status badge + codes. */
function ErrorLine({ lang, line }: { lang: 'pt' | 'en'; line: string }) {
  const status = Number(/^\d{3}/.exec(line)?.[0] ?? 0);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px' }}>
      {status ? <HttpStatus code={status} compact /> : null}
      {codesIn(line).map((c, i) => [i > 0 ? <span key={c + '/'} aria-hidden="true" style={{ color: '#B9ADB0' }}>/</span> : null, (c.endsWith('*')
        ? <code key={c} style={{ fontFamily: mono, fontSize: 12, fontWeight: 650, color: INK }}>{c}</code>
        : <a key={c} href={docsBase(lang) + '/errors#error-' + c} className="bz-errorcode" style={{ fontFamily: mono, fontSize: 12, fontWeight: 650, color: INK, textDecoration: 'underline', textDecorationColor: '#D9CDD0', textUnderlineOffset: 3 }}>{c}</a>)])}
    </span>
  );
}

export function ResourceReference({ lang, onCopy }: { lang: 'pt' | 'en'; onCopy: (t: string, l: string) => void }) {
  const t = (b: Bi) => b[lang];
  const copyProps = lang === 'en' ? { toastText: 'Copied to clipboard', buttonText: 'Copy' } : {};
  const byId = new Map(ENDPOINTS.map((e) => [e.id, endpointWithMeta(e)]));
  return (
    <div>
      <nav aria-label={label(lang, 'Recursos da API', 'API resources')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 18px', maxWidth: 760 }}>
        {RESOURCE_GROUPS.map((g) => (
          <a key={g.id} href={'#' + (g.id)} className="bz-toplink" style={{ fontSize: 12.5, fontWeight: 600, color: '#3f3538', textDecoration: 'none', background: '#fff', border: '1px solid #EAE3E3', borderRadius: 8, padding: '6px 10px' }}>{t(g.title)}</a>
        ))}
      </nav>
      {RESOURCE_GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={g.id}>
          <h2 id={g.id} style={{ scrollMarginTop: 80, margin: '40px 0 4px', fontSize: 20, fontWeight: 700, color: INK, letterSpacing: '-.01em' }}>{t(g.title)}</h2>
          {g.ids.map((id) => {
            const e = byId.get(id)!;
            const lines = (e.response ?? '').split('\n').length;
            const op = EXPLORER_OP.get(e.method + ' ' + e.path);
            const ok = OPENAPI_STATUSES[e.method + ' ' + e.path] ?? [];
            const primary = ok.includes(201) ? 201 : ok[0];
            const responseStatus = primary ? <HttpStatus code={primary} /> : null;
            const responseBlock = e.response ? (
              <CodeBlock lang="json" label={label(lang, 'Resposta de exemplo · placeholders', 'Example response · placeholders')} raw={e.response} status={responseStatus} onCopy={onCopy} {...copyProps} />
            ) : null;
            return (
              <article key={e.id} id={e.id} aria-labelledby={e.id + '-title'} className="bz-endpoint" style={{ scrollMarginTop: 80, borderTop: '1px solid #EAE3E3', paddingTop: 22, marginTop: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px', margin: '0 0 8px' }}>
                  <h3 id={e.id + '-title'} data-endpoint-heading style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px', margin: 0, minWidth: 0 }}>
                    <ApiMethod method={e.method} />
                    <ApiPath path={e.path} size={16} />
                  </h3>
                  <SandboxAvailability lang={lang} tone={e.tone} />
                </div>
                <P style={{ margin: '0 0 12px', fontSize: 15, color: '#3f3538' }}>{t(e.desc)}</P>
                {op ? (
                  <p style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', margin: '0 0 16px' }}>
                    <a href={'/explorer?op=' + op} data-try-in-sandbox={op} className="bz-trysandbox"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #E6CFD2', background: '#FFF6F6', color: '#8E1A21', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>
                      {label(lang, 'Experimentar na Sandbox →', 'Try in Sandbox →')}
                    </a>
                    <span style={{ fontSize: 12.5, color: '#6f6468' }}>{label(lang, 'no API Explorer da Consola, com o seu projeto; nenhuma chave vai para o browser.', 'in the Console’s API Explorer, with your project; no key reaches the browser.')}</span>
                  </p>
                ) : null}
                <dl className="bz-facts" style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '8px 18px', margin: '0 0 18px', padding: '12px 14px', maxWidth: 760, background: '#FBF9F9', border: '1px solid #EFE8E8', borderRadius: 10 }}>
                  <Fact k={label(lang, 'Autenticação', 'Authentication')}>{t(e.credential)}</Fact>
                  <Fact k="Scope">{e.scope ? <Code>{e.scope}</Code> : label(lang, 'nenhum — rota pública', 'none — public route')}</Fact>
                  <Fact k={label(lang, 'Idempotência', 'Idempotency')}>{e.idem ? t(e.idem) : e.method === 'GET' ? label(lang, 'leitura — repetir é seguro', 'read — safe to repeat') : label(lang, 'Idempotency-Key recomendado', 'Idempotency-Key recommended')}</Fact>
                  <Fact k="SDK">{e.sdk ? <Code>{e.sdk}()</Code> : null}{e.sdk && e.sdkNote ? ' — ' : null}{e.sdkNote ? t(e.sdkNote) : null}</Fact>
                  <Fact k={label(lang, 'Eventos', 'Events')}>
                    {e.events.length
                      ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>{e.events.map((ev) => <EventChip key={ev} lang={lang} name={ev} />)}</span>
                      : <span style={{ color: '#6f6468' }}>{label(lang, 'nenhum', 'none')}</span>}
                  </Fact>
                  <Fact k={label(lang, 'Guias', 'Guides')}>
                    {e.guides.map((slug, i) => <span key={slug}>{i > 0 ? <span aria-hidden="true" style={{ color: '#B9ADB0' }}> · </span> : null}<a href={docsBase(lang) + '/' + slug} style={link}>{GUIDE_LABEL[slug]?.[lang] ?? slug}</a></span>)}
                  </Fact>
                </dl>
                <h4 style={SUBHEAD}>{label(lang, 'Parâmetros', 'Parameters')}</h4>
                <Params lang={lang} params={e.params} />
                {e.refused?.length ? (
                  <div role="note" data-refused-fields style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 18px', padding: '10px 12px', maxWidth: 760, borderRadius: 10, background: '#FFF8EB', border: '1px solid #F1DFB9' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none', marginTop: 2 }}><path d="M12 3l10 18H2z" fill="none" stroke="#A86A06" strokeWidth="2" strokeLinejoin="round" /><path d="M12 10v5M12 18h.01" stroke="#A86A06" strokeWidth="2" strokeLinecap="round" /></svg>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#4A3610' }}>
                      <strong>{label(lang, 'Não envie com uma chave de projeto', 'Do not send with a project key')}:</strong>{' '}
                      {e.refused.map((f, i) => <span key={f}>{i > 0 ? ' · ' : ''}<code style={{ fontFamily: mono, fontSize: 12, padding: '0 4px', borderRadius: 4, background: '#fff', border: '1px solid #EAD9B5', textDecoration: 'line-through', textDecorationColor: '#C98A1B' }}>{f}</code></span>)} — {label(lang, 'responde 400 PAYEE_NOT_ALLOWED: quem recebe vem da configuração financeira.', 'answers 400 PAYEE_NOT_ALLOWED: who is paid comes from financial setup.')}
                    </p>
                  </div>
                ) : null}
                {e.curl || e.response ? <h4 style={SUBHEAD}>{label(lang, 'Pedido e resposta', 'Request and response')}</h4> : null}
                {e.curl ? <CodeBlock label={'curl · ' + e.method + ' ' + e.path} raw={e.curl} onCopy={onCopy} {...copyProps} /> : null}
                {responseBlock ? (
                  lines > 14 ? (
                    <details className="bz-response" style={{ margin: '0 0 16px' }}>
                      <summary className="bz-response-summary" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '0 12px', margin: '0 0 8px', borderRadius: 10, border: '1px solid #EAE3E3', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 650, color: INK, listStyle: 'none' }}>
                        <svg className="bz-response-chevron" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span style={{ whiteSpace: 'nowrap' }}>{label(lang, 'Resposta de exemplo', 'Example response')}</span>
                        {primary ? <HttpStatus code={primary} /> : null}
                        <span className="bz-response-lines" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: '#6f6468', whiteSpace: 'nowrap' }}>{label(lang, lines + ' linhas', lines + ' lines')}</span>
                      </summary>
                      {responseBlock}
                    </details>
                  ) : responseBlock
                ) : null}
                <h4 style={SUBHEAD}>{label(lang, 'Erros', 'Errors')}</h4>
                <div className="bz-reftable-wrap" style={{ margin: '4px 0 12px' }}>
                  <table className="bz-reftable bz-errors" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                    <thead><tr>
                      <th scope="col" style={TH_REF}>{label(lang, 'Erro', 'Error')}</th>
                      <th scope="col" style={TH_REF}>{label(lang, 'Quando', 'When')}</th>
                    </tr></thead>
                    <tbody>
                      {e.errors.map((er) => (
                        <tr key={er.code}>
                          <td data-label={label(lang, 'Erro', 'Error')} style={{ ...CELL, minWidth: 180 }}><ErrorLine lang={lang} line={er.code} /></td>
                          <td data-label={label(lang, 'Quando', 'When')} style={{ ...CELL, lineHeight: 1.55 }}>{t(er.note)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </section>
      ))}

      <H2 id="restricted-routes">{label(lang, 'Superfícies existentes com credencial restrita', 'Existing surfaces with restricted credentials')}</H2>
      <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6f6468' }}>
              <th style={{ padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid #EAE3E3' }}>{label(lang, 'Rotas', 'Routes')}</th>
              <th style={{ padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid #EAE3E3' }}>{label(lang, 'Estado / credencial', 'Status / credential')}</th>
            </tr>
          </thead>
          <tbody>
            {RESTRICTED_ROWS.map((r) => (
              <tr key={r.path}>
                <td style={{ padding: '9px 10px', borderBottom: '1px solid #EAE3E3', fontFamily: mono, fontSize: 12, fontWeight: 700, color: INK }}>{r.path}</td>
                <td style={{ padding: '9px 10px', borderBottom: '1px solid #EAE3E3', color: '#3f3538' }}>{r.status[lang]}</td>
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

// ── scopes by task ───────────────────────────────────────────────────────────
//
// Which scope a key needs, answered from the same endpoint contracts the
// reference renders — so a scope cannot be listed here for an endpoint that does
// not require it. Only the one-line purpose is written by hand.

export const SCOPE_PURPOSE: Record<string, Bi> = {
  'identity:read': { pt: 'Confirmar a chave e ler a configuração financeira', en: 'Confirm the key and read the Financial Setup' },
  'payment_sessions:write': { pt: 'Criar pagamentos', en: 'Create payments' },
  'payment_sessions:read': { pt: 'Consultar pagamentos, o link e o QR', en: 'Read payments, their link and QR' },
  'payment_links:write': { pt: 'Criar e cancelar links de pagamento', en: 'Create and cancel Payment Links' },
  'payment_links:read': { pt: 'Consultar links de pagamento', en: 'Read Payment Links' },
  'wallet_accounts:create': { pt: 'Criar contas', en: 'Create accounts' },
  'wallet_accounts:read': { pt: 'Consultar contas e saldos', en: 'Read accounts and balances' },
  'transfers:write': { pt: 'Transferir entre contas do projeto', en: 'Transfer between the project’s accounts' },
  'refunds:write': { pt: 'Reembolsar pagamentos', en: 'Refund payments' },
  'refunds:read': { pt: 'Consultar reembolsos', en: 'Read refunds' },
  'application_settlements:write': { pt: 'Pedir liquidações', en: 'Request settlements' },
  'webhooks:write': { pt: 'Registar, desativar, rodar o segredo, reenviar e enviar eventos de teste', en: 'Register, deactivate, rotate the secret, replay and send test events' },
  'webhooks:read': { pt: 'Consultar endpoints, eventos e entregas', en: 'Read endpoints, events and deliveries' },
  'customers:read': { pt: 'Resolver um @banza', en: 'Resolve an @banza handle' },
  'sandbox:read': { pt: 'Ler os cenários e os pagadores de teste (Sandbox)', en: 'Read scenarios and test payers (Sandbox)' },
  'sandbox:write': { pt: 'Criar, carregar, pagar como e retirar pagadores de teste (Sandbox)', en: 'Create, fund, pay as and retire test payers (Sandbox)' },
};

export function ScopeTable({ lang }: { lang: 'pt' | 'en' }) {
  const t = (b: Bi) => b[lang];
  const scopes = new Map<string, EndpointSpec[]>();
  for (const e of ENDPOINTS) {
    const scope = ENDPOINT_META[e.id]?.scope;
    if (scope) scopes.set(scope, [...(scopes.get(scope) ?? []), e]);
  }
  const cell: React.CSSProperties = { padding: '7px 9px', borderBottom: '1px solid #EAE3E3', verticalAlign: 'top', color: '#3f3538' };
  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#6f6468' }}>
            <th style={{ ...cell, fontWeight: 600 }}>Scope</th>
            <th style={{ ...cell, fontWeight: 600 }}>{label(lang, 'Para', 'For')}</th>
            <th style={{ ...cell, fontWeight: 600 }}>Endpoints</th>
          </tr>
        </thead>
        <tbody>
          {[...scopes].map(([scope, eps]) => (
            <tr key={scope}>
              <td style={{ ...cell, fontFamily: mono, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{scope}</td>
              <td style={cell}>{SCOPE_PURPOSE[scope] ? t(SCOPE_PURPOSE[scope]) : null}</td>
              <td style={{ ...cell, fontFamily: mono, fontSize: 12 }}>
                {eps.map((e, i) => <span key={e.id}>{i > 0 ? ', ' : ''}<a href={docsBase(lang) + '/reference#' + e.id} style={{ color: '#9A1B22', textDecoration: 'none', whiteSpace: 'nowrap' }}>{e.method + ' ' + e.path}</a></span>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
