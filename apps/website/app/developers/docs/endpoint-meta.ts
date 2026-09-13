// The contract half of each endpoint in the API reference: scope, parameters
// (where they go, their type, whether they are required, what they accept), the
// SDK method that calls it, the events it causes, and the guides that use it.
//
// reference.tsx holds the prose half (what the endpoint is for, the curl, the
// response and its errors). They are joined by id. tools/check-docs-api-reference.mjs
// reads both and holds this file to the gateway: the scope is the one the handler
// demands, every body field is one the handler decodes, every query parameter is
// one it reads, every path parameter is in the path, the SDK method exists in
// @banzami/sdk, and every event is one the operator emits. An endpoint without
// one of these fields fails the check; so does a field the gateway never reads.

export type Bi = { pt: string; en: string };

export type ParamIn = 'path' | 'query' | 'header' | 'body';

export type Param = {
  in: ParamIn;
  name: string;
  type: string;
  /** true, false, or 'conditional' when the note says when it is required. */
  required: boolean | 'conditional';
  note: Bi;
  example?: string;
};

export type EndpointMeta = {
  /** The scope a project key needs; null only for a public route. */
  scope: string | null;
  params: Param[];
  /** The @banzami/sdk method; null when there is none, with sdkNote saying what to do instead. */
  sdk: string | null;
  sdkNote?: Bi;
  /** Events this call can cause. Empty when it causes none. */
  events: string[];
  /** Documentation pages that use this endpoint, by slug. At least one. */
  guides: string[];
  /** Body fields a project key must NOT send (the gateway refuses them). */
  refused?: string[];
};

const AUTH: Param = {
  in: 'header', name: 'Authorization', type: 'string', required: true,
  note: { pt: 'a chave secreta do projeto, depois de Bearer', en: 'the project secret key, after Bearer' },
  example: 'Bearer bz_test_sk_XXXXXXXXXXXXXXXX',
};

const IDEM_HEADER: Param = {
  in: 'header', name: 'Idempotency-Key', type: 'string', required: false,
  note: {
    pt: 'recomendado: a mesma chave reproduz a resposta original durante 24 h, e um corpo diferente com a mesma chave responde 409',
    en: 'recommended: the same key replays the original response for 24 h, and a different body with the same key returns 409',
  },
  example: 'idem_pedido_123',
};

const IDEM_HEADER_WITH_BODY_KEY: Param = {
  ...IDEM_HEADER,
  note: {
    pt: 'opcional aqui: o que protege o movimento de dinheiro é o idempotency_key do corpo',
    en: 'optional here: what protects the money movement is the body idempotency_key',
  },
};

const pathId = (what: Bi, example: string): Param => ({
  in: 'path', name: 'id', type: 'string (uuid)', required: true, note: what, example,
});

const PAYEE_REFUSED = ['merchant_id', 'wallet_id', 'payee', 'payee_id', 'payee_wallet'];

