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
  method: 'GET' | 'POST' | 'DELETE';
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
      pt: 'Identidade da chave: devolve o ambiente, o projeto ({id, name, ref}), os scopes e o estado da chave autenticada. project.id é o id do próprio projeto, o mesmo da Console, e não muda com o nome. Não devolve estado financeiro — ver GET /v1/financial-setup.',
      en: 'Key identity: returns the environment, the project ({id, name, ref}), the scopes and status of the authenticated key. project.id is the Project\'s own id, as in the Console, and survives a rename. Returns no financial state — see GET /v1/financial-setup.',
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
  "project": {
    "id": "6f1c2d3e-0000-4000-8000-000000000000",
    "name": "Meu Projeto",
    "ref": "meu-projeto"
  },
  "scopes": ["identity:read"],
  "key_status": "ACTIVE"
}`,
    errors: [
      { code: '401 UNAUTHORIZED', note: { pt: 'chave em falta, inválida, revogada ou bz_live_ (recusada, fail-closed)', en: 'missing, invalid, revoked or bz_live_ key (rejected, fail-closed)' } },
      { code: '403 FORBIDDEN', note: { pt: 'chave sem o scope identity:read', en: 'key without the identity:read scope' } },
    ],
  },
  {
    id: 'ref-financial-setup',
    method: 'GET',
    path: '/v1/financial-setup',
    tone: 'ok',
    desc: {
      pt: 'Prontidão financeira do seu projeto: se pode liquidar e, se não, o que falta. A chave é a autoridade — o pedido não indica projeto, titular nem conta. settlement.ready é verdadeiro exatamente quando os pré-requisitos da liquidação passam; cada bloqueio é a recusa que a liquidação devolveria. Um projeto ainda não configurado responde 200 com financial_setup.state UNCONFIGURED. SDK: getFinancialSetup().',
      en: 'Your Project\'s financial readiness: whether it can settle and, if not, what is missing. The key is the authority — the request names no Project, owner or account. settlement.ready is true exactly when settlement\'s prerequisites pass; each blocker is the refusal a settlement would return. A Project not yet configured answers 200 with financial_setup.state UNCONFIGURED. SDK: getFinancialSetup().',
    },
    credential: {
      pt: 'Chave developer bz_test_ (scope identity:read)',
      en: 'Developer key bz_test_ (identity:read scope)',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '401 UNAUTHORIZED', note: { pt: 'chave em falta, inválida, revogada ou bz_live_ (recusada, fail-closed)', en: 'missing, invalid, revoked or bz_live_ key (rejected, fail-closed)' } },
      { code: '403 INSUFFICIENT_SCOPE', note: { pt: 'chave sem o scope identity:read', en: 'key without the identity:read scope' } },
      { code: '409 FINANCIAL_SETUP_CONFLICT', note: { pt: 'a configuração do projeto não corresponde a uma conta; contacte o suporte', en: 'the project\'s setup does not match an account; contact support' } },
      { code: '503 SERVICE_UNAVAILABLE', note: { pt: 'não foi possível avaliar agora; nunca é reportado como configuração em falta — repita', en: 'could not be evaluated right now; never reported as missing configuration — retry' } },
    ],
  },
  {
    id: 'ref-ps-create',
    method: 'POST',
    path: '/v1/payment-sessions',
    tone: 'ok',
    desc: {
      pt: 'Cria uma sessão de pagamento e devolve o id, o estado e as interfaces (link/QR) para apresentar ao pagador.',
      en: 'Creates a payment session and returns its id, status and the interfaces (link/QR) to present to the payer.',
    },
    credential: {
      pt: 'Chave developer (payment_sessions:write, projeto com configuração financeira concluída) ou credencial de merchant',
      en: 'Developer key (payment_sessions:write, project with completed financial setup) or merchant credential',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json', 'Idempotency-Key: idem_pedido_123'],
    requestFields: [
      { name: 'wallet_account_id', note: {
        pt: 'APENAS credencial de merchant. Com uma chave de projeto quem recebe vem da configuração financeira — não envie este campo; a API recusa-o com 400 PAYEE_NOT_ALLOWED.',
        en: 'Merchant credential ONLY. With a project key who is paid comes from financial setup — do not send this field; the API refuses it with 400 PAYEE_NOT_ALLOWED.' } },
      { name: 'purpose', note: { pt: 'finalidade — um de GENERIC, DONATION, ORDER, TICKET, STORE, EVENT, CAMPAIGN, CUSTOM', en: 'purpose — one of GENERIC, DONATION, ORDER, TICKET, STORE, EVENT, CAMPAIGN, CUSTOM' } },
      { name: 'reference_type / reference_id', note: { pt: 'a sua referência de negócio', en: 'your business reference' } },
      { name: 'amount_minor', note: { pt: 'montante em unidades menores (AOA)', en: 'amount in minor units (AOA)' } },
      { name: 'currency', note: { pt: 'moeda (AOA)', en: 'currency (AOA)' } },
      { name: 'description', note: { pt: 'descrição apresentada ao pagador', en: 'description shown to the payer' } },
      { name: 'expires_at / metadata', note: { pt: 'opcionais', en: 'optional' } },
    ],
    curl: `curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\
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
    { "type": "PAYMENT_LINK", "value": "https://pay.banzami.com/pay/slug_exemplo", "format": "URL",
      "expires_at": "2026-07-11T12:00:00Z" },
    { "type": "DEEP_LINK", "value": "banzami://pay/slug_exemplo", "format": "URL",
      "expires_at": "2026-07-11T12:00:00Z" },
    { "type": "DYNAMIC_QR", "value": "https://pay.banzami.com/pay/slug_exemplo", "format": "QR_PAYLOAD",
      "qr_url": "/v1/payment-sessions/psess_exemplo/qr", "expires_at": "2026-07-11T12:00:00Z" }
  ]
}`,
    errors: [
      { code: '400 MISSING_FIELD / INVALID_BODY / INVALID_METADATA', note: { pt: 'corrija o pedido', en: 'fix the request' } },
      { code: '400 PAYEE_NOT_ALLOWED', note: { pt: 'wallet_account_id enviado com uma chave de projeto — quem recebe vem da configuração financeira', en: 'wallet_account_id sent with a project key — who is paid comes from financial setup' } },
      { code: '401 UNAUTHORIZED', note: { pt: 'credencial inválida', en: 'invalid credential' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem o scope, ou projeto sem configuração financeira concluída', en: 'key without the scope, or project without completed financial setup' } },
      { code: '409 IDEMPOTENCY_CONFLICT', note: { pt: 'um pedido com a mesma Idempotency-Key ainda está em curso', en: 'a request with the same Idempotency-Key is still in flight' } },
      { code: '409 IDEMPOTENCY_KEY_REUSED', note: { pt: 'a mesma Idempotency-Key com um corpo diferente', en: 'the same Idempotency-Key with a different body' } },
      { code: '409 BINDING_CHANGED', note: { pt: 'a configuração financeira mudou durante o pedido — repita com uma chave nova', en: 'financial setup changed during the request — retry with a new key' } },
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
      pt: 'Consulta uma sessão (o mesmo corpo da criação, com o estado atual). GET /v1/payment-sessions lista as sessões do projeto/merchant, com filtro opcional ?status=.',
      en: 'Fetches one session (same body as creation, with the current status). GET /v1/payment-sessions lists the project/merchant sessions, with an optional ?status= filter.',
    },
    credential: {
      pt: 'Como na criação',
      en: 'Same as creation',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl https://sandbox-api.banzami.com/v1/payment-sessions/psess_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    errors: [
      { code: '404 NOT_FOUND', note: { pt: 'sessão inexistente ou fora do seu âmbito', en: 'session missing or outside your scope' } },
      { code: '401 UNAUTHORIZED', note: { pt: 'credencial inválida', en: 'invalid credential' } },
    ],
  },
  {
    id: 'ref-ps-link',
    method: 'GET',
    path: '/v1/payment-sessions/{id}/link',
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
    path: '/v1/payment-sessions/{id}/qr',
    tone: 'ok',
    desc: {
      pt: 'Devolve o QR da sessão. O QR codifica o URL da página de pagamento da sessão (https://pay.banzami.com/pay/{slug}) — qualquer câmara de telemóvel abre a página e o pagador paga aí. Sem parâmetros devolve o valor codificável em JSON ({"type":"QR","value":"https://pay.banzami.com/pay/{slug}"}); com ?format=png|svg devolve a imagem renderizada (?format=pdf responde 415).',
      en: 'Returns the session QR. The QR encodes the session’s hosted pay URL (https://pay.banzami.com/pay/{slug}) — any phone camera opens the page and the payer pays there. Without parameters it returns the encodable value as JSON ({"type":"QR","value":"https://pay.banzami.com/pay/{slug}"}); with ?format=png|svg it returns the rendered image (?format=pdf answers 415).',
    },
    credential: { pt: 'Como na criação', en: 'Same as creation' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl "https://sandbox-api.banzami.com/v1/payment-sessions/psess_exemplo/qr?format=svg" \\
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
      pt: 'Credencial de merchant, ou chave developer com scope payment_links (projeto com configuração financeira concluída)',
      en: 'Merchant credential, or developer key with the payment_links scope (project with completed financial setup)',
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
      { code: '400 MISSING_FIELD / INVALID_AMOUNT / INVALID_EXPIRY', note: { pt: 'corrija os campos', en: 'fix the fields' } },
      { code: '400 PAYEE_NOT_ALLOWED', note: { pt: 'merchant_id ou wallet_id enviado com uma chave de projeto', en: 'merchant_id or wallet_id sent with a project key' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_links:write, ou projeto sem configuração financeira concluída', en: 'key without payment_links:write, or project without completed financial setup' } },
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
      pt: 'Abre uma conta do seu projeto para segregar valor por referência de negócio (por exemplo, uma campanha). O titular vem da configuração financeira — não há campo que o possa indicar.',
      en: 'Opens an account of your project to segregate value by business reference (a campaign, say). The owner comes from financial setup — no field can name it.',
    },
    credential: { pt: 'Chave de projeto (scope wallet_accounts:create)', en: 'Project key (wallet_accounts:create scope)' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json'],
    requestFields: [
      { name: 'purpose', note: { pt: 'finalidade da conta — um de CAMPAIGN, PROJECT, EVENT, STORE, ESCROW, RESERVE, SETTLEMENT, CUSTOM (PRIMARY é criada com a carteira)', en: 'account purpose — one of CAMPAIGN, PROJECT, EVENT, STORE, ESCROW, RESERVE, SETTLEMENT, CUSTOM (PRIMARY is created with the wallet)' } },
      { name: 'reference_type / reference_id', note: { pt: 'a sua referência de negócio', en: 'your business reference' } },
      { name: 'label', note: { pt: 'nome legível, opcional', en: 'human-readable label, optional' } },
    ],
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
      { code: '400 MISSING_FIELD / INVALID_BODY', note: { pt: 'corrija o pedido', en: 'fix the request' } },
      { code: '400 PAYEE_NOT_ALLOWED', note: { pt: 'wallet_id enviado com uma chave de projeto — a carteira vem da configuração financeira', en: 'wallet_id sent with a project key — the wallet comes from financial setup' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem wallet_accounts:create, ou projeto sem configuração financeira concluída', en: 'key without wallet_accounts:create, or project without completed financial setup' } },
      { code: '422 PRIMARY_NOT_CREATABLE', note: { pt: 'a conta PRIMARY é criada com a carteira', en: 'the PRIMARY account is created with the wallet' } },
    ],
  },
  {
    id: 'ref-wacc-list',
    method: 'GET',
    path: '/v1/wallet-accounts',
    tone: 'ok',
    desc: {
      pt: 'Lista as contas segregadas sob a carteira do titular a que o seu projeto está ligado. Com uma chave de projeto, o âmbito é essa carteira e um parâmetro wallet_id é recusado — a carteira nunca vem do pedido.',
      en: 'Lists the segregated accounts under the wallet of the owner your project is bound to. With a project key the scope is that wallet and a wallet_id parameter is refused — the wallet never comes from the request.',
    },
    credential: { pt: 'Chave de projeto (scope wallet_accounts:read)', en: 'Project key (wallet_accounts:read scope)' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '400 PAYEE_NOT_ALLOWED', note: { pt: 'wallet_id enviado com uma chave de projeto — a carteira vem da configuração financeira', en: 'wallet_id sent with a project key — the wallet comes from financial setup' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'falta o scope wallet_accounts:read, ou projeto sem configuração financeira concluída', en: 'the wallet_accounts:read scope is missing, or the project has no completed financial setup' } },
    ],
  },
  {
    id: 'ref-wacc-get',
    method: 'GET',
    path: '/v1/wallet-accounts/{id}',
    tone: 'ok',
    desc: {
      pt: 'Devolve uma conta sua. Uma conta de outro titular responde 404, não 403: um código que as distinguisse deixaria um projeto enumerar as contas de outro.',
      en: 'Returns one of your accounts. An account belonging to another owner answers 404, not 403: a status code that distinguished them would let one project enumerate another’s accounts.',
    },
    credential: { pt: 'Chave de projeto (scope wallet_accounts:read)', en: 'Project key (wallet_accounts:read scope)' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'falta o scope wallet_accounts:read, ou projeto sem configuração financeira concluída', en: 'the wallet_accounts:read scope is missing, or the project has no completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'a conta não existe, ou não é sua — indistinguível de propósito', en: 'the account does not exist, or is not yours — deliberately indistinguishable' } },
    ],
  },
  {
    id: 'ref-transfer-create',
    method: 'POST',
    path: '/v1/wallet-account-transfers',
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
      { code: '400 INVALID_DESTINATION', note: { pt: 'origem e destino iguais', en: 'source and destination are the same' } },
      { code: '400 INVALID_AMOUNT', note: { pt: 'amount_minor tem de ser positivo', en: 'amount_minor must be positive' } },
      { code: '400 MISSING_FIELD', note: { pt: 'idempotency_key ou currency em falta', en: 'idempotency_key or currency missing' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem o scope, ou projeto sem configuração financeira concluída', en: 'key without the scope, or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'uma conta que não é sua responde 404, indistinguível de uma que não existe', en: 'an account that is not yours answers 404, indistinguishable from one that does not exist' } },
      { code: '409 IDEMPOTENCY_KEY_REUSED', note: { pt: 'a mesma idempotency_key com um pedido diferente', en: 'the same idempotency_key with a different request' } },
      { code: '422 INSUFFICIENT_FUNDS', note: { pt: 'saldo insuficiente — nada se move', en: 'insufficient funds — nothing moves' } },
      { code: '422 ACCOUNTS_NOT_SAME_WALLET / CURRENCY_MISMATCH', note: { pt: 'as contas não são do mesmo titular, ou não estão na mesma moeda', en: 'the accounts are not of the same owner, or not in the same currency' } },
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
      { code: '400 MISSING_FIELD / INVALID_AMOUNT / INVALID_CURRENCY / INVALID_SOURCE_TYPE', note: { pt: 'campos em falta ou inválidos', en: 'missing or invalid fields' } },
      { code: '403 INSUFFICIENT_SCOPE', note: { pt: 'chave sem refunds:write — uma chave de leitura não reembolsa', en: 'key without refunds:write — a read-only key cannot refund' } },
      { code: '409 IDEMPOTENCY_KEY_CONFLICT', note: { pt: 'já existe um reembolso com esta idempotency_key para este pagamento', en: 'a refund with this idempotency_key already exists for this payment' } },
      { code: '422 REFUND_EXCEEDS_CAPTURED', note: { pt: 'o montante é maior do que o que resta reembolsar', en: 'the amount is larger than what is left to refund' } },
      { code: '422 REFUND_NOT_FUNDABLE', note: { pt: 'a conta que recebeu já não tem saldo para devolver', en: 'the receiving account no longer has the balance to return it' } },
      { code: '422 CURRENCY_MISMATCH / INVALID_PAYMENT_STATUS', note: { pt: 'moeda diferente do pagamento, ou pagamento que não se reembolsa', en: 'currency differs from the payment, or a payment that cannot be refunded' } },
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
    path: '/v1/webhooks/endpoints',
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
      { code: '400 INVALID_WEBHOOK_URL', note: { pt: 'o destino não é um https público', en: 'the destination is not a public https endpoint' } },
      { code: '400 UNSUPPORTED_EVENT', note: { pt: 'tipo de evento não suportado', en: 'unsupported event type' } },
      { code: '400 MISSING_FIELD', note: { pt: 'url ou events em falta', en: 'url or events missing' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed financial setup' } },
    ],
  },

  {
    id: 'ref-settlement-create',
    method: 'POST',
    path: '/v1/application-settlements',
    tone: 'ok',
    desc: {
      pt: 'Liquida uma conta segregada do seu projeto (por exemplo, uma campanha) para um @banza beneficiário. O Banzami lê o saldo disponível da conta como montante bruto, aplica o perfil de preço que atribuiu ao seu negócio, credita a eventual taxa de aplicação no destino indicado e o líquido no beneficiário. O pedido não leva montante nem taxa: um campo de preço no corpo é recusado.',
      en: 'Settles one of your project’s segregated accounts (a campaign, say) to a beneficiary @banza. Banzami reads the account’s available balance as the gross, applies the pricing profile it assigned to your business, credits any application fee to the destination you name and the net to the beneficiary. The request carries no amount and no rate: a pricing field in the body is refused.',
    },
    credential: {
      pt: 'Chave de projeto (scope application_settlements:write, projeto com configuração financeira concluída) ou credencial de merchant',
      en: 'Project key (application_settlements:write scope, project with completed financial setup) or merchant credential',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX', 'Content-Type: application/json'],
    requestFields: [
      { name: 'source_account_id', note: { pt: 'conta segregada de origem — tem de ser sua e não pode ser a PRIMARY; todo o saldo disponível é liquidado', en: 'segregated source account — must be yours and cannot be the PRIMARY; its whole available balance is settled' } },
      { name: 'beneficiary_banza_name', note: { pt: '@banza que recebe o líquido, com ou sem @; precisa de carteira ativa na moeda da origem', en: '@banza that receives the net, with or without @; needs an active wallet in the source currency' } },
      { name: 'fee_destination_banza_name', note: { pt: 'o seu próprio @banza de negócio para a taxa de aplicação — obrigatório apenas quando o seu preço resulta numa taxa', en: 'your own business @banza for the application fee — required only when your pricing resolves a fee' } },
      { name: 'reference_id / reason', note: { pt: 'a sua referência; devolvida como owner_ref (reason só quando não há reference_id)', en: 'your reference; returned as owner_ref (reason only when there is no reference_id)' } },
      { name: 'idempotency_key', note: { pt: 'obrigatório', en: 'required' } },
    ],
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
      { code: '400 MISSING_FIELD / INVALID_BODY', note: { pt: 'idempotency_key, source_account_id ou beneficiary_banza_name em falta, ou corpo inválido', en: 'idempotency_key, source_account_id or beneficiary_banza_name missing, or invalid body' } },
      { code: '400 PRICING_FIELD_NOT_ACCEPTED', note: { pt: 'o corpo indica uma taxa, perfil, categoria ou montante de taxa — o preço é do Banzami', en: 'the body names a rate, profile, category or fee amount — the price is Banzami’s' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem application_settlements:write, ou projeto sem configuração financeira concluída', en: 'key without application_settlements:write, or project without completed financial setup' } },
            { code: '403 FEE_DESTINATION_NOT_OWNED', note: { pt: 'o destino da taxa não é a sua conta de negócio', en: 'the fee destination is not your business account' } },
      { code: '404 NOT_FOUND', note: { pt: 'conta de origem inexistente ou de outro titular — indistinguíveis de propósito', en: 'source account missing or belonging to another owner — deliberately indistinguishable' } },
      { code: '409 PRICING_NOT_CONFIGURED', note: { pt: 'o seu negócio ainda não tem perfil de preço atribuído', en: 'your business has no pricing profile assigned yet' } },
      { code: '409 IDEMPOTENCY_CONFLICT', note: { pt: 'a mesma idempotency_key com outra origem ou outro beneficiário', en: 'the same idempotency_key with another source or beneficiary' } },
      { code: '409 PRICING_CONFIGURATION_ERROR', note: { pt: 'mais do que uma regra de preço se aplica; contacte o suporte', en: 'more than one pricing rule applies; contact support' } },
      { code: '422 INSUFFICIENT_FUNDS / FEE_EXCEEDS_GROSS', note: { pt: 'o saldo mudou entretanto, ou a taxa excederia o bruto', en: 'the balance changed in the meantime, or the fee would exceed the gross' } },
      { code: '422 ACCOUNT_FROZEN', note: { pt: 'a conta está bloqueada; contacte o suporte', en: 'the account is frozen; contact support' } },
      { code: '422 SOURCE_NOT_SEGREGATED', note: { pt: 'a origem é a conta PRIMARY', en: 'the source is the PRIMARY account' } },
      { code: '422 NOTHING_TO_SETTLE', note: { pt: 'a conta de origem não tem saldo disponível', en: 'the source account has no available balance' } },
      { code: '422 BENEFICIARY_NOT_FOUND', note: { pt: 'o @banza não tem carteira ativa nesta moeda', en: 'the @banza has no active wallet in this currency' } },
      { code: '422 FEE_DESTINATION_*', note: { pt: 'destino da taxa em falta ou não elegível (REQUIRED, NOT_FOUND, NOT_ACTIVE, KYB_NOT_APPROVED, WALLET_UNAVAILABLE, TYPE_NOT_ALLOWED, NOT_BUSINESS_ACCOUNT)', en: 'fee destination missing or not eligible (REQUIRED, NOT_FOUND, NOT_ACTIVE, KYB_NOT_APPROVED, WALLET_UNAVAILABLE, TYPE_NOT_ALLOWED, NOT_BUSINESS_ACCOUNT)' } },
      { code: '422 SETTLEMENT_NOT_COMPLETED', note: { pt: 'a liquidação foi criada mas não concluída — repita com a mesma idempotency_key para a retomar', en: 'the settlement was created but not completed — retry with the same idempotency_key to resume it' } },
      { code: '502 UPSTREAM_ERROR / 503 SERVICE_UNAVAILABLE', note: { pt: 'falha temporária — repita com a mesma idempotency_key', en: 'temporary failure — retry with the same idempotency_key' } },
    ],
    idem: {
      pt: 'Repetir a mesma idempotency_key para a mesma origem e o mesmo beneficiário devolve (200) a liquidação já feita, sem liquidar duas vezes.',
      en: 'Replaying the same idempotency_key for the same source and beneficiary returns (200) the settlement already made, without settling twice.',
    },
  },
  {
    id: 'ref-pl-get',
    method: 'GET',
    path: '/v1/payment-links/{id}',
    tone: 'ok',
    desc: {
      pt: 'Consulta um link de pagamento pelo id devolvido na criação — não pelo slug público (um slug responde 404). refund_source só é devolvido à sessão do merchant titular, nunca a uma chave de projeto.',
      en: 'Fetches a payment link by the id returned at creation — not by its public slug (a slug answers 404). refund_source is returned only to the owning merchant session, never to a project key.',
    },
    credential: {
      pt: 'Chave de projeto (scope payment_links:read, projeto com configuração financeira concluída) ou credencial de merchant',
      en: 'Project key (payment_links:read scope, project with completed financial setup) or merchant credential',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '401 UNAUTHORIZED', note: { pt: 'credencial inválida', en: 'invalid credential' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_links:read, ou projeto sem configuração financeira concluída', en: 'key without payment_links:read, or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'link inexistente, id mal formado ou link de outro projeto — indistinguíveis', en: 'link missing, malformed id or another project’s link — indistinguishable' } },
    ],
  },
  {
    id: 'ref-pl-cancel',
    method: 'DELETE',
    path: '/v1/payment-links/{id}',
    tone: 'ok',
    desc: {
      pt: 'Cancela um link ACTIVE para que deixe de poder ser pago e devolve-o com estado CANCELLED. É assim que se fecha um link por pagar: um link só é marcado como pago por um pagamento (a rota mark-used foi retirada).',
      en: 'Cancels an ACTIVE link so it can no longer be paid and returns it with status CANCELLED. This is how an unpaid link is closed: a link is marked paid only by a payment (the mark-used route is retired).',
    },
    credential: {
      pt: 'Chave de projeto (scope payment_links:write, projeto com configuração financeira concluída) ou credencial de merchant',
      en: 'Project key (payment_links:write scope, project with completed financial setup) or merchant credential',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem payment_links:write — uma chave de leitura não cancela — ou projeto sem configuração financeira concluída', en: 'key without payment_links:write — a read-only key cannot cancel — or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'um link de outro projeto responde 404, indistinguível de um que não existe', en: 'another project’s link answers 404, indistinguishable from one that does not exist' } },
      { code: '422 LINK_NOT_ACTIVE', note: { pt: 'o link já foi usado, expirou ou foi cancelado', en: 'the link was already used, expired or cancelled' } },
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
      pt: 'Lista os reembolsos do titular do seu projeto, do mais recente para o mais antigo. ?source_id= restringe aos reembolsos de um pagamento; ?limit= de 1 a 100 (por omissão 20). Sem cursor.',
      en: 'Lists the refunds of your project’s owner, newest first. ?source_id= narrows to one payment’s refunds; ?limit= from 1 to 100 (default 20). No cursor.',
    },
    credential: { pt: 'Chave de projeto (scope refunds:read) ou credencial de merchant', en: 'Project key (refunds:read scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem refunds:read, ou projeto sem titular financeiro', en: 'key without refunds:read, or project without a financial owner' } },
    ],
  },
  {
    id: 'ref-refund-get',
    method: 'GET',
    path: '/v1/refunds/{id}',
    tone: 'ok',
    desc: {
      pt: 'Consulta um reembolso do titular do seu projeto. A leitura é limitada a esse titular: um reembolso de outro projeto, um id desconhecido e um id mal formado respondem o mesmo 404.',
      en: 'Fetches a refund of your project’s owner. The read is scoped to that owner: another project’s refund, an unknown id and a malformed id all answer the same 404.',
    },
    credential: { pt: 'Chave de projeto (scope refunds:read) ou credencial de merchant', en: 'Project key (refunds:read scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl https://sandbox-api.banzami.com/v1/refunds/rfnd_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem refunds:read, ou projeto sem titular financeiro', en: 'key without refunds:read, or project without a financial owner' } },
      { code: '404 NOT_FOUND', note: { pt: 'reembolso inexistente ou de outro projeto', en: 'refund missing or belonging to another project' } },
    ],
  },
  {
    id: 'ref-handle-resolve',
    method: 'GET',
    path: '/v1/consumers/handle/{handle}',
    tone: 'ok',
    desc: {
      pt: 'Confirma que um @banza de consumidor existe antes de o indicar como destino. Devolve só o handle e o nome apresentado — nenhum id, carteira ou saldo. Aceita o @ inicial e maiúsculas. Um @banza de negócio responde 404 aqui.',
      en: 'Confirms a consumer @banza exists before you name it as a destination. Returns only the handle and display name — no id, wallet or balance. Accepts a leading @ and upper case. A business @banza answers 404 here.',
    },
    credential: {
      pt: 'Chave de projeto (scope customers:read; não exige configuração financeira) ou credencial de merchant',
      en: 'Project key (customers:read scope; no financial setup required) or merchant credential',
    },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl https://sandbox-api.banzami.com/v1/consumers/handle/cliente_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    response: `{
  "handle": "cliente_exemplo",
  "display_name": "Cliente Exemplo"
}`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE', note: { pt: 'chave sem customers:read', en: 'key without customers:read' } },
      { code: '404 NOT_FOUND', note: { pt: 'nenhum consumidor tem este handle', en: 'no consumer holds this handle' } },
    ],
  },
  {
    id: 'ref-webhook-list',
    method: 'GET',
    path: '/v1/webhooks/endpoints',
    tone: 'ok',
    desc: {
      pt: 'Lista todos os endpoints do titular do seu projeto, do mais recente para o mais antigo, incluindo os desativados (active: false). O segredo nunca é incluído.',
      en: 'Lists every endpoint of your project’s owner, newest first, including deactivated ones (active: false). The secret is never included.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:read) ou credencial de merchant', en: 'Project key (webhooks:read scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed financial setup' } },
    ],
  },
  {
    id: 'ref-webhook-get',
    method: 'GET',
    path: '/v1/webhooks/endpoints/{id}',
    tone: 'ok',
    desc: {
      pt: 'Consulta um endpoint do seu projeto, sem o segredo.',
      en: 'Fetches one of your project’s endpoints, without its secret.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:read) ou credencial de merchant', en: 'Project key (webhooks:read scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl https://sandbox-api.banzami.com/v1/webhooks/endpoints/whep_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'um endpoint de outro projeto responde 404', en: 'another project’s endpoint answers 404' } },
    ],
  },
  {
    id: 'ref-webhook-deactivate',
    method: 'DELETE',
    path: '/v1/webhooks/endpoints/{id}',
    tone: 'ok',
    desc: {
      pt: 'Desativa um endpoint: deixa de receber eventos, mas é conservado para auditoria e continua listado com active: false. Responde 204 sem corpo, também se já estava desativado.',
      en: 'Deactivates an endpoint: it stops receiving events but is kept for audit and still listed with active: false. Answers 204 with no body, also when it was already inactive.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:write) ou credencial de merchant', en: 'Project key (webhooks:write scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
    curl: `curl -X DELETE https://sandbox-api.banzami.com/v1/webhooks/endpoints/whep_exemplo \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"`,
    errors: [
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'um endpoint de outro projeto responde 404', en: 'another project’s endpoint answers 404' } },
    ],
  },
  {
    id: 'ref-webhook-health',
    method: 'GET',
    path: '/v1/webhooks/endpoints/{id}/health',
    tone: 'ok',
    desc: {
      pt: 'Entregas ao endpoint criadas nas últimas 24 horas, por resultado, e a taxa de sucesso.',
      en: 'Deliveries to the endpoint created in the last 24 hours, by outcome, and the success rate.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:read) ou credencial de merchant', en: 'Project key (webhooks:read scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'um endpoint de outro projeto responde 404', en: 'another project’s endpoint answers 404' } },
    ],
  },
  {
    id: 'ref-webhook-rotate',
    method: 'POST',
    path: '/v1/webhooks/endpoints/{id}/rotate-secret',
    tone: 'ok',
    desc: {
      pt: 'Emite um novo segredo de assinatura e devolve-o uma única vez, nesta resposta. A troca é imediata: a entrega seguinte já é assinada com o novo segredo — atualize o recetor antes de rodar. Sem corpo no pedido.',
      en: 'Issues a new signing secret and returns it exactly once, in this response. The cutover is immediate: the next delivery is signed with the new secret — update your receiver before rotating. No request body.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:write) ou credencial de merchant', en: 'Project key (webhooks:write scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'um endpoint de outro projeto responde 404', en: 'another project’s endpoint answers 404' } },
    ],
  },
  {
    id: 'ref-webhook-events',
    method: 'GET',
    path: '/v1/webhooks/events',
    tone: 'ok',
    desc: {
      pt: 'Lista os eventos emitidos para o titular do seu projeto, do mais recente para o mais antigo, tenham ou não chegado a um endpoint. ?limit= de 1 a 100 (por omissão 20). Sem cursor.',
      en: 'Lists the events emitted for your project’s owner, newest first, whether or not they reached an endpoint. ?limit= from 1 to 100 (default 20). No cursor.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:read) ou credencial de merchant', en: 'Project key (webhooks:read scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
        "data": { "session_id": "psess_exemplo", "amount_minor": 25000, "currency": "AOA" }
      },
      "created_at": "2026-07-11T11:50:00Z"
    }
  ]
}`,
    errors: [
      { code: '400 INVALID_PARAM', note: { pt: 'limit fora de 1–100', en: 'limit outside 1–100' } },
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed financial setup' } },
    ],
  },
  {
    id: 'ref-webhook-deliveries',
    method: 'GET',
    path: '/v1/webhooks/events/{id}/deliveries',
    tone: 'ok',
    desc: {
      pt: 'Histórico de entrega de um evento: uma entrega por endpoint, com todas as tentativas (a mais antiga primeiro), o código HTTP e a resposta do recetor.',
      en: 'Delivery history of one event: one delivery per endpoint, with every attempt (oldest first), the HTTP status and the receiver’s response.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:read) ou credencial de merchant', en: 'Project key (webhooks:read scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:read, ou projeto sem configuração financeira concluída', en: 'key without webhooks:read, or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'um evento de outro projeto responde 404, não uma lista vazia', en: 'another project’s event answers 404, not an empty list' } },
    ],
  },
  {
    id: 'ref-webhook-replay',
    method: 'POST',
    path: '/v1/webhooks/deliveries/{id}/replay',
    tone: 'ok',
    desc: {
      pt: 'Volta a pôr uma entrega na fila como PENDING, com o mesmo id: uma entrega por evento e endpoint, por isso repetir é mais uma tentativa, nunca uma segunda entrega. Para recuperar após uma falha do seu endpoint. Uma entrega que já teve sucesso responde 409 — não é enviada de novo. Sem corpo no pedido.',
      en: 'Puts a delivery back in the queue as PENDING, keeping its id: one delivery per event and endpoint, so a replay is a further attempt, never a second delivery. For recovery after your endpoint failed. A delivery that already succeeded answers 409 — it is not sent again. No request body.',
    },
    credential: { pt: 'Chave de projeto (scope webhooks:write) ou credencial de merchant', en: 'Project key (webhooks:write scope) or merchant credential' },
    headers: ['Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX'],
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
      { code: '403 INSUFFICIENT_SCOPE / PAYMENTS_UNAVAILABLE', note: { pt: 'chave sem webhooks:write, ou projeto sem configuração financeira concluída', en: 'key without webhooks:write, or project without completed financial setup' } },
      { code: '404 NOT_FOUND', note: { pt: 'uma entrega de outro projeto responde 404', en: 'another project’s delivery answers 404' } },
      { code: '409 DELIVERY_ALREADY_SUCCEEDED', note: { pt: 'a entrega já teve sucesso — reentregue só as que falharam', en: 'the delivery already succeeded — replay only failed ones' } },
    ],
  },
  {
    id: 'ref-public-proof',
    method: 'GET',
    path: '/v1/public/proofs/{ref}',
    tone: 'ok',
    desc: {
      pt: 'Verifica um comprovativo pela sua referência pública BZM-…, sem autenticação. É a mesma verificação da página banzami.com/r/{ref}. A referência é exacta, sem normalização: minúsculas, espaços ou um hífen a mais respondem 404. Quem tem a referência vê o montante, os @banza das partes e a descrição — trate-a como o próprio comprovativo. Um 404 responde { exists: false, status: NOT_FOUND } — não existe, ou foi alterada; um 503 responde { exists: false, status: UNAVAILABLE } — tente mais tarde, e não conclua que é falso.',
      en: 'Verifies a receipt by its public BZM-… reference, with no authentication. It is the same check as the banzami.com/r/{ref} page. The reference is exact, with no normalisation: lower case, spaces or an extra hyphen answer 404. Whoever holds the reference sees the amount, both parties’ @banza and the description — treat it like the receipt itself. A 404 answers { exists: false, status: NOT_FOUND } — it does not exist, or was altered; a 503 answers { exists: false, status: UNAVAILABLE } — try later, and do not conclude it is forged.',
    },
    credential: { pt: 'Nenhuma — rota pública, com limite por IP', en: 'None — a public route, rate-limited per IP' },
    headers: [],
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
      { code: '429 RATE_LIMITED', note: { pt: 'demasiadas verificações do mesmo IP — espere o Retry-After', en: 'too many checks from the same IP — wait for Retry-After' } },
    ],
  },
];

// Compact rows for surfaces that exist but are NOT public-key callable today.
export const RESTRICTED_ROWS: { path: string; status: Bi }[] = [
  { path: 'GET /v1/application-settlements/{id}', status: { pt: 'Apenas credencial de merchant — uma chave de projeto recebe 401 e não há scope de leitura de liquidações; guarde o corpo devolvido por POST /v1/application-settlements', en: 'Merchant credential only — a project key receives 401 and there is no settlement read scope; keep the body POST /v1/application-settlements returns' } },
  { path: 'GET /v1/integration', status: { pt: 'Apenas sessão de merchant — uma chave de projeto recebe sempre 403 USE_FINANCIAL_SETUP; um projeto lê a sua prontidão em GET /v1/financial-setup', en: 'Merchant session only — a project key always receives 403 USE_FINANCIAL_SETUP; a project reads its readiness from GET /v1/financial-setup' } },
  { path: 'POST /v1/payment-links/{id}/mark-used', status: { pt: 'Retirado — responde 410 ROUTE_RETIRED a qualquer credencial. Um link só é marcado como pago por um pagamento; para fechar um link por pagar, use DELETE /v1/payment-links/{id}', en: 'Retired — answers 410 ROUTE_RETIRED to every credential. A link is marked paid only by a payment; to close an unpaid link, DELETE /v1/payment-links/{id}' } },
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
