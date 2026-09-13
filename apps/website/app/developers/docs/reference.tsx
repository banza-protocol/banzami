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
import { BADGE_LABELS_EN, Badge, Code, CodeBlock, H3, INK, P, mono, type Tone } from './ui';
import { ENDPOINT_META, type EndpointMeta, type Param, type ParamIn } from './endpoint-meta';

type Bi = { pt: string; en: string };

export type EndpointSpec = {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
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
      { code: '502 UPSTREAM_ERROR / 503 SERVICE_UNAVAILABLE', note: { pt: 'falha temporária; repita com a mesma idempotency_key', en: 'temporary failure; retry with the same idempotency_key' } },
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
      pt: 'Volta a pôr em fila uma entrega que falhou, com o mesmo id. Uma entrega que já teve sucesso responde 409 e não é reenviada.',
      en: 'Queues a failed delivery again, with the same id. A delivery that already succeeded returns 409 and is not sent again.',
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
  { id: 'resource-webhooks', title: { pt: 'Webhooks', en: 'Webhooks' }, ids: ['ref-webhook-register', 'ref-webhook-list', 'ref-webhook-get', 'ref-webhook-deactivate', 'ref-webhook-health', 'ref-webhook-rotate', 'ref-webhook-events', 'ref-webhook-deliveries', 'ref-webhook-replay'] },
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
const codesIn = (line: string) => [...line.matchAll(/\b([A-Z][A-Z0-9_]{2,}\*?)\b/g)].map((m) => m[1]);

/** One endpoint joined with its contract; throws for an endpoint without one. */
export function endpointWithMeta(e: EndpointSpec): EndpointSpec & EndpointMeta {
  const meta = ENDPOINT_META[e.id];
  if (!meta) throw new Error('endpoint ' + (e.id) + ' has no entry in endpoint-meta.ts');
  return { ...e, ...meta };
}

function Params({ lang, params }: { lang: 'pt' | 'en'; params: Param[] }) {
  const groups = (['path', 'query', 'header', 'body'] as ParamIn[]).map((where) => ({ where, rows: params.filter((p) => p.in === where) })).filter((g) => g.rows.length);
  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 12px' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 12.5 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#6f6468' }}>
            <th style={{ ...cell, fontWeight: 600 }}>{label(lang, 'Parâmetro', 'Parameter')}</th>
            <th style={{ ...cell, fontWeight: 600 }}>{label(lang, 'Tipo', 'Type')}</th>
            <th style={{ ...cell, fontWeight: 600 }}>{label(lang, 'Obrigatório', 'Required')}</th>
            <th style={{ ...cell, fontWeight: 600 }}>{label(lang, 'Aceita', 'Accepts')}</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.where}>
            <tr><td colSpan={4} style={{ ...cell, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: '#9A1B22', background: '#FFF7F6' }}>{IN_LABEL[g.where][lang].toUpperCase()}</td></tr>
            {g.rows.map((p) => (
              <tr key={p.in + p.name}>
                <td style={{ ...cell, fontFamily: mono, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{p.name}</td>
                <td style={{ ...cell, fontFamily: mono, whiteSpace: 'nowrap' }}>{p.type}</td>
                <td style={cell}>{p.required === 'conditional' ? label(lang, 'condicional', 'conditional') : p.required ? label(lang, 'sim', 'yes') : label(lang, 'não', 'no')}</td>
                <td style={cell}>{p.note[lang]}{p.example ? <> · <span style={{ fontFamily: mono, fontSize: 12 }}>{p.example}</span></> : null}</td>
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
    <div style={{ display: 'contents' }}>
      <dt style={{ fontSize: 12.5, fontWeight: 600, color: '#6f6468' }}>{k}</dt>
      <dd style={{ margin: 0, fontSize: 13, color: '#3f3538', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</dd>
    </div>
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
          <a key={g.id} href={'#' + (g.id)} style={{ ...link, fontSize: 12.5, background: '#fff', border: '1px solid #EAE3E3', borderRadius: 10, padding: '6px 10px' }}>{t(g.title)}</a>
        ))}
      </nav>
      {RESOURCE_GROUPS.map((g) => (
        <section key={g.id} aria-labelledby={g.id}>
          <h3 id={g.id} style={{ scrollMarginTop: 80, margin: '30px 0 4px', fontSize: 19, fontWeight: 700, color: INK }}>{t(g.title)}</h3>
          {g.ids.map((id) => {
            const e = byId.get(id)!;
            const lines = (e.response ?? '').split('\n').length;
            return (
              <div key={e.id} id={e.id} style={{ scrollMarginTop: 80, borderTop: '1px solid #EAE3E3', paddingTop: 6, marginTop: 14 }}>
                <H3>
                  <span style={{ fontFamily: mono, fontSize: 15 }}>{e.method} {e.path}</span>{' '}
                  <Badge tone={e.tone}>{lang === 'en' ? BADGE_LABELS_EN[e.tone] : undefined}</Badge>
                </H3>
                <P>{t(e.desc)}</P>
                <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '5px 14px', margin: '0 0 12px', maxWidth: 760 }}>
                  <Fact k={label(lang, 'Autenticação', 'Authentication')}>{t(e.credential)}</Fact>
                  <Fact k="Scope">{e.scope ? <Code>{e.scope}</Code> : label(lang, 'nenhum — rota pública', 'none — public route')}</Fact>
                  <Fact k={label(lang, 'Idempotência', 'Idempotency')}>{e.idem ? t(e.idem) : e.method === 'GET' ? label(lang, 'leitura — repetir é seguro', 'read — safe to repeat') : label(lang, 'Idempotency-Key recomendado', 'Idempotency-Key recommended')}</Fact>
                  <Fact k="SDK">{e.sdk ? <Code>{e.sdk}()</Code> : null}{e.sdk && e.sdkNote ? ' — ' : null}{e.sdkNote ? t(e.sdkNote) : null}</Fact>
                  <Fact k={label(lang, 'Eventos', 'Events')}>
                    {e.events.length
                      ? e.events.map((ev, i) => <span key={ev}>{i > 0 ? ' · ' : ''}<a href={docsBase(lang) + '/events#event-' + ev.replace('.', '-')} style={link}><Code>{ev}</Code></a></span>)
                      : label(lang, 'nenhum', 'none')}
                  </Fact>
                  <Fact k={label(lang, 'Guias', 'Guides')}>
                    {e.guides.map((slug, i) => <span key={slug}>{i > 0 ? ' · ' : ''}<a href={docsBase(lang) + '/' + slug} style={link}>{GUIDE_LABEL[slug]?.[lang] ?? slug}</a></span>)}
                  </Fact>
                </dl>
                <Params lang={lang} params={e.params} />
                {e.refused?.length ? (
                  <P style={{ fontSize: 13 }}>
                    <strong>{label(lang, 'Não envie com uma chave de projeto', 'Do not send with a project key')}:</strong>{' '}
                    {e.refused.map((f, i) => <span key={f}>{i > 0 ? ' · ' : ''}<Code>{f}</Code></span>)} — {label(lang, 'responde 400 PAYEE_NOT_ALLOWED: quem recebe vem da configuração financeira.', 'answers 400 PAYEE_NOT_ALLOWED: who is paid comes from financial setup.')}
                  </P>
                ) : null}
                {e.curl ? <CodeBlock label={'curl · ' + e.method + ' ' + e.path} raw={e.curl} onCopy={onCopy} {...copyProps} /> : null}
                {e.response ? (
                  lines > 14 ? (
                    <details style={{ margin: '0 0 14px' }}>
                      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#9A1B22', margin: '0 0 8px' }}>{label(lang, 'Resposta de exemplo (' + (lines) + ' linhas)', 'Example response (' + (lines) + ' lines)')}</summary>
                      <CodeBlock label={label(lang, 'resposta (exemplo, placeholders)', 'response (example, placeholders)')} raw={e.response} onCopy={onCopy} {...copyProps} />
                    </details>
                  ) : <CodeBlock label={label(lang, 'resposta (exemplo, placeholders)', 'response (example, placeholders)')} raw={e.response} onCopy={onCopy} {...copyProps} />
                ) : null}
                <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 12px' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 12.5 }}>
                    <thead><tr style={{ textAlign: 'left', color: '#6f6468' }}>
                      <th style={{ ...cell, fontWeight: 600 }}>{label(lang, 'Erro', 'Error')}</th>
                      <th style={{ ...cell, fontWeight: 600 }}>{label(lang, 'Quando', 'When')}</th>
                    </tr></thead>
                    <tbody>
                      {e.errors.map((er) => {
                        const status = /^\d{3}/.exec(er.code)?.[0] ?? '';
                        return (
                          <tr key={er.code}>
                            <td style={{ ...cell, fontFamily: mono, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>
                              {status}{' '}
                              {codesIn(er.code).map((c, i) => <span key={c}>{i > 0 ? ' / ' : ''}{c.endsWith('*') ? c : <a href={docsBase(lang) + '/errors#error-' + c} style={link}>{c}</a>}</span>)}
                            </td>
                            <td style={cell}>{t(er.note)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <H3 id="restricted-routes">{label(lang, 'Superfícies existentes com credencial restrita', 'Existing surfaces with restricted credentials')}</H3>
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
