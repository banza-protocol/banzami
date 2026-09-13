// The public webhook event reference — one entry per event the operator emits,
// and only those. Each entry says when the event fires, which fields of `data`
// are part of the contract, what to do on receipt, how to deduplicate, what
// ordering to expect, and where the related resource is documented.
//
// The field lists are read from the emitters named in `source`, and
// tools/check-webhook-event-catalogue.mjs holds them there: every documented
// field must be a key the emitter writes, every event must be emitted, and every
// emitted event must be here with all of its required parts.
//
// Some payloads carry more than is listed — owner and ledger identifiers written
// for the operator's own audit. They are deliberately left out: they are not
// part of the contract, and an integration must not depend on them.

export type Bi = { pt: string; en: string };

export type EventField = { name: string; type: string; note: Bi };

export type EventDoc = {
  name: string;
  /** Emitter file(s) the fields are read from. */
  source: string[];
  resource: Bi;
  /** Reference anchor of the endpoint that creates the resource. */
  endpoint: string;
  when: Bi;
  fields: EventField[];
  action: Bi;
  dedupe: Bi;
  ordering: Bi;
  /** Can a developer cause this in the Sandbox without anyone at Banzami? */
  sandbox: Bi;
  doa: Bi | null;
  guide: string;
  sample: string;
};

const ENVELOPE_ID: Bi = {
  pt: 'Guarde o id do envelope (evt_…) e ignore um id que já processou — a entrega é at-least-once.',
  en: 'Store the envelope id (evt_…) and ignore an id you already processed — delivery is at-least-once.',
};

