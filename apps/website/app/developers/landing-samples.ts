// The code on the developer landing page (banzami.com/developers), as plain
// strings so tools/check-docs-code-examples.mjs can compile every TypeScript
// one against the @banzami/sdk a reader installs.
//
// It used to be hand-highlighted JSX that nothing could compile, and it showed
// `client.payments.create({ amount, recipient })`, `client.payments.createQr`,
// `client.transfers.create`, `client.sandbox.payments.confirm` and
// `client.webhooks.verify` — five methods the SDK does not have — plus a
// `recipient` field the API refuses and amounts in the wrong unit.

export const LANDING_SAMPLE_HERO = `import { BanzamiClient } from '@banzami/sdk';

// A chave secreta bz_test_sk_ vive apenas no servidor.
const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY ?? '' });

// Criar um pagamento (Sandbox). Quem recebe vem da configuração financeira
// do projeto — nunca de um campo do pedido.
const session = await banzami.createPaymentSession({
  purpose: 'ORDER',
  referenceType: 'ORDER',
  referenceId: order.id,
  amountMinor: 250000, // 2 500 Kz — 100 unidades menores = 1 Kz
  currency: 'AOA',
  description: '1 Kg de Arroz',
});`;

export const LANDING_SAMPLE_HTTP_REQUEST = `POST /v1/payment-sessions
Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX
Idempotency-Key: idem_pedido_123

{
  "purpose": "ORDER",
  "reference_type": "ORDER",
  "reference_id": "pedido_123",
  "amount_minor": 250000,
  "currency": "AOA",
  "description": "1 Kg de Arroz"
}`;

export const LANDING_SAMPLE_HTTP_RESPONSE = `{
  "session_id": "psess_exemplo",
  "status": "ACTIVE",
  "amount_minor": 250000,
  "currency": "AOA",
  "reference_type": "ORDER",
  "reference_id": "pedido_123",
  "interfaces": [
    { "type": "PAYMENT_LINK", "value": "https://pay.banzami.com/pay/slug_exemplo" }
  ]
}`;

export const LANDING_SAMPLE_ENV = `BANZAMI_API_KEY=bz_test_sk_XXXXXXXXXXXXXXXX
BANZAMI_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXX`;

export const LANDING_SAMPLE_ENV_OK = `import { BanzamiClient } from '@banzami/sdk';

// O ambiente é inferido do prefixo da chave: bz_test_sk_… → Sandbox.
const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY ?? '' });`;

export const LANDING_SAMPLE_ENV_MISMATCH = `import { BanzamiClient } from '@banzami/sdk';

// Lança BanzamiConfigError na construção: o ambiente pedido
// contradiz o prefixo da chave, e nenhum pedido chega a sair.
const banzami = new BanzamiClient({
  environment: 'live',
  apiKey: 'bz_test_sk_XXXXXXXXXXXXXXXX',
});`;

export const LANDING_SAMPLE_SANDBOX = `import { BanzamiClient } from '@banzami/sdk';

const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY ?? '' });

// No Sandbox o pagador paga de verdade, com dinheiro fictício, na página
// alojada pay.banzami.com. Abra o link e depois confirme o estado:
const link = banzami.paymentSessionInterface(session, 'PAYMENT_LINK');
console.log('Abrir para pagar:', link?.value);

const paga = await banzami.getPaymentSession(session.session_id);
if (paga.status === 'PAID') {
  // pagamento confirmado — o webhook payment_session.paid também chega
}`;

export const LANDING_SAMPLE_PAYLOAD = `{
  "id": "evt_XXXXXXXX",
  "type": "payment_session.paid",
  "created_at": "2026-07-11T11:46:02Z",
  "data": {
    "payment_session_id": "psess_exemplo",
    "transfer_id": "trf_exemplo",
    "amount_minor": 250000,
    "reference_type": "ORDER",
    "reference_id": "pedido_123"
  }
}`;