export const ENDPOINT_META: Record<string, EndpointMeta> = {
  'ref-me': {
    scope: 'identity:read',
    params: [AUTH],
    sdk: 'me',
    events: [],
    guides: ['get-started', 'testing'],
  },
  'ref-financial-setup': {
    scope: 'identity:read',
    params: [
      AUTH,
      { in: 'query', name: 'fee_destination', type: 'string', required: false,
        note: { pt: 'um @banza do seu Business, para confirmar que pode receber a taxa de uma liquidação', en: 'an @banza of your Business, to confirm it can receive a settlement fee' },
        example: '@meu-negocio' },
    ],
    sdk: 'getFinancialSetup',
    events: [],
    guides: ['get-started', 'settlements', 'going-live'],
  },
  'ref-ps-create': {
    scope: 'payment_sessions:write',
    params: [
      AUTH, IDEM_HEADER,
      { in: 'body', name: 'amount_minor', type: 'integer', required: false,
        note: { pt: 'unidades menores: 100 = 1 Kz. Positivo. Omitido, a sessão é de montante aberto e o QR é STATIC_QR', en: 'minor units: 100 = 1 Kz. Positive. Omitted, the session is open-amount and its QR is STATIC_QR' },
        example: '25000' },
      { in: 'body', name: 'currency', type: 'string', required: false,
        note: { pt: 'AOA. Por omissão, a moeda da conta que recebe; outra moeda responde 400', en: 'AOA. Defaults to the receiving account’s currency; another currency returns 400' },
        example: 'AOA' },
      { in: 'body', name: 'purpose', type: 'string (enum)', required: false,
        note: { pt: 'GENERIC (por omissão), DONATION, ORDER, TICKET, STORE, EVENT, CAMPAIGN ou CUSTOM', en: 'GENERIC (default), DONATION, ORDER, TICKET, STORE, EVENT, CAMPAIGN or CUSTOM' },
        example: 'ORDER' },
      { in: 'body', name: 'reference_type', type: 'string', required: false,
        note: { pt: 'o tipo da sua referência; devolvido nos eventos', en: 'the kind of your reference; returned in events' },
        example: 'PEDIDO' },
      { in: 'body', name: 'reference_id', type: 'string', required: false,
        note: { pt: 'a sua referência. Uma sessão por purpose + reference: repetir a mesma devolve a sessão existente (200), mesmo com outro montante', en: 'your reference. One session per purpose + reference: sending the same one again returns the existing session (200), even with another amount' },
        example: 'pedido_123' },
      { in: 'body', name: 'description', type: 'string', required: false,
        note: { pt: 'mostrada ao pagador', en: 'shown to the payer' }, example: 'Pedido #123' },
      { in: 'body', name: 'wallet_account_id', type: 'string (uuid)', required: false,
        note: { pt: 'a conta do projeto que recebe o pagamento. Omitido, a conta principal. Uma conta de outro projeto responde 404', en: 'the project account that receives the payment. Omitted, the main account. Another project’s account returns 404' },
        example: 'wacc_exemplo' },
      { in: 'body', name: 'expires_at', type: 'string (RFC 3339)', required: false,
        note: { pt: 'quando a sessão deixa de poder ser paga', en: 'when the session can no longer be paid' }, example: '2026-07-11T12:00:00Z' },
      { in: 'body', name: 'metadata', type: 'object', required: false,
        note: { pt: 'merchant_reference (até 64 caracteres) e display_context (até 120) aparecem no comprovativo; valores inválidos respondem 400 INVALID_METADATA', en: 'merchant_reference (up to 64 characters) and display_context (up to 120) appear on the receipt; invalid values answer 400 INVALID_METADATA' } },
    ],
    refused: PAYEE_REFUSED,
    sdk: 'createPaymentSession',
    events: ['payment_session.created', 'payment_session.paid'],
    guides: ['get-started', 'payments', 'doa'],
  },
  'ref-ps-get': {
    scope: 'payment_sessions:read',
    params: [AUTH, pathId({ pt: 'o session_id devolvido na criação', en: 'the session_id returned at creation' }, 'psess_exemplo')],
    sdk: 'getPaymentSession',
    events: [],
    guides: ['payments', 'get-started'],
  },
  'ref-ps-list': {
    scope: 'payment_sessions:read',
    params: [
      AUTH,
      { in: 'query', name: 'status', type: 'string', required: false,
        note: { pt: 'filtra por estado, por exemplo ACTIVE ou PAID', en: 'filters by status, for example ACTIVE or PAID' }, example: 'PAID' },
      { in: 'query', name: 'limit', type: 'integer', required: false,
        note: { pt: '1 a 200, por omissão 50; fora do intervalo usa 50', en: '1 to 200, default 50; out of range uses 50' }, example: '20' },
    ],
    sdk: 'listPaymentSessions',
    events: [],
    guides: ['payments'],
  },
  'ref-ps-link': {
    scope: 'payment_sessions:read',
    params: [AUTH, pathId({ pt: 'o session_id', en: 'the session_id' }, 'psess_exemplo')],
    sdk: null,
    sdkNote: {
      pt: 'Sem método próprio: o link já vem na sessão — paymentSessionInterface(sessao, \'PAYMENT_LINK\').',
      en: 'No method of its own: the link is already on the session — paymentSessionInterface(session, \'PAYMENT_LINK\').',
    },
    events: [],
    guides: ['payments'],
  },
  'ref-ps-qr': {
    scope: 'payment_sessions:read',
    params: [
      AUTH,
      pathId({ pt: 'o session_id', en: 'the session_id' }, 'psess_exemplo'),
      { in: 'query', name: 'format', type: 'string (enum)', required: false,
        note: { pt: 'png ou svg devolve a imagem; sem format, o valor em JSON; pdf responde 415', en: 'png or svg returns the image; without format, the value as JSON; pdf returns 415' }, example: 'svg' },
    ],
    sdk: null,
    sdkNote: {
      pt: 'Sem método próprio: o valor do QR já vem na sessão — paymentSessionInterface(sessao, \'DYNAMIC_QR\').',
      en: 'No method of its own: the QR value is already on the session — paymentSessionInterface(session, \'DYNAMIC_QR\').',
    },
    events: [],
    guides: ['payments'],
  },
  'ref-pl-create': {
    scope: 'payment_links:write',
    params: [
      AUTH, IDEM_HEADER,
      { in: 'body', name: 'currency', type: 'string', required: true,
        note: { pt: 'AOA', en: 'AOA' }, example: 'AOA' },
      { in: 'body', name: 'amount_minor', type: 'integer', required: false,
        note: { pt: 'unidades menores: 100 = 1 Kz. Positivo. Omitido, o link é de montante aberto', en: 'minor units: 100 = 1 Kz. Positive. Omitted, the link is open-amount' }, example: '25000' },
      { in: 'body', name: 'description', type: 'string', required: false,
        note: { pt: 'mostrada ao pagador', en: 'shown to the payer' }, example: 'Pedido #123' },
      { in: 'body', name: 'expires_at', type: 'string (RFC 3339)', required: false,
        note: { pt: 'no futuro; senão 400 INVALID_EXPIRY', en: 'in the future; otherwise 400 INVALID_EXPIRY' }, example: '2026-07-18T12:00:00Z' },
    ],
    refused: PAYEE_REFUSED,
    sdk: 'createPaymentLink',
    sdkNote: {
      pt: 'Em @banzami/sdk 0.13.0 o tipo ainda exige merchantId e walletId, que uma chave de projeto não pode enviar; até à versão seguinte, use HTTP para criar links, ou uma sessão de pagamento, que já traz o seu link.',
      en: 'In @banzami/sdk 0.13.0 the type still requires merchantId and walletId, which a project key cannot send; until the next release, create links over HTTP, or use a Payment Session, which carries its own link.',
    },
    events: ['payment_link.paid'],
    guides: ['payments'],
  },
  'ref-wacc-create': {
    scope: 'wallet_accounts:create',
    params: [
      AUTH, IDEM_HEADER,
      { in: 'body', name: 'purpose', type: 'string (enum)', required: true,
        note: { pt: 'CAMPAIGN, PROJECT, EVENT, STORE, ESCROW, RESERVE, SETTLEMENT ou CUSTOM (a PRIMARY nasce com a carteira)', en: 'CAMPAIGN, PROJECT, EVENT, STORE, ESCROW, RESERVE, SETTLEMENT or CUSTOM (PRIMARY is created with the wallet)' }, example: 'CAMPAIGN' },
      { in: 'body', name: 'reference_type', type: 'string', required: false,
        note: { pt: 'o tipo da sua referência', en: 'the kind of your reference' }, example: 'CAMPANHA' },
      { in: 'body', name: 'reference_id', type: 'string', required: false,
        note: { pt: 'a sua referência de negócio', en: 'your business reference' }, example: 'campanha_123' },
      { in: 'body', name: 'label', type: 'string', required: false,
        note: { pt: 'nome legível', en: 'human-readable name' }, example: 'Campanha 123' },
    ],
    refused: PAYEE_REFUSED,
    sdk: 'createWalletAccount',
    events: [],
    guides: ['transfers', 'doa'],
  },
  'ref-wacc-list': {
    scope: 'wallet_accounts:read',
    params: [AUTH],
    sdk: 'listWalletAccounts',
    sdkNote: { pt: 'Chame sem argumentos: com uma chave de projeto, wallet_id é recusado.', en: 'Call it with no argument: with a project key, wallet_id is refused.' },
    events: [],
    guides: ['transfers'],
  },
  'ref-wacc-get': {
    scope: 'wallet_accounts:read',
    params: [AUTH, pathId({ pt: 'o id da conta', en: 'the account id' }, 'wacc_exemplo')],
    sdk: 'getWalletAccount',
    events: [],
    guides: ['transfers'],
  },
  'ref-transfer-create': {
    scope: 'transfers:write',
    params: [
      AUTH, IDEM_HEADER_WITH_BODY_KEY,
      { in: 'body', name: 'source_wallet_account_id', type: 'string (uuid)', required: true,
        note: { pt: 'conta de origem — sua', en: 'source account — yours' }, example: 'wacc_origem' },
      { in: 'body', name: 'destination_wallet_account_id', type: 'string (uuid)', required: true,
        note: { pt: 'conta de destino — sua, e diferente da origem', en: 'destination account — yours, and not the source' }, example: 'wacc_destino' },
      { in: 'body', name: 'amount_minor', type: 'integer', required: true,
        note: { pt: 'unidades menores: 100 = 1 Kz. Positivo', en: 'minor units: 100 = 1 Kz. Positive' }, example: '50000' },
      { in: 'body', name: 'currency', type: 'string', required: true,
        note: { pt: 'AOA — a mesma das duas contas', en: 'AOA — the same as both accounts' }, example: 'AOA' },
      { in: 'body', name: 'idempotency_key', type: 'string', required: true,
        note: { pt: 'guarde-a antes do pedido; repetir com ela não move dinheiro duas vezes', en: 'store it before the request; retrying with it never moves money twice' }, example: 'idem_transferencia_123' },
      { in: 'body', name: 'description', type: 'string', required: false,
        note: { pt: 'texto livre', en: 'free text' } },
    ],
    sdk: 'createTransfer',
    events: [],
    guides: ['transfers'],
  },
  'ref-refund-create': {
    scope: 'refunds:write',
    params: [
      AUTH, IDEM_HEADER_WITH_BODY_KEY,
      { in: 'body', name: 'source_type', type: 'string (enum)', required: true,
        note: { pt: 'WALLET_PAYMENT para pagamentos de sessões e links; ACQUIRING_PAYMENT para um trilho externo', en: 'WALLET_PAYMENT for Session and Link payments; ACQUIRING_PAYMENT for an external rail' }, example: 'WALLET_PAYMENT' },
      { in: 'body', name: 'source_id', type: 'string (uuid)', required: true,
        note: { pt: 'o refund_source.source_id do evento payment_session.paid ou payment_link.paid', en: 'the refund_source.source_id from the payment_session.paid or payment_link.paid event' }, example: 'wpay_exemplo' },
      { in: 'body', name: 'amount_minor', type: 'integer', required: true,
        note: { pt: 'unidades menores. Até ao que resta reembolsar desse pagamento', en: 'minor units. Up to what is left to refund on that payment' }, example: '50000' },
      { in: 'body', name: 'currency', type: 'string', required: true,
        note: { pt: 'a moeda do pagamento', en: 'the payment’s currency' }, example: 'AOA' },
      { in: 'body', name: 'idempotency_key', type: 'string', required: true,
        note: { pt: 'uma por intenção de reembolso, guardada antes do pedido', en: 'one per refund intent, stored before the request' }, example: 'idem_reembolso_123' },
      { in: 'body', name: 'reason', type: 'string', required: false,
        note: { pt: 'texto livre', en: 'free text' } },
    ],
    sdk: 'createRefund',
    events: ['refund.completed'],
    guides: ['refunds'],
  },
  'ref-webhook-register': {
    scope: 'webhooks:write',
    params: [
      AUTH, IDEM_HEADER,
      { in: 'body', name: 'url', type: 'string (https URL)', required: true,
        note: { pt: 'https público; http, loopback e endereços privados são recusados', en: 'public https; http, loopback and private addresses are refused' }, example: 'https://www.exemplo.com/api/webhooks/banzami' },
      { in: 'body', name: 'events', type: 'string[]', required: true,
        note: { pt: 'pelo menos um evento do catálogo; um nome desconhecido responde 400 UNSUPPORTED_EVENT', en: 'at least one catalogue event; an unknown name returns 400 UNSUPPORTED_EVENT' }, example: '["payment_session.paid"]' },
    ],
    sdk: 'createWebhookEndpoint',
    events: [],
    guides: ['webhooks', 'get-started'],
  },
  'ref-settlement-create': {
    scope: 'application_settlements:write',
    params: [
      AUTH, IDEM_HEADER_WITH_BODY_KEY,
      { in: 'body', name: 'source_account_id', type: 'string (uuid)', required: true,
        note: { pt: 'uma conta segregada sua, não a PRIMARY; todo o saldo disponível é liquidado', en: 'one of your segregated accounts, not the PRIMARY; its whole available balance is settled' }, example: 'wacc_exemplo' },
      { in: 'body', name: 'beneficiary_banza_name', type: 'string', required: true,
        note: { pt: '@banza que recebe o líquido, com carteira ativa na moeda da conta', en: '@banza that receives the net, with an active wallet in the account’s currency' }, example: '@beneficiario_exemplo' },
      { in: 'body', name: 'fee_destination_banza_name', type: 'string', required: 'conditional',
        note: { pt: 'obrigatório quando o perfil de preço aplica uma taxa: um @banza do seu Business, do tipo APPLICATION ou PLATFORM', en: 'required when the pricing profile applies a fee: an @banza of your Business, of type APPLICATION or PLATFORM' }, example: '@meu-negocio' },
      { in: 'body', name: 'idempotency_key', type: 'string', required: true,
        note: { pt: 'guarde-a antes do pedido; é com ela que retoma uma liquidação não concluída', en: 'store it before the request; it is how you resume a settlement that did not complete' }, example: 'idem_liquidacao_123' },
      { in: 'body', name: 'reference_type', type: 'string', required: false,
        note: { pt: 'o tipo da sua referência', en: 'the kind of your reference' }, example: 'CAMPANHA' },
      { in: 'body', name: 'reference_id', type: 'string', required: false,
        note: { pt: 'a sua referência, devolvida como owner_ref', en: 'your reference, returned as owner_ref' }, example: 'campanha_123' },
      { in: 'body', name: 'reason', type: 'string', required: false,
        note: { pt: 'devolvida como owner_ref quando não há reference_id', en: 'returned as owner_ref when there is no reference_id' } },
    ],
    sdk: 'createBusinessApplicationSettlement',
    events: ['application_settlement.completed'],
    guides: ['settlements', 'doa'],
  },
  'ref-pl-list': {
    scope: 'payment_links:read',
    params: [
      AUTH,
      { in: 'query', name: 'limit', type: 'integer', required: false,
        note: { pt: '1 a 100, por omissão 20; fora do intervalo responde 400 INVALID_PARAM', en: '1 to 100, default 20; out of range returns 400 INVALID_PARAM' }, example: '20' },
      { in: 'query', name: 'cursor', type: 'string', required: false,
        note: { pt: 'o next_cursor da página anterior, tal como veio', en: 'the previous page’s next_cursor, unchanged' } },
    ],
    sdk: 'listPaymentLinks',
    sdkNote: {
      pt: 'Em @banzami/sdk 0.13.0 o tipo ainda exige merchantId, que uma chave de projeto não tem; até à versão seguinte, liste por HTTP.',
      en: 'In @banzami/sdk 0.13.0 the type still requires merchantId, which a project key does not have; until the next release, list over HTTP.',
    },
    events: [],
    guides: ['payments'],
  },
  'ref-pl-get': {
    scope: 'payment_links:read',
    params: [AUTH, pathId({ pt: 'o id do link — não o slug', en: 'the link id — not the slug' }, 'plink_exemplo')],
    sdk: 'getPaymentLink',
    events: [],
    guides: ['payments'],
  },
  'ref-pl-cancel': {
    scope: 'payment_links:write',
    params: [AUTH, IDEM_HEADER, pathId({ pt: 'o id do link', en: 'the link id' }, 'plink_exemplo')],
    sdk: 'cancelPaymentLink',
    events: [],
    guides: ['payments'],
  },
  'ref-refund-list': {
    scope: 'refunds:read',
    params: [
      AUTH,
      { in: 'query', name: 'source_id', type: 'string (uuid)', required: false,
        note: { pt: 'só os reembolsos deste pagamento', en: 'only this payment’s refunds' }, example: 'wpay_exemplo' },
      { in: 'query', name: 'limit', type: 'integer', required: false,
        note: { pt: '1 a 100, por omissão 20', en: '1 to 100, default 20' }, example: '20' },
    ],
    sdk: 'listRefunds',
    events: [],
    guides: ['refunds'],
  },
  'ref-refund-get': {
    scope: 'refunds:read',
    params: [AUTH, pathId({ pt: 'o id do reembolso', en: 'the refund id' }, 'rfnd_exemplo')],
    sdk: 'getRefund',
    events: [],
    guides: ['refunds'],
  },
  'ref-handle-resolve': {
    scope: 'customers:read',
    params: [
      AUTH,
      { in: 'path', name: 'handle', type: 'string', required: true,
        note: { pt: 'o @banza de um consumidor, com ou sem @', en: 'a consumer @banza, with or without @' }, example: 'cliente_exemplo' },
    ],
    sdk: 'resolveHandle',
    events: [],
    guides: ['settlements'],
  },
  'ref-webhook-list': {
    scope: 'webhooks:read',
    params: [AUTH],
    sdk: 'listWebhookEndpoints',
    events: [],
    guides: ['webhooks'],
  },
  'ref-webhook-get': {
    scope: 'webhooks:read',
    params: [AUTH, pathId({ pt: 'o id do endpoint', en: 'the endpoint id' }, 'whep_exemplo')],
    sdk: 'getWebhookEndpoint',
    events: [],
    guides: ['webhooks'],
  },
  'ref-webhook-deactivate': {
    scope: 'webhooks:write',
    params: [AUTH, IDEM_HEADER, pathId({ pt: 'o id do endpoint', en: 'the endpoint id' }, 'whep_exemplo')],
    sdk: 'deactivateWebhookEndpoint',
    events: [],
    guides: ['webhooks'],
  },
  'ref-webhook-health': {
    scope: 'webhooks:read',
    params: [AUTH, pathId({ pt: 'o id do endpoint', en: 'the endpoint id' }, 'whep_exemplo')],
    sdk: 'endpointHealth',
    events: [],
    guides: ['webhooks', 'troubleshooting'],
  },
  'ref-webhook-rotate': {
    scope: 'webhooks:write',
    params: [AUTH, IDEM_HEADER, pathId({ pt: 'o id do endpoint', en: 'the endpoint id' }, 'whep_exemplo')],
    sdk: 'rotateWebhookEndpointSecret',
    events: [],
    guides: ['webhooks', 'trust'],
  },
  'ref-webhook-events': {
    scope: 'webhooks:read',
    params: [
      AUTH,
      { in: 'query', name: 'limit', type: 'integer', required: false,
        note: { pt: '1 a 100, por omissão 20', en: '1 to 100, default 20' }, example: '20' },
    ],
    sdk: 'listWebhookEvents',
    events: [],
    guides: ['webhooks', 'events'],
  },
  'ref-webhook-deliveries': {
    scope: 'webhooks:read',
    params: [AUTH, pathId({ pt: 'o id do evento', en: 'the event id' }, 'whevt_exemplo')],
    sdk: 'listWebhookDeliveries',
    events: [],
    guides: ['webhooks', 'troubleshooting'],
  },
  'ref-webhook-replay': {
    scope: 'webhooks:write',
    params: [AUTH, IDEM_HEADER, pathId({ pt: 'o id da entrega', en: 'the delivery id' }, 'whdel_exemplo')],
    sdk: 'replayWebhookDelivery',
    events: [],
    guides: ['webhooks', 'testing'],
  },
  'ref-public-proof': {
    scope: null,
    params: [
      { in: 'path', name: 'ref', type: 'string', required: true,
        note: { pt: 'a referência BZM-… exata, sem normalização', en: 'the exact BZM-… reference, with no normalisation' }, example: 'BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX' },
    ],
    sdk: null,
    sdkNote: {
      pt: 'Sem método: é uma verificação pública, sem chave — qualquer cliente HTTP, ou a página banzami.com/r/{ref}.',
      en: 'No method: it is a public check with no key — any HTTP client, or the banzami.com/r/{ref} page.',
    },
    events: [],
    guides: ['receipts'],
  },
};