export const EVENT_DOCS: EventDoc[] = [
  {
    name: 'payment_session.created',
    source: ['core/api/src/routes/payment_sessions.rs'],
    resource: { pt: 'Sessão de pagamento', en: 'Payment Session' },
    endpoint: 'ref-ps-create',
    when: {
      pt: 'Quando uma sessão nova é criada. Não é emitido quando o mesmo purpose + reference devolve uma sessão que já existia.',
      en: 'When a new session is created. Not emitted when the same purpose + reference returns a session that already existed.',
    },
    fields: [
      { name: 'payment_session_id', type: 'string (uuid)', note: { pt: 'o session_id da sessão', en: 'the session’s session_id' } },
      { name: 'destination_account_ref', type: 'string (uuid)', note: { pt: 'a sua conta onde o pagamento vai cair', en: 'your account the payment will land in' } },
      { name: 'amount_minor', type: 'integer | null', note: { pt: 'unidades menores (100 = 1 Kz); null numa sessão de montante aberto', en: 'minor units (100 = 1 Kz); null for an open-amount session' } },
      { name: 'currency', type: 'string', note: { pt: 'AOA', en: 'AOA' } },
      { name: 'purpose', type: 'string', note: { pt: 'o purpose da sessão', en: 'the session purpose' } },
      { name: 'reference_type', type: 'string | null', note: { pt: 'a sua referência, tal como a enviou', en: 'your reference, as you sent it' } },
      { name: 'reference_id', type: 'string | null', note: { pt: 'a sua referência, tal como a enviou', en: 'your reference, as you sent it' } },
      { name: 'interfaces', type: 'string[]', note: { pt: 'PAYMENT_LINK e, com montante fixo, DYNAMIC_QR', en: 'PAYMENT_LINK and, with a fixed amount, DYNAMIC_QR' } },
    ],
    action: {
      pt: 'Opcional. A resposta de createPaymentSession já lhe deu tudo isto; use o evento só se outro sistema seu precisa de saber que a sessão existe.',
      en: 'Optional. The createPaymentSession response already gave you all of this; use the event only if another system of yours needs to know the session exists.',
    },
    dedupe: ENVELOPE_ID,
    ordering: {
      pt: 'Sem garantia de ordem: pode chegar depois de payment_session.paid da mesma sessão. Nunca trate «created depois de paid» como regressão.',
      en: 'No ordering guarantee: it can arrive after payment_session.paid for the same session. Never treat "created after paid" as a regression.',
    },
    sandbox: { pt: 'Sim — criar uma sessão.', en: 'Yes — create a session.' },
    doa: null,
    guide: 'payments',
    sample: `{
  "id": "evt_exemplo_1",
  "type": "payment_session.created",
  "created_at": "2026-07-11T11:45:00Z",
  "data": {
    "payment_session_id": "psess_exemplo",
    "destination_account_ref": "wacc_exemplo",
    "amount_minor": 25000,
    "currency": "AOA",
    "purpose": "ORDER",
    "reference_type": "PEDIDO",
    "reference_id": "pedido_123",
    "interfaces": ["PAYMENT_LINK", "DYNAMIC_QR"]
  }
}`,
  },
  {
    name: 'payment_session.paid',
    source: ['core/api/src/routes/payment_sessions.rs'],
    resource: { pt: 'Sessão de pagamento', en: 'Payment Session' },
    endpoint: 'ref-ps-get',
    when: {
      pt: 'Quando o pagador paga a sessão e o dinheiro fica na sua conta — no mesmo instante em que a sessão passa a PAID.',
      en: 'When the payer pays the session and the money is in your account — at the same moment the session becomes PAID.',
    },
    fields: [
      { name: 'payment_session_id', type: 'string (uuid)', note: { pt: 'a sessão que foi paga', en: 'the session that was paid' } },
      { name: 'amount_minor', type: 'integer', note: { pt: 'o que foi pago, em unidades menores', en: 'what was paid, in minor units' } },
      { name: 'interface', type: 'string', note: { pt: 'por onde pagou; hoje PAYMENT_LINK — o QR abre o mesmo link', en: 'how it was paid; today PAYMENT_LINK — the QR opens the same link' } },
      { name: 'destination_account_ref', type: 'string (uuid)', note: { pt: 'a sua conta que recebeu', en: 'your account that received it' } },
      { name: 'reference_type', type: 'string | null', note: { pt: 'a sua referência', en: 'your reference' } },
      { name: 'reference_id', type: 'string | null', note: { pt: 'a sua referência — é por ela que liga o pagamento à sua encomenda', en: 'your reference — how you tie the payment to your order' } },
      { name: 'transfer_id', type: 'string (uuid)', note: { pt: 'presente quando pagou com uma carteira Banzami (o caso do Sandbox)', en: 'present when paid from a Banzami wallet (the Sandbox case)' } },
      { name: 'acquiring_payment_id', type: 'string (uuid)', note: { pt: 'presente, em vez de transfer_id, quando pagou por um trilho externo — indisponível no Sandbox', en: 'present, instead of transfer_id, when paid through an external rail — unavailable in the Sandbox' } },
      { name: 'refund_source', type: 'object | null', note: { pt: '{ source_type, source_id } — o que envia a createRefund para devolver este pagamento; null num trilho externo', en: '{ source_type, source_id } — what you send to createRefund to return this payment; null for an external rail' } },
    ],
    action: {
      pt: 'Verifique a assinatura, deduplique pelo id, e marque a encomenda de reference_id como paga. Guarde refund_source se pode vir a reembolsar.',
      en: 'Verify the signature, deduplicate by id, and mark the order in reference_id as paid. Keep refund_source if you may refund later.',
    },
    dedupe: {
      pt: 'Pelo id do envelope. Um pagamento feito pelo link também emite payment_link.paid: confirme a encomenda uma única vez, venha pelo evento que vier.',
      en: 'By the envelope id. A payment made through the link also emits payment_link.paid: confirm the order once, whichever event brings it.',
    },
    ordering: {
      pt: 'Sem garantia de ordem em relação a payment_session.created e payment_link.paid.',
      en: 'No ordering guarantee relative to payment_session.created and payment_link.paid.',
    },
    sandbox: {
      pt: 'Precisa de um pagador com uma carteira Banzami no Sandbox — ver Testar no Sandbox.',
      en: 'Needs a payer with a Banzami wallet in the Sandbox — see Sandbox testing.',
    },
    doa: {
      pt: 'É a confirmação da doação: o DOA lê reference_id, que é o id da intenção de doação que deu ao criar a sessão.',
      en: 'It is the donation confirmation: DOA reads reference_id, the donation intent id it gave when creating the session.',
    },
    guide: 'payments',
    sample: `{
  "id": "evt_exemplo_2",
  "type": "payment_session.paid",
  "created_at": "2026-07-11T11:46:02Z",
  "data": {
    "payment_session_id": "psess_exemplo",
    "transfer_id": "trf_exemplo",
    "amount_minor": 25000,
    "interface": "PAYMENT_LINK",
    "destination_account_ref": "wacc_exemplo",
    "reference_type": "PEDIDO",
    "reference_id": "pedido_123",
    "refund_source": { "source_type": "WALLET_PAYMENT", "source_id": "wpay_exemplo" }
  }
}`,
  },
  {
    name: 'payment_link.paid',
    source: ['core/api/src/routes/payment_links.rs'],
    resource: { pt: 'Link de pagamento', en: 'Payment Link' },
    endpoint: 'ref-pl-get',
    when: {
      pt: 'Quando um link é pago — um link criado por si, ou o link de uma sessão de pagamento.',
      en: 'When a link is paid — a link you created, or the link behind a Payment Session.',
    },
    fields: [
      { name: 'id', type: 'string (uuid)', note: { pt: 'o id do link (o de getPaymentLink)', en: 'the link id (the one getPaymentLink takes)' } },
      { name: 'slug', type: 'string', note: { pt: 'o slug público, o último segmento de pay.banzami.com/pay/…', en: 'the public slug, the last segment of pay.banzami.com/pay/…' } },
      { name: 'wallet_account_id', type: 'string (uuid) | null', note: { pt: 'a sua conta que recebeu', en: 'your account that received it' } },
      { name: 'amount_minor', type: 'integer | null', note: { pt: 'o montante do link, em unidades menores; null num link de montante aberto', en: 'the link amount, in minor units; null for an open-amount link' } },
      { name: 'currency', type: 'string', note: { pt: 'AOA', en: 'AOA' } },
      { name: 'description', type: 'string | null', note: { pt: 'a descrição do link', en: 'the link description' } },
      { name: 'status', type: 'string', note: { pt: 'o estado do link depois de pago', en: 'the link status after payment' } },
      { name: 'paid_at', type: 'string (RFC 3339)', note: { pt: 'quando foi pago, em UTC', en: 'when it was paid, in UTC' } },
      { name: 'expires_at', type: 'string | null', note: { pt: 'a validade do link', en: 'the link expiry' } },
      { name: 'created_at', type: 'string (RFC 3339)', note: { pt: 'quando o link foi criado', en: 'when the link was created' } },
      { name: 'updated_at', type: 'string (RFC 3339)', note: { pt: 'a última alteração do link', en: 'the link’s last change' } },
      { name: 'refund_source', type: 'object', note: { pt: '{ source_type, source_id } quando pagou com uma carteira Banzami; ausente num trilho externo', en: '{ source_type, source_id } when paid from a Banzami wallet; absent for an external rail' } },
    ],
    action: {
      pt: 'Verifique, deduplique, e marque como pago o que associou ao id ou ao slug do link. Se o link é de uma sessão, prefira confirmar por payment_session.paid, que traz a sua reference_id.',
      en: 'Verify, deduplicate, and mark as paid what you tied to the link id or slug. If the link belongs to a session, prefer confirming through payment_session.paid, which carries your reference_id.',
    },
    dedupe: {
      pt: 'Pelo id do envelope; o link só é pago uma vez.',
      en: 'By the envelope id; a link is paid only once.',
    },
    ordering: {
      pt: 'Sem garantia de ordem em relação a payment_session.paid.',
      en: 'No ordering guarantee relative to payment_session.paid.',
    },
    sandbox: {
      pt: 'Precisa de um pagador com uma carteira Banzami no Sandbox — ver Testar no Sandbox.',
      en: 'Needs a payer with a Banzami wallet in the Sandbox — see Sandbox testing.',
    },
    doa: {
      pt: 'O DOA também o consome: guarda o slug do link ao criar a sessão e confirma a doação por ele, uma única vez, venha por este evento ou por payment_session.paid.',
      en: 'DOA consumes it too: it stores the link slug when it creates the session and confirms the donation by it, once, whether through this event or payment_session.paid.',
    },
    guide: 'payments',
    sample: `{
  "id": "evt_exemplo_3",
  "type": "payment_link.paid",
  "created_at": "2026-07-11T11:46:02Z",
  "data": {
    "id": "plink_exemplo",
    "slug": "slug_exemplo",
    "wallet_account_id": "wacc_exemplo",
    "amount_minor": 25000,
    "currency": "AOA",
    "description": "Pedido #123",
    "status": "USED",
    "expires_at": null,
    "paid_at": "2026-07-11T11:46:01Z",
    "created_at": "2026-07-11T11:45:00Z",
    "updated_at": "2026-07-11T11:46:01Z",
    "refund_source": { "source_type": "WALLET_PAYMENT", "source_id": "wpay_exemplo" }
  }
}`,
  },
  {
    name: 'refund.completed',
    source: ['core/api/src/routes/refunds.rs'],
    resource: { pt: 'Reembolso', en: 'Refund' },
    endpoint: 'ref-refund-create',
    when: {
      pt: 'Quando um reembolso foi feito e o valor voltou ao pagador — no mesmo pedido que createRefund responde 201.',
      en: 'When a refund was made and the value is back with the payer — in the same request that createRefund answers 201.',
    },
    fields: [
      { name: 'refund_id', type: 'string (uuid)', note: { pt: 'o id do reembolso', en: 'the refund id' } },
      { name: 'source_type', type: 'string', note: { pt: 'WALLET_PAYMENT ou ACQUIRING_PAYMENT', en: 'WALLET_PAYMENT or ACQUIRING_PAYMENT' } },
      { name: 'source_id', type: 'string (uuid)', note: { pt: 'o pagamento reembolsado', en: 'the refunded payment' } },
      { name: 'amount_minor', type: 'integer', note: { pt: 'o valor devolvido, em unidades menores', en: 'the value returned, in minor units' } },
      { name: 'currency', type: 'string', note: { pt: 'AOA', en: 'AOA' } },
      { name: 'status', type: 'string', note: { pt: 'SUCCEEDED', en: 'SUCCEEDED' } },
      { name: 'trace_id', type: 'string', note: { pt: 'o idempotency_key que enviou — é por ele que liga o evento ao seu pedido', en: 'the idempotency_key you sent — how you tie the event to your request' } },
      { name: 'created_at', type: 'string (RFC 3339)', note: { pt: 'quando o reembolso foi feito', en: 'when the refund was made' } },
    ],
    action: {
      pt: 'Verifique, deduplique, e marque o reembolso do seu lado como concluído pelo trace_id.',
      en: 'Verify, deduplicate, and mark your refund complete by its trace_id.',
    },
    dedupe: ENVELOPE_ID,
    ordering: {
      pt: 'Chega depois do pagamento que reembolsa, mas pode chegar antes de a resposta de createRefund ser processada do seu lado.',
      en: 'Arrives after the payment it refunds, but may arrive before your side has processed the createRefund response.',
    },
    sandbox: {
      pt: 'Sim, depois de um pagamento de teste: createRefund com o refund_source do pagamento.',
      en: 'Yes, after a test payment: createRefund with the payment’s refund_source.',
    },
    doa: null,
    guide: 'refunds',
    sample: `{
  "id": "evt_exemplo_4",
  "type": "refund.completed",
  "created_at": "2026-07-11T12:02:00Z",
  "data": {
    "refund_id": "rfnd_exemplo",
    "source_type": "WALLET_PAYMENT",
    "source_id": "wpay_exemplo",
    "amount_minor": 5000,
    "currency": "AOA",
    "status": "SUCCEEDED",
    "trace_id": "idem_reembolso_123",
    "created_at": "2026-07-11T12:02:00Z"
  }
}`,
  },
  {
    name: 'application_settlement.completed',
    source: ['core/api/src/routes/application_settlements.rs', 'core/app-settlement/src/domain.rs'],
    resource: { pt: 'Liquidação', en: 'Settlement' },
    endpoint: 'ref-settlement-create',
    when: {
      pt: 'Quando uma liquidação que pediu terminou: o líquido está no beneficiário e a taxa, se houver, no seu destino de taxa.',
      en: 'When a settlement you requested finished: the net is with the beneficiary and the fee, if any, in your fee destination.',
    },
    fields: [
      { name: 'id', type: 'string (uuid)', note: { pt: 'o id da liquidação', en: 'the settlement id' } },
      { name: 'owner_ref', type: 'string', note: { pt: 'o seu reference_id (ou reason)', en: 'your reference_id (or reason)' } },
      { name: 'status', type: 'string', note: { pt: 'COMPLETED', en: 'COMPLETED' } },
      { name: 'gross_amount', type: '{ amount_minor, currency }', note: { pt: 'o bruto — objecto, não o gross_amount_minor da resposta REST', en: 'the gross — an object, not the REST response’s gross_amount_minor' } },
      { name: 'application_fee', type: '{ amount_minor, currency }', note: { pt: 'a taxa', en: 'the fee' } },
      { name: 'net_amount', type: '{ amount_minor, currency }', note: { pt: 'o líquido do beneficiário', en: 'the beneficiary’s net' } },
      { name: 'currency', type: 'string', note: { pt: 'AOA', en: 'AOA' } },
      { name: 'source_account_id', type: 'string (uuid)', note: { pt: 'a conta que foi liquidada', en: 'the account that was settled' } },
      { name: 'idempotency_key', type: 'string', note: { pt: 'a chave que enviou', en: 'the key you sent' } },
      { name: 'created_at', type: 'string (RFC 3339)', note: { pt: 'quando foi pedida', en: 'when it was requested' } },
      { name: 'completed_at', type: 'string (RFC 3339)', note: { pt: 'quando terminou', en: 'when it finished' } },
    ],
    action: {
      pt: 'Verifique, deduplique, e marque a campanha ou o pedido de owner_ref como liquidado, com os três montantes.',
      en: 'Verify, deduplicate, and mark the campaign or order in owner_ref as settled, with the three amounts.',
    },
    dedupe: ENVELOPE_ID,
    ordering: {
      pt: 'Pode chegar antes ou depois de a resposta de createBusinessApplicationSettlement ser processada; a resposta já traz o mesmo resultado.',
      en: 'Can arrive before or after you process the createBusinessApplicationSettlement response; the response already carries the same result.',
    },
    sandbox: {
      pt: 'Sim, com uma conta com saldo e um projeto pronto para liquidar.',
      en: 'Yes, with an account that holds a balance and a project ready to settle.',
    },
    doa: {
      pt: 'O DOA encontra a campanha pelo id da liquidação que guardou ao pedi-la, e marca-a como liquidada com o bruto, a taxa e o líquido deste evento.',
      en: 'DOA finds the campaign by the settlement id it stored when requesting it, and marks it settled with this event’s gross, fee and net.',
    },
    guide: 'settlements',
    sample: `{
  "id": "evt_exemplo_5",
  "type": "application_settlement.completed",
  "created_at": "2026-07-11T12:30:01Z",
  "data": {
    "id": "apstl_exemplo",
    "owner_ref": "campanha_123",
    "status": "COMPLETED",
    "gross_amount": { "amount_minor": 100000, "currency": "AOA" },
    "application_fee": { "amount_minor": 2000, "currency": "AOA" },
    "net_amount": { "amount_minor": 98000, "currency": "AOA" },
    "currency": "AOA",
    "source_account_id": "wacc_exemplo",
    "idempotency_key": "idem_liquidacao_123",
    "created_at": "2026-07-11T12:30:00Z",
    "completed_at": "2026-07-11T12:30:01Z"
  }
}`,
  },
  {
    name: 'application_settlement.cancelled',
    source: ['core/api/src/routes/application_settlements.rs', 'core/app-settlement/src/domain.rs'],
    resource: { pt: 'Liquidação', en: 'Settlement' },
    endpoint: 'ref-settlement-create',
    when: {
      pt: 'Quando o Banzami cancela uma liquidação que foi criada mas não chegou a concluir. Nenhum dinheiro saiu da conta.',
      en: 'When Banzami cancels a settlement that was created but never completed. No money left the account.',
    },
    fields: [
      { name: 'id', type: 'string (uuid)', note: { pt: 'o id da liquidação', en: 'the settlement id' } },
      { name: 'owner_ref', type: 'string', note: { pt: 'a sua referência', en: 'your reference' } },
      { name: 'status', type: 'string', note: { pt: 'CANCELLED', en: 'CANCELLED' } },
      { name: 'source_account_id', type: 'string (uuid)', note: { pt: 'a conta, que mantém o saldo', en: 'the account, which keeps its balance' } },
      { name: 'idempotency_key', type: 'string', note: { pt: 'a chave que enviou', en: 'the key you sent' } },
      { name: 'cancelled_at', type: 'string (RFC 3339)', note: { pt: 'quando foi cancelada', en: 'when it was cancelled' } },
    ],
    action: {
      pt: 'Marque a liquidação como não feita e mostre que o saldo continua na conta. Para liquidar, peça uma liquidação nova, com uma idempotency_key nova.',
      en: 'Mark the settlement as not done and show the balance is still in the account. To settle, request a new settlement with a new idempotency_key.',
    },
    dedupe: ENVELOPE_ID,
    ordering: { pt: 'Terminal: nenhum outro evento se segue para esta liquidação.', en: 'Terminal: no other event follows for this settlement.' },
    sandbox: {
      pt: 'Não pela sua chave: é uma decisão do operador sobre uma liquidação que não concluiu. Não o consegue provocar para testar.',
      en: 'Not with your key: it is an operator decision about a settlement that did not complete. You cannot cause it to test.',
    },
    doa: {
      pt: 'O DOA devolve a campanha ao estado encerrada e esquece o id da liquidação, para que se possa pedir outra.',
      en: 'DOA returns the campaign to closed and forgets the settlement id, so another can be requested.',
    },
    guide: 'settlements',
    sample: `{
  "id": "evt_exemplo_6",
  "type": "application_settlement.cancelled",
  "created_at": "2026-07-11T13:00:00Z",
  "data": {
    "id": "apstl_exemplo",
    "owner_ref": "campanha_123",
    "status": "CANCELLED",
    "source_account_id": "wacc_exemplo",
    "idempotency_key": "idem_liquidacao_123",
    "cancelled_at": "2026-07-11T13:00:00Z"
  }
}`,
  },
  {
    name: 'application_settlement.failed',
    source: ['core/api/src/routes/application_settlements.rs', 'core/app-settlement/src/domain.rs'],
    resource: { pt: 'Liquidação', en: 'Settlement' },
    endpoint: 'ref-settlement-create',
    when: {
      pt: 'Quando o Banzami marca como falhada uma liquidação que não pôde concluir. Nenhum dinheiro saiu da conta.',
      en: 'When Banzami marks as failed a settlement that could not complete. No money left the account.',
    },
    fields: [
      { name: 'id', type: 'string (uuid)', note: { pt: 'o id da liquidação', en: 'the settlement id' } },
      { name: 'owner_ref', type: 'string', note: { pt: 'a sua referência', en: 'your reference' } },
      { name: 'status', type: 'string', note: { pt: 'FAILED', en: 'FAILED' } },
      { name: 'failure_reason', type: 'string | null', note: { pt: 'porquê, em texto', en: 'why, as text' } },
      { name: 'source_account_id', type: 'string (uuid)', note: { pt: 'a conta, que mantém o saldo', en: 'the account, which keeps its balance' } },
      { name: 'idempotency_key', type: 'string', note: { pt: 'a chave que enviou', en: 'the key you sent' } },
      { name: 'failed_at', type: 'string (RFC 3339)', note: { pt: 'quando falhou', en: 'when it failed' } },
    ],
    action: {
      pt: 'Registe failure_reason, mostre que o saldo continua na conta, e peça ajuda com o id da liquidação se não souber porquê.',
      en: 'Record failure_reason, show the balance is still in the account, and ask for help with the settlement id if you do not know why.',
    },
    dedupe: ENVELOPE_ID,
    ordering: { pt: 'Terminal: nenhum outro evento se segue para esta liquidação.', en: 'Terminal: no other event follows for this settlement.' },
    sandbox: {
      pt: 'Não pela sua chave: é uma decisão do operador. Não o consegue provocar para testar.',
      en: 'Not with your key: it is an operator decision. You cannot cause it to test.',
    },
    doa: {
      pt: 'O DOA marca a campanha como liquidação falhada e guarda failure_reason, para a equipa decidir o passo seguinte.',
      en: 'DOA marks the campaign as settlement failed and keeps failure_reason, for its team to decide the next step.',
    },
    guide: 'settlements',
    sample: `{
  "id": "evt_exemplo_7",
  "type": "application_settlement.failed",
  "created_at": "2026-07-11T13:00:00Z",
  "data": {
    "id": "apstl_exemplo",
    "owner_ref": "campanha_123",
    "status": "FAILED",
    "failure_reason": "beneficiary wallet unavailable",
    "source_account_id": "wacc_exemplo",
    "idempotency_key": "idem_liquidacao_123",
    "failed_at": "2026-07-11T13:00:00Z"
  }
}`,
  },
];

export const EVENT_NAMES = EVENT_DOCS.map((e) => e.name);