export const LANDING_SAMPLE_VERIFY = `import { BanzamiClient } from '@banzami/sdk';

const banzami = new BanzamiClient({
  apiKey: process.env.BANZAMI_API_KEY ?? '',
  webhookSecret: process.env.BANZAMI_WEBHOOK_SECRET ?? '',
});

export async function POST(req: Request) {
  // O corpo EM BRUTO: reserializar o JSON muda os bytes e a assinatura falha.
  const raw = await req.text();
  const event = banzami.webhooks.constructEvent(raw, req.headers.get('banza-signature') ?? '');
  if (event.type === 'payment_session.paid') {
    // idempotente: o mesmo evento pode chegar mais de uma vez
  }
  return new Response(null, { status: 200 });
}`;

export const LANDING_SAMPLE_METADATA = `POST /v1/payment-sessions

{
  "purpose": "ORDER",
  "reference_type": "ORDER",
  "reference_id": "order_123",
  "amount_minor": 250000,
  "currency": "AOA",
  "metadata": {
    "merchant_reference": "order_123"
  }
}`;

export const LANDING_SAMPLE_ERROR = `{
  "code": "PAYMENTS_UNAVAILABLE",
  "message": "this project is not provisioned to accept payments",
  "request_id": "4f3c1b9a2e7d5086c1af03be7d2915ce"
}`;

export const LANDING_SAMPLE_CHECKOUT = `const session = await banzami.createPaymentSession({
  purpose: 'ORDER',
  referenceType: 'ORDER',
  referenceId: order.id,
  amountMinor: cart.totalMinor,
  currency: 'AOA',
  description: 'Compra online',
  metadata: { merchant_reference: order.id },
});

// Não despache enquanto a sessão estiver ACTIVE —
// espere por payment_session.paid.`;

export const LANDING_SAMPLE_TAXI = `const session = await banzami.createPaymentSession({
  purpose: 'ORDER',
  referenceType: 'TRIP',
  referenceId: trip.id,
  amountMinor: trip.totalMinor,
  currency: 'AOA',
  description: 'Corrida ' + trip.id,
});

// no handler de webhook — verificar primeiro, sobre o corpo em bruto:
const event = banzami.webhooks.constructEvent(raw, signature, process.env.BANZAMI_WEBHOOK_SECRET ?? '');
if (event.type === 'payment_session.paid') {
  const data = event.data as { reference_id: string };
  await trips.markPaid(data.reference_id);
}`;

export const LANDING_SAMPLE_DELIVERY = `const session = await banzami.createPaymentSession({
  purpose: 'ORDER',
  referenceType: 'DELIVERY',
  referenceId: delivery.id,
  amountMinor: delivery.amountMinor,
  currency: 'AOA',
});

// se a entrega for cancelada depois de paga:
const paga = await banzami.getPaymentSession(session.session_id);
if (paga.refund_source) {
  await banzami.createRefund({
    ...paga.refund_source,
    amount_minor: delivery.amountMinor,
    currency: 'AOA',
    idempotency_key: 'refund_' + delivery.id,
  });
}`;

export const LANDING_SAMPLE_QR = `const session = await banzami.createPaymentSession({
  purpose: 'STORE',
  amountMinor: 150000, // 1 500 Kz
  currency: 'AOA',
  description: '1 Kg de Arroz',
});

// o valor a desenhar como QR — o cliente lê e paga na app Banzami
const qr = banzami.paymentSessionInterface(session, 'DYNAMIC_QR');`;

export const LANDING_SAMPLE_ACCOUNTS = `// Uma conta por campanha, dentro do mesmo titular.
const campanha = await banzami.createWalletAccount({
  purpose: 'CAMPAIGN',
  referenceType: 'CAMPAIGN',
  referenceId: campaign.id,
  label: campaign.title,
});

// Mover valor entre duas contas do seu projeto — nunca para fora dele.
await banzami.createTransfer({
  sourceWalletAccountId: campanha.id,
  destinationWalletAccountId: principal.id,
  amountMinor: 500000,
  currency: 'AOA',
  idempotencyKey: 'mov_' + campaign.id,
});`;

export const LANDING_SAMPLE_MARKETPLACE = `const session = await banzami.createPaymentSession({
  purpose: 'ORDER',
  referenceType: 'MARKETPLACE_ORDER',
  referenceId: order.id,
  amountMinor: order.totalMinor,
  currency: 'AOA',
  metadata: { merchant_reference: order.id },
});

// A divisão de pagamentos entre vendedores não existe como produto.
// Guarde seller_id do seu lado, associado a reference_id.`;
