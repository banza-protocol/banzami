import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { DeveloperCTA } from '@/components/site/DeveloperCTA';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { SectionHeading } from '@/components/primitives';
import { CodeBlock } from '@/components/developers/CodeBlock';
import { ArchitectureDiagram } from '@/components/developers/ArchitectureDiagram';
import { PaymentFlowDiagram } from '@/components/developers/PaymentFlowDiagram';
import { WebhookFlowDiagram } from '@/components/developers/WebhookFlowDiagram';
import { SdkEcosystemDiagram } from '@/components/developers/SdkEcosystemDiagram';
import { GoingLiveDiagram } from '@/components/developers/GoingLiveDiagram';
import { DevToc } from '@/components/developers/DevToc';
import { TheoryCard } from '@/components/developers/TheoryCard';
import { DocTable } from '@/components/developers/DocTable';
import { RetryFlow } from '@/components/developers/RetryFlow';

export const metadata: Metadata = { title: 'Developers' };

const S = ({ children }: { children: ReactNode }) => (
  <span className="text-[#1f9a5b]">{children}</span>
);
const K = ({ children }: { children: ReactNode }) => <span className="text-cherry">{children}</span>;
const F = ({ children }: { children: ReactNode }) => (
  <span className="text-cherry-dark">{children}</span>
);
const C = ({ children }: { children: ReactNode }) => (
  <span className="text-[#a89a9e]">{children}</span>
);

/* ---------- Quickstart steps ---------- */
const QUICKSTART_STEPS = [
  { n: '1', title: 'Criar chave sandbox', desc: 'Gere uma chave bz_test_sk_… para o ambiente de teste.' },
  { n: '2', title: 'Instalar SDK', desc: 'Adicione o SDK oficial @banzami/sdk ao seu projeto.' },
  { n: '3', title: 'Criar pagamento', desc: 'Inicie um pagamento com idempotência por defeito.' },
  { n: '4', title: 'Receber eventos', desc: 'Receba webhooks assinados quando o estado muda.' },
];

/* ---------- Foundations (theory cards) ---------- */
const gp = {
  stroke: '#B5101F',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const FOUNDATIONS: { title: string; definition: string; matters: string; glyph: ReactNode }[] = [
  {
    title: 'Carteira digital',
    definition: 'Saldo digital ligado a uma conta de utilizador, comerciante ou sistema.',
    matters:
      'Reduz a dependência de dinheiro físico, confirmações informais e fluxos bancários fragmentados.',
    glyph: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="13" rx="2.5" {...gp} />
        <path d="M3.5 9h17" {...gp} />
        <circle cx="16.5" cy="13.5" r="1.3" {...gp} />
      </svg>
    ),
  },
  {
    title: 'Ledger de dupla entrada',
    definition: 'Cada movimento cria registos de débito e crédito iguais.',
    matters: 'Torna o dinheiro rastreável, auditável e reversível quando necessário.',
    glyph: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4v16M5 9l-1.6 5h3.2L5 9zM19 9l-1.6 5h3.2L19 9zM5 9h14" {...gp} />
        <path d="M9 20h6" {...gp} />
      </svg>
    ),
  },
  {
    title: 'Pagamento confirmado',
    definition:
      'Um pagamento não é só um pedido; torna-se válido quando o pagador confirma explicitamente.',
    matters: 'Reduz pagamentos acidentais e cria confiança.',
    glyph: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" {...gp} />
        <path d="M8.5 12l2.5 2.5 4.5-5" {...gp} />
      </svg>
    ),
  },
  {
    title: 'Webhook',
    definition: 'Evento automático enviado ao sistema do comerciante quando algo muda.',
    matters: 'O negócio deixa de ter de verificar manualmente se o pagamento chegou.',
    glyph: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 9a3 3 0 1 1 4.2 2.7L16 17" {...gp} />
        <circle cx="7" cy="17" r="3" {...gp} />
        <circle cx="17" cy="17" r="3" {...gp} />
        <path d="M10 17h4" {...gp} />
      </svg>
    ),
  },
  {
    title: 'Idempotência',
    definition: 'Evita operações duplicadas quando o mesmo pedido é repetido.',
    matters:
      'Importante em Angola, onde a rede móvel pode ser instável e as apps repetem pedidos.',
    glyph: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 8a8 8 0 0 1 13.5-2.5L20 7M19 16a8 8 0 0 1-13.5 2.5L4 17" {...gp} />
        <path d="M20 4v3h-3M4 20v-3h3" {...gp} />
      </svg>
    ),
  },
];

/* ---------- Angola context ---------- */
const ANGOLA_PAIN = [
  'Pagamentos dependem de comprovativo manual.',
  'Comerciantes esperam por screenshots.',
  'Reconciliação lenta e feita à mão.',
  'Manuseio de dinheiro físico cria risco.',
  'Instabilidade de rede causa tentativas duplicadas.',
  'Pequenos negócios sem infraestrutura digital simples.',
  'Programadores sem uma camada de pagamentos unificada.',
];
const ANGOLA_BANZAMI = [
  'Confirmação instantânea de pagamento.',
  'Recibos digitais gerados automaticamente.',
  'Confirmação por webhook, não por screenshot.',
  'Menos verificação manual.',
  'Pagamentos programáveis na própria app.',
  'Uma API para carteiras, pagamentos e eventos.',
];

/* ---------- Embedded payments — before/after flows ---------- */
const EMBEDDED_MANUAL: string[] = [
  'Pedido',
  'Transferência bancária',
  'Screenshot',
  'Verificação manual',
  'Entrega',
];
const EMBEDDED_BANZAMI: string[] = [
  'Pedido',
  'Pagar com Banzami',
  'payment_session.paid',
  'Libertação automática',
  'Recibo',
];
const EMBEDDED_CHANGE: string[] = [
  'Menos validação manual',
  'Menos dependência de screenshots',
  'Confirmação automática',
  'Reconciliação mais simples',
  'Melhor experiência para o cliente',
  'Base técnica para novos serviços digitais',
];

/* ---------- API endpoints ---------- */
const ENDPOINTS: { method: 'POST' | 'GET'; path: string; desc: string }[] = [
  { method: 'POST', path: '/v1/business/payment-sessions', desc: 'Criar uma sessão de pagamento.' },
  { method: 'GET', path: '/v1/business/payment-sessions/{id}', desc: 'Consultar o estado de um pagamento.' },
  { method: 'POST', path: '/v1/refunds', desc: 'Reembolsar um pagamento confirmado.' },
  { method: 'GET', path: '/v1/wallets/{id}/balance', desc: 'Consultar o saldo de uma carteira.' },
  { method: 'POST', path: '/v1/webhooks/endpoints', desc: 'Registar um endpoint de webhook.' },
];

/* ---------- API endpoint reference table ---------- */
const ENDPOINT_TABLE: {
  endpoint: string;
  purpose: string;
  user: string;
  when: string;
}[] = [
  { endpoint: 'POST /v1/business/payment-sessions', purpose: 'Criar uma sessão de pagamento', user: 'Comerciante / app', when: 'Quando se quer pedir um pagamento.' },
  { endpoint: 'GET /v1/business/payment-sessions/{id}', purpose: 'Consultar estado', user: 'App / backend', when: 'Quando uma app precisa de verificar o estado.' },
  { endpoint: 'POST /v1/refunds', purpose: 'Reembolsar', user: 'Comerciante', when: 'Quando é preciso devolver dinheiro.' },
  { endpoint: 'GET /v1/wallets/{id}/balance', purpose: 'Consultar saldo', user: 'Sistema', when: 'Quando é preciso mostrar o saldo disponível.' },
  { endpoint: 'POST /v1/webhooks/endpoints', purpose: 'Registar endpoint', user: 'Comerciante', when: 'Quando se quer receber eventos automaticamente.' },
];

/* ---------- Per-endpoint detail accordions ---------- */
const ENDPOINT_DETAILS: {
  method: 'POST' | 'GET';
  path: string;
  does: string;
  when: string;
  fields: string;
  typical: string;
  failures: string;
}[] = [
  {
    method: 'POST',
    path: '/v1/business/payment-sessions',
    does: 'Cria uma sessão de pagamento e devolve o id, o estado e as interfaces (link/QR).',
    when: 'Quando o comerciante ou a app querem pedir um pagamento ao cliente.',
    fields: 'wallet_account_id, purpose, reference_type, reference_id, amount_minor, currency (e o header Idempotency-Key).',
    typical: 'Uma cantina cria um pagamento de 2500 AOA para @cantina-alex.',
    failures: 'MISSING_FIELD, VALIDATION_ERROR, CONFLICT (Idempotency-Key), UNAUTHORIZED.',
  },
  {
    method: 'GET',
    path: '/v1/business/payment-sessions/{id}',
    does: 'Devolve o estado atual e os detalhes de um pagamento existente.',
    when: 'Quando uma app precisa de mostrar ou reconfirmar o estado de um pagamento.',
    fields: 'O id do pagamento no caminho do URL.',
    typical: 'O backend consulta o pagamento antes de libertar a encomenda.',
    failures: 'NOT_FOUND, UNAUTHORIZED.',
  },
  {
    method: 'POST',
    path: '/v1/refunds',
    does: 'Devolve, total ou parcialmente, um pagamento já confirmado.',
    when: 'Quando é preciso reverter uma venda ou corrigir um valor.',
    fields: 'source_type (ACQUIRING_PAYMENT | WALLET_PAYMENT), source_id, amount_minor, currency, idempotency_key.',
    typical: 'O comerciante reembolsa um cliente que devolveu o produto.',
    failures: 'INVALID_SOURCE_TYPE, CURRENCY_MISMATCH, REFUND_EXCEEDS_CAPTURED.',
  },
  {
    method: 'GET',
    path: '/v1/wallets/{id}/balance',
    does: 'Devolve o saldo disponível de uma carteira.',
    when: 'Quando é preciso mostrar quanto saldo existe disponível.',
    fields: 'O id da carteira no caminho do URL.',
    typical: 'O dashboard mostra o saldo atual do comerciante.',
    failures: 'invalid_api_key, rate_limit_exceeded.',
  },
  {
    method: 'POST',
    path: '/v1/webhooks/endpoints',
    does: 'Regista um URL que passa a receber eventos assinados.',
    when: 'Quando se quer ser notificado automaticamente das mudanças de estado.',
    fields: 'url do endpoint e os tipos de evento a subscrever.',
    typical: 'O backend regista um endpoint para receber payment_session.paid.',
    failures: 'invalid_api_key, rate_limit_exceeded.',
  },
];

/* ---------- Payment states ---------- */
const PAYMENT_STATES: { code: string; label: string; tone: 'neutral' | 'pending' | 'ok' | 'bad' }[] = [
  { code: 'created', label: 'Objeto criado.', tone: 'neutral' },
  { code: 'pending_confirmation', label: 'Falta o pagador confirmar.', tone: 'pending' },
  { code: 'confirmed', label: 'O pagador confirmou.', tone: 'ok' },
  { code: 'failed', label: 'Não foi possível concluir.', tone: 'bad' },
  { code: 'refunded', label: 'Foi devolvido.', tone: 'neutral' },
  { code: 'expired', label: 'Não confirmado a tempo.', tone: 'bad' },
];

/* ---------- SDK integration table ---------- */
const SDK_TABLE: { type: string; bestFor: string; example: string }[] = [
  { type: 'JavaScript / TS', bestFor: 'Web apps e backends Node.js', example: 'Dashboards, checkout web, APIs.' },
  { type: 'Flutter (iOS & Android)', bestFor: 'Apps móveis de consumidor e comerciante', example: 'Pagamento por QR, @banza e checkout na app.' },
  { type: 'Python / PHP', bestFor: 'Backends e plataformas web', example: 'E-commerce, ERP, integrações server-side.' },
  { type: 'REST', bestFor: 'Backend à medida', example: 'ERP, POS e sistemas legados.' },
];

/* ---------- Use cases ---------- */
const USE_CASES: { title: string; today: string; flow: string; integration: string }[] = [
  {
    title: 'Cantina / restaurante',
    today: 'Cliente paga em dinheiro ou mostra um comprovativo manual.',
    flow: 'Cliente paga por QR, comerciante recebe webhook, recibo gerado.',
    integration: 'createQr → payment_session.paid → recibo.',
  },
  {
    title: 'Loja de bairro',
    today: 'Venda registada à mão, sem confirmação fiável.',
    flow: 'Comerciante cria pedido de pagamento, cliente confirma, venda registada.',
    integration: 'POST /v1/business/payment-sessions → payment_session.paid.',
  },
  {
    title: 'Táxi / moto-táxi',
    today: 'Pagamento em dinheiro, troco e risco de manuseio.',
    flow: 'Passageiro paga a um @banza ou QR, condutor vê confirmação instantânea.',
    integration: 'transfers.create → webhook no app do condutor.',
  },
  {
    title: 'E-commerce local',
    today: 'Encomenda confirmada por screenshot enviado por WhatsApp.',
    flow: 'Checkout cria pedido, encomenda marcada paga após webhook.',
    integration: 'createPaymentSession → payment_session.paid → encomenda paga.',
  },
  {
    title: 'Delivery',
    today: 'Estafeta cobra à porta, sem garantia de pagamento.',
    flow: 'Pagamento confirmado antes da recolha/entrega.',
    integration: 'Esperar payment_session.paid antes de despachar.',
  },
  {
    title: 'Marketplaces e plataformas multi-vendedor',
    today: 'A plataforma segue manualmente quem pagou, quem recebe e que comissão se aplica.',
    flow: 'Associar pagamentos a vendedores, guardar referências, gerar recibos e reconciliar. Esta arquitetura prepara o caminho para divisão de pagamentos e liquidação entre participantes quando os módulos correspondentes forem ativados.',
    integration: 'metadata.seller_id, metadata.marketplace_order_id, payment_session.paid (split futuro).',
  },
  {
    title: 'Serviços, reservas e marcações',
    today: 'Reservas confirmadas à mão após o cliente enviar comprovativo.',
    flow: 'Cliente reserva → app cria pagamento → cliente confirma → webhook confirma → reserva fica confirmada automaticamente.',
    integration: 'metadata.booking_id → payment_session.paid → booking status = confirmed.',
  },
];

/* ---------- Integration responsibilities ---------- */
const RESPONSIBILITIES = [
  'Guardar os payment IDs de cada operação.',
  'Usar idempotency keys em operações mutantes.',
  'Verificar a assinatura de cada webhook.',
  'Reagir ao estado confirmed antes de entregar bens.',
  'Tratar os estados failed, expired e refunded.',
  'Não confiar só na confirmação do lado do cliente.',
  'Registar os request IDs para diagnóstico.',
];

/* ---------- SDK showcase ---------- */
const SDKS: { name: string; install: string; desc: string; snippet: ReactNode }[] = [
  {
    name: 'JavaScript / TypeScript',
    install: 'npm install @banzami/sdk',
    desc: 'Cliente tipado para Node.js e ambientes server-side, com idempotência e retries.',
    snippet: (
      <>
        <K>import</K> {'{ BanzamiClient } '}
        <K>from</K> <S>&quot;@banzami/sdk&quot;</S>;
      </>
    ),
  },
  {
    name: 'Flutter / Dart (cliente)',
    install: 'código-fonte (banzami_client — publicação em pub.dev pendente)',
    // Precise about the credential, because this is the snippet a mobile
    // developer copies. A chave secreta nunca entra numa app: quem descarrega
    // a app consegue lê-la, e essa chave move dinheiro.
    desc: 'SDK cliente — apresenta um pagamento criado pelo seu servidor, acompanha o estado e trata links/QR. Usa chave publicável.',
    snippet: (
      <>
        <K>final</K> banzami = <F>BanzamiClient</F>(publishableKey: <S>&quot;bz_test_pk_…&quot;</S>);
      </>
    ),
  },
  {
    name: 'PHP',
    install: 'código-fonte (banzami/sdk — ainda não publicado em Packagist)',
    desc: 'Cliente PHP (+ Laravel) para plataformas web e e-commerce server-side.',
    snippet: (
      <>
        <K>$client</K> = <K>new</K> <F>BanzamiClient</F>(<S>getenv(&quot;BANZAMI_API_KEY&quot;)</S>);
      </>
    ),
  },
  {
    name: 'REST API',
    install: 'https://sandbox-api.banzami.com/v1',
    desc: 'Camada de referência do protocolo — a mesma API REST, idempotente e versionada (diagnóstico e integradores avançados).',
    snippet: (
      <>
        <K>POST</K> /v1/business/payment-sessions
        {'\n'}
        Authorization: Bearer <S>bz_test_sk_xxx</S>
      </>
    ),
  },
];

/* ---------- Sandbox capabilities ---------- */
const SANDBOX_CAPS = [
  'Pagamentos simulados',
  'Confirmações simuladas',
  'Falhas simuladas',
  'Reembolsos simulados',
  'Webhooks simulados',
  'Testes de idempotência',
];

/* ---------- Webhook events ---------- */
// Verified event catalogue only (same closed set enforced by the /docs tests).
const WEBHOOK_EVENTS = [
  'payment_session.paid',
  'payment_link.paid',
  'application_settlement.completed',
  'application_settlement.cancelled',
  'application_settlement.failed',
];

/* ---------- Security cards ---------- */
const SECURITY: { title: string; desc: ReactNode }[] = [
  { title: 'Bearer keys', desc: 'Autenticação por chave secreta em cada pedido, sempre no servidor.' },
  {
    title: 'Sandbox keys',
    desc: (
      <>
        Chaves <span className="bz-mono text-[12px]">bz_test_sk_…</span> isoladas do ambiente real.
      </>
    ),
  },
  {
    title: 'Production keys',
    desc: 'Chaves de produção apenas no backend — nunca em browser ou mobile.',
  },
  {
    title: 'Webhook signatures',
    desc: (
      <>
        Eventos assinados e verificáveis pelo header{' '}
        <span className="bz-mono text-[12px]">banza-signature</span>.
      </>
    ),
  },
  { title: 'Idempotency', desc: 'Cada operação mutante aceita uma chave; repetir é sempre seguro.' },
  {
    title: 'Double-entry ledger',
    desc: 'O saldo deriva do ledger de dupla entrada, nunca de ajustes diretos.',
  },
  { title: 'Data minimization', desc: 'Nunca pedimos número de cartão, CVV ou validade ao cliente.' },
];

/* ---------- Error codes ---------- */
const ERROR_CODES: { code: string; desc: string }[] = [
  { code: 'invalid_api_key', desc: 'A chave de API é inválida ou não corresponde ao ambiente.' },
  { code: 'idempotency_conflict', desc: 'A chave de idempotência foi usada com um corpo diferente.' },
  { code: 'insufficient_balance', desc: 'A carteira de origem não tem saldo suficiente.' },
  { code: 'payment_not_found', desc: 'Não existe nenhum pagamento com este identificador.' },
  { code: 'payment_expired', desc: 'O pagamento expirou antes de ser confirmado.' },
  { code: 'webhook_signature_invalid', desc: 'A assinatura do webhook não pôde ser verificada.' },
  { code: 'rate_limit_exceeded', desc: 'Foram feitos demasiados pedidos num curto intervalo.' },
];

/* ---------- Examples ---------- */
const EXAMPLES: {
  title: string;
  problem: string;
  point: ReactNode;
  event: string;
  sees: string;
  snippet: ReactNode;
}[] = [
  {
    title: 'E-commerce checkout',
    problem: 'Encomenda confirmada por screenshot enviado por WhatsApp.',
    point: (
      <>
        <span className="bz-mono text-cherry-dark">payments.create</span> com{' '}
        <span className="bz-mono text-cherry-dark">metadata.order_id</span>.
      </>
    ),
    event: 'payment_session.paid',
    sees: 'A encomenda só é despachada depois de confirmada — sem comprovativos manuais.',
    snippet: (
      <>
        <K>const</K> payment = <K>await</K> client.payments.<F>create</F>({'{\n'}
        {'  '}amount: cart.total, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'  '}recipient: <S>&quot;@loja-kilamba&quot;</S>,{'\n'}
        {'  '}description: <S>&quot;Compra online&quot;</S>,{'\n'}
        {'  '}metadata: {'{'} order_id: order.id {'}'},{'\n'}
        {'}, { idempotencyKey: `order_${order.id}` });'}
        {'\n\n'}
        <C>{'// NÃO enviar enquanto created / pending_confirmation —'}</C>
        {'\n'}
        <C>{'// esperar pelo estado confirmed.'}</C>
      </>
    ),
  },
  {
    title: 'Táxi / moto-táxi',
    problem: 'Pagamento em dinheiro, troco e risco de manuseio no fim da corrida.',
    point: (
      <>
        <span className="bz-mono text-cherry-dark">payments.create</span> +{' '}
        <span className="bz-mono text-cherry-dark">metadata.trip_id</span> e handler de webhook.
      </>
    ),
    event: 'payment_session.paid',
    sees: 'O condutor vê a corrida marcada como paga assim que o passageiro confirma.',
    snippet: (
      <>
        <K>const</K> payment = <K>await</K> client.payments.<F>create</F>({'{\n'}
        {'  '}amount: trip.total, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'  '}recipient: driver.banza,{'\n'}
        {'  '}description: `Corrida ${'{'}trip.id{'}'}`,{'\n'}
        {'  '}metadata: {'{'} trip_id: trip.id, passenger_id: trip.passengerId {'}'},{'\n'}
        {'}, { idempotencyKey: `trip_${trip.id}` });'}
        {'\n\n'}
        <C>{'// no handler de webhook:'}</C>
        {'\n'}
        <K>if</K> (event.type === <S>&quot;payment_session.paid&quot;</S>) {'{\n'}
        {'  '}<K>await</K> trips.<F>markPaid</F>(event.data.metadata.trip_id);{'\n'}
        {'}'}
      </>
    ),
  },
  {
    title: 'Delivery',
    problem: 'Estafeta cobra à porta, sem garantia de pagamento antes da recolha.',
    point: (
      <>
        <span className="bz-mono text-cherry-dark">payments.create</span> com{' '}
        <span className="bz-mono text-cherry-dark">metadata.delivery_id</span>; reembolso opcional.
      </>
    ),
    event: 'payment_session.paid',
    sees: 'A recolha só avança depois de confirmado; se for cancelado, faz-se o reembolso.',
    snippet: (
      <>
        <K>const</K> payment = <K>await</K> client.payments.<F>create</F>({'{\n'}
        {'  '}amount: delivery.amount, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'  '}recipient: restaurant.banza,{'\n'}
        {'  '}description: `Delivery ${'{'}delivery.id{'}'}`,{'\n'}
        {'  '}metadata: {'{'} delivery_id: delivery.id {'}'},{'\n'}
        {'}, { idempotencyKey: `delivery_${delivery.id}` });'}
        {'\n\n'}
        <C>{'// se a entrega for cancelada:'}</C>
        {'\n'}
        <K>await</K> client.refunds.<F>create</F>({'{\n'}
        {'  '}source_type: <S>&quot;ACQUIRING_PAYMENT&quot;</S>, source_id: payment.id,{'\n'}
        {'  '}amount_minor: payment.amount_minor, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'  '}idempotency_key: `refund_${'{'}payment.id{'}'}`,{'\n'}
        {'}'});
      </>
    ),
  },
  {
    title: 'Merchant QR',
    problem: 'Cliente paga em dinheiro ou mostra um comprovativo manual no balcão.',
    point: (
      <>
        <span className="bz-mono text-cherry-dark">payments.createQr</span> — o cliente lê e confirma
        na app.
      </>
    ),
    event: 'payment_session.paid',
    sees: 'O comerciante imprime um QR e recebe a confirmação sem terminal dedicado.',
    snippet: (
      <>
        <K>const</K> qr = <K>await</K> client.payments.<F>createQr</F>({'{\n'}
        {'  '}amount: <F>1500</F>, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'  '}description: <S>&quot;1 Kg de Arroz&quot;</S>,{'\n'}
        {'});'}
      </>
    ),
  },
  {
    title: 'Wallet transfer',
    problem: 'Transferência entre pessoas depende de IBAN, screenshot e confirmação manual.',
    point: (
      <>
        <span className="bz-mono text-cherry-dark">transfers.create</span> para um{' '}
        <span className="bz-mono text-cherry-dark">@banza</span>.
      </>
    ),
    event: 'COMPLETED (síncrono)',
    sees: 'O destinatário recebe o valor e o recibo na carteira, em tempo real.',
    snippet: (
      <>
        <K>const</K> transfer = <K>await</K> client.transfers.<F>create</F>({'{\n'}
        {'  '}to: <S>&quot;@maria&quot;</S>, amount: <F>5000</F>, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'}, { idempotencyKey: ref });'}
      </>
    ),
  },
  {
    title: 'Marketplace readiness',
    problem: 'A plataforma segue à mão quem pagou, quem recebe e que comissão se aplica.',
    point: (
      <>
        <span className="bz-mono text-cherry-dark">metadata.seller_id</span> +{' '}
        <span className="bz-mono text-cherry-dark">metadata.marketplace_order_id</span>.
      </>
    ),
    event: 'payment_session.paid',
    sees: 'Cada pagamento fica associado ao vendedor e à encomenda, pronto a reconciliar.',
    snippet: (
      <>
        <K>const</K> payment = <K>await</K> client.payments.<F>create</F>({'{\n'}
        {'  '}amount: order.total, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'  '}recipient: <S>&quot;@marketplace&quot;</S>,{'\n'}
        {'  '}metadata: {'{\n'}
        {'    '}seller_id: seller.id,{'\n'}
        {'    '}marketplace_order_id: order.id,{'\n'}
        {'  }'},{'\n'}
        {'}, { idempotencyKey: `mkt_${order.id}` });'}
        {'\n\n'}
        <C>{'// A divisão de pagamentos e a liquidação entre'}</C>
        {'\n'}
        <C>{'// participantes serão ativadas num módulo futuro.'}</C>
      </>
    ),
  },
];

/* ---------- Going live steps ---------- */
const GOING_LIVE_STEPS: { n: string; title: string; desc: string }[] = [
  { n: '1', title: 'Build', desc: 'Construa a integração com o SDK oficial em sandbox.' },
  { n: '2', title: 'Test', desc: 'Teste pagamentos, falhas, reembolsos e idempotência.' },
  { n: '3', title: 'Validate Webhooks', desc: 'Verifique a assinatura banza-signature de cada evento.' },
  { n: '4', title: 'Technical Review', desc: 'Revisão técnica da integração antes de avançar.' },
  {
    n: '5',
    title: 'Production Activation',
    desc: 'Ativação de produção — pendente da ativação dos rails externos aprovados.',
  },
  { n: '6', title: 'Monitoring', desc: 'Observabilidade contínua de latência, erros e eventos.' },
];

function MethodPill({ method }: { method: 'POST' | 'GET' }) {
  return (
    <span
      className={`bz-mono inline-flex flex-none items-center rounded-[8px] px-[9px] py-[4px] text-[11px] font-extrabold tracking-[0.03em] text-white ${
        method === 'POST' ? 'bg-cherry' : 'bg-received'
      }`}
    >
      {method}
    </span>
  );
}

const STATE_TONES: Record<'neutral' | 'pending' | 'ok' | 'bad', string> = {
  neutral: 'border-border-soft bg-cream-50 text-ink-soft',
  pending: 'border-pink-200 bg-pink-100 text-cherry-dark',
  ok: 'border-[#bfe6cf] bg-[#eef9f2] text-received',
  bad: 'border-pink-200 bg-white text-cherry',
};

function StatePill({ code, tone }: { code: string; tone: 'neutral' | 'pending' | 'ok' | 'bad' }) {
  return (
    <span
      className={`bz-mono inline-flex flex-none items-center rounded-pill border px-[12px] py-[5px] text-[12px] font-bold ${STATE_TONES[tone]}`}
    >
      {code}
    </span>
  );
}

function DetailRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[2px] sm:flex-row sm:gap-[10px]">
      <span className="bz-mono flex-none text-[10.5px] font-bold uppercase tracking-[0.05em] text-cherry sm:w-[150px]">
        {term}
      </span>
      <span className="text-[13px] font-semibold leading-[1.5] text-ink-soft">{children}</span>
    </div>
  );
}

function EndpointAccordion({ e }: { e: (typeof ENDPOINT_DETAILS)[number] }) {
  return (
    <details className="group rounded-card border border-border-soft bg-white shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]">
      <summary className="flex cursor-pointer list-none items-center gap-[12px] px-[20px] py-[16px] [&::-webkit-details-marker]:hidden">
        <MethodPill method={e.method} />
        <span className="bz-mono flex-1 text-[13.5px] font-semibold text-ink">{e.path}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="flex-none text-ink-muted transition-transform duration-200 group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="flex flex-col gap-[10px] border-t border-border-soft px-[20px] py-[18px]">
        <DetailRow term="O que faz">{e.does}</DetailRow>
        <DetailRow term="Quando usar">{e.when}</DetailRow>
        <DetailRow term="Campos obrigatórios">{e.fields}</DetailRow>
        <DetailRow term="Caso típico">{e.typical}</DetailRow>
        <DetailRow term="Falhas possíveis">
          <span className="bz-mono text-[12.5px] text-cherry">{e.failures}</span>
        </DetailRow>
      </div>
    </details>
  );
}

function WebhookTheory({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="rounded-card border border-border-soft bg-white p-[20px] shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]">
      <p className="m-0 text-[14px] font-black text-ink">{q}</p>
      <p className="m-0 mt-[6px] text-[13px] font-semibold leading-[1.55] text-ink-soft">
        {children}
      </p>
    </div>
  );
}

function FlowRow({ steps, tone }: { steps: string[]; tone: 'muted' | 'cherry' }) {
  const node =
    tone === 'cherry'
      ? 'border-pink-200 bg-white text-cherry-dark'
      : 'border-border-soft bg-cream-50 text-ink-muted';
  const arrow = tone === 'cherry' ? '#B5101F' : '#cdb8bc';
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {steps.map((step, i) => (
        <div key={step} className="contents">
          <span
            className={`bz-mono inline-flex flex-none items-center rounded-pill border px-[12px] py-[7px] text-[11.5px] font-semibold ${node}`}
          >
            {step}
          </span>
          {i < steps.length - 1 && (
            <span className="flex-none px-[6px]" aria-hidden="true">
              <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                <path d="M0 5h13" stroke={arrow} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 3" />
                <path d="M11 1.5L15 5l-4 3.5" stroke={arrow} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* ===================== 1 · HERO ===================== */}
      <section className="relative overflow-hidden px-6 pb-16 pt-[clamp(120px,16vw,140px)]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto grid max-w-container grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-cherry shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
              <span className="h-2 w-2 rounded-full bg-cherry" />
              Developer Platform
            </span>
            <h1 className="m-0 text-[clamp(36px,5.2vw,62px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
              Integre pagamentos Banzami na sua app.
            </h1>
            <p className="m-0 mt-5 max-w-[540px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
              Uma API REST, SDKs oficiais e webhooks para criar pagamentos, confirmar transações e
              acompanhar eventos em tempo real.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#docs" className="bz-btn-primary">
                Começar com a documentação
              </a>
              <a
                href="#examples"
                className="inline-flex items-center gap-2 rounded-[40px] bg-white px-7 py-4 text-[16px] font-extrabold text-cherry no-underline shadow-[0_8px_22px_-10px_rgba(181,16,31,.3)] transition-transform hover:-translate-y-0.5"
              >
                Ver exemplo de integração
              </a>
            </div>
            <p className="m-0 mt-[22px] bz-mono text-[12.5px] font-semibold text-[#8a7a7e]">
              Sandbox disponível para integração técnica. Produção depende da ativação dos rails
              aprovados.
            </p>
          </div>

          <div>
            <CodeBlock title="pagamento.ts" lang="sandbox" className="anim-floaty-7">
              <K>import</K> {'{ BanzamiClient } '}
              <K>from</K> <S>&quot;@banzami/sdk&quot;</S>;{'\n\n'}
              <K>const</K> client = <K>new</K> <F>BanzamiClient</F>({'{\n'}
              {'  '}apiKey: process.env.<F>BANZAMI_API_KEY</F>,{'\n'}
              {'  '}environment: <S>&quot;sandbox&quot;</S>,{'\n'}
              {'});\n\n'}
              <C>{'// criar um pagamento (sandbox)'}</C>
              {'\n'}
              <K>const</K> payment = <K>await</K> client.payments.<F>create</F>(
              {'{\n'}
              {'  '}amount: <F>2500</F>, currency: <S>&quot;AOA&quot;</S>,{'\n'}
              {'  '}recipient: <S>&quot;@cantina-alex&quot;</S>,{'\n'}
              {'}, { idempotencyKey: order.id });'}
            </CodeBlock>
          </div>
        </div>
      </section>

      {/* ===================== STICKY IN-PAGE NAV ===================== */}
      <DevToc />

      {/* ===================== 2 · QUICKSTART ===================== */}
      <section id="docs" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="QUICKSTART"
            title="Comece em 4 passos."
            lead="Do install ao primeiro evento — em sandbox, com o SDK oficial."
            className="mb-10 max-w-[640px]"
          />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {QUICKSTART_STEPS.map((s, i) => (
                <Reveal
                  key={s.n}
                  delay={(i % 2) * 50}
                  className="rounded-card border border-border-soft bg-white p-[22px] shadow-[0_14px_40px_-30px_rgba(181,16,31,.3)]"
                >
                  <span
                    className="mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-[14px] font-black text-white"
                    style={{ background: 'linear-gradient(150deg,#B5101F,#6E0E14)' }}
                  >
                    {s.n}
                  </span>
                  <h3 className="m-0 mb-[6px] text-[16px] font-black text-ink">{s.title}</h3>
                  <p className="m-0 text-[13.5px] font-semibold leading-[1.5] text-ink-soft">{s.desc}</p>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <CodeBlock title="quickstart.sh" lang="sandbox · curl">
                <K>#</K> Primeira chamada — HTTP directo, para diagnóstico. A via normal é o SDK.{'\n'}
                curl https://sandbox-api.banzami.com<F>/v1/me</F> \{'\n'}
                {'  '}-H <S>&quot;Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX&quot;</S>{'\n\n'}
                <K>#</K> Resposta (200){'\n'}
                {'{'} <F>&quot;environment&quot;</F>: <S>&quot;SANDBOX&quot;</S>, <F>&quot;project&quot;</F>: <S>&quot;meu-projeto&quot;</S>,{'\n'}
                {'  '}<F>&quot;scopes&quot;</F>: [<S>&quot;identity:read&quot;</S>], <F>&quot;key_status&quot;</F>: <S>&quot;ACTIVE&quot;</S> {'}'}
              </CodeBlock>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== FOUNDATIONS ===================== */}
      <section id="foundation" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="FUNDAMENTOS"
            title="Fundamentos da plataforma Banzami"
            lead="Os conceitos essenciais antes de integrar — o que cada um é e porque importa em Angola."
            className="mb-10 max-w-[680px]"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FOUNDATIONS.map((f, i) => (
              <TheoryCard
                key={f.title}
                title={f.title}
                definition={f.definition}
                matters={f.matters}
                glyph={f.glyph}
                delay={(i % 3) * 50}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===================== ANGOLA CONTEXT ===================== */}
      <section
        id="angola-context"
        className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]"
      >
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="CONTEXTO ANGOLANO"
            title="Porque isto importa no contexto angolano"
            lead="Os pagamentos digitais em Angola enfrentam fricções concretas. O Banzami responde a cada uma."
            className="mb-10 max-w-[700px]"
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Reveal className="rounded-card border border-border-soft bg-white p-[clamp(22px,3vw,30px)] shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]">
              <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                Hoje · dores
              </span>
              <ul className="m-0 mt-4 flex list-none flex-col gap-[11px] p-0">
                {ANGOLA_PAIN.map((p) => (
                  <li key={p} className="flex items-start gap-[11px]">
                    <span className="mt-[6px] flex h-[6px] w-[6px] flex-none rounded-full bg-[#cdb8bc]" />
                    <span className="text-[14px] font-semibold leading-[1.5] text-ink-soft">{p}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal
              delay={70}
              className="rounded-card border-2 border-pink-200 bg-white p-[clamp(22px,3vw,30px)] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]"
            >
              <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-cherry">
                Com o Banzami
              </span>
              <ul className="m-0 mt-4 flex list-none flex-col gap-[11px] p-0">
                {ANGOLA_BANZAMI.map((p) => (
                  <li key={p} className="flex items-start gap-[11px]">
                    <span className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-pink-200">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" stroke="#9A1B22" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-[14px] font-semibold leading-[1.5] text-ink-secondary">{p}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Reveal className="mt-6 rounded-card bg-cream-100 px-6 py-[18px]">
            <p className="m-0 text-[14.5px] font-semibold leading-[1.6] text-ink-secondary">
              O Banzami acrescenta uma camada de pagamentos programável, desenhada para casos de uso
              digitais locais. Não substitui bancos nem rails existentes — integra-se com eles.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===================== EMBEDDED PAYMENTS ===================== */}
      <section id="embedded-payments" className="px-6 py-[clamp(64px,9vw,104px)] bg-cream-100">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="PAGAMENTOS EMBUTIDOS"
            title="Pagamentos embutidos em aplicações angolanas"
            lead="Permita que clientes paguem em Kwanza diretamente dentro da sua app, sem screenshots, transferências manuais ou confirmação por WhatsApp."
            className="mb-10 max-w-[760px]"
          />

          <Reveal className="mb-8 max-w-[760px]">
            <p className="m-0 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
              Hoje, muitos serviços digitais ainda dependem de um fluxo manual: o cliente transfere,
              envia um comprovativo e alguém verifica à mão. Embutir o pagamento na própria app
              remove esses passos.
            </p>
          </Reveal>

          {/* Before / after comparison */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Reveal className="rounded-card border border-border-soft bg-white p-[clamp(22px,3vw,30px)] shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]">
              <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                Fluxo manual
              </span>
              <div className="mt-5">
                <FlowRow steps={EMBEDDED_MANUAL} tone="muted" />
              </div>
              <p className="m-0 mt-5 text-[13px] font-semibold leading-[1.55] text-ink-soft">
                Atrasos, risco de fraude, trabalho manual, má experiência e reconciliação lenta.
              </p>
            </Reveal>
            <Reveal
              delay={70}
              className="rounded-card border-2 border-pink-200 bg-white p-[clamp(22px,3vw,30px)] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]"
            >
              <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-cherry">
                Fluxo Banzami
              </span>
              <div className="mt-5">
                <FlowRow steps={EMBEDDED_BANZAMI} tone="cherry" />
              </div>
              <p className="m-0 mt-5 text-[13px] font-semibold leading-[1.55] text-ink-secondary">
                O pagamento entra na app, confirma-se sozinho e liberta a entrega em tempo real.
              </p>
            </Reveal>
          </div>

          {/* Market-change callout */}
          <Reveal className="mt-6 rounded-card border border-border-soft bg-white p-[clamp(24px,3vw,34px)] shadow-[0_24px_60px_-44px_rgba(181,16,31,.35)]">
            <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-cherry">
              O que muda para o mercado angolano
            </span>
            <p className="m-0 mt-4 max-w-[760px] text-[15px] font-semibold leading-[1.65] text-ink-secondary">
              Quando pagamentos entram diretamente nas aplicações, negócios deixam de depender de
              screenshots, mensagens manuais e reconciliação lenta. Apps locais podem vender,
              confirmar, entregar e reconciliar em tempo real, usando Kwanza como moeda nativa da
              experiência digital.
            </p>
            <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-[11px] p-0 sm:grid-cols-2">
              {EMBEDDED_CHANGE.map((item) => (
                <li key={item} className="flex items-start gap-[11px]">
                  <span className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-pink-200">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="#9A1B22" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="text-[14px] font-semibold leading-[1.5] text-ink-soft">{item}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-6 rounded-card bg-cream-50 px-5 py-[16px] text-[13.5px] font-semibold leading-[1.6] text-ink-secondary">
              O Banzami é uma camada de pagamentos programável para serviços digitais locais. Não
              substitui bancos nem rails existentes — integra-se com eles.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===================== 3 · ARCHITECTURE ===================== */}
      <section id="architecture" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="ARQUITETURA"
            title="Como funciona a integração Banzami"
            lead="Da app do comerciante ao webhook de confirmação — cada passo é atómico e auditável."
            className="mb-12 max-w-[680px]"
          />
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <Reveal>
              <ArchitectureDiagram />
            </Reveal>
            <Reveal delay={80} className="flex flex-col gap-3">
              {[
                ['1', 'Pedido de pagamento', 'A app do comerciante inicia um pagamento via SDK.'],
                ['2', 'Validação', 'A API valida autenticação, idempotência e o pedido.'],
                ['3', 'Escrita no ledger', 'O movimento é registado no ledger de dupla entrada.'],
                ['4', 'Atualização da carteira', 'O saldo das carteiras envolvidas é atualizado.'],
                ['5', 'Envio do webhook', 'Um evento assinado é entregue ao backend do comerciante.'],
                ['6', 'Confirmação ao comerciante', 'O comerciante vê o pagamento confirmado.'],
              ].map(([n, title, desc]) => (
                <div key={n} className="flex items-start gap-[14px]">
                  <span className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[9px] bg-cream-100 text-[13px] font-black text-cherry-dark">
                    {n}
                  </span>
                  <div>
                    <p className="m-0 text-[15px] font-black text-ink">{title}</p>
                    <p className="m-0 mt-[2px] text-[13.5px] font-semibold leading-[1.5] text-ink-soft">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== 4 · PAYMENT FLOW ===================== */}
      <section id="payment-flow" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="FLUXO DE PAGAMENTO"
            title="Fluxo de pagamento"
            lead="Do cliente ao sistema do comerciante, com recibo e webhook em tempo real."
            className="mb-12 max-w-[680px]"
          />
          <Reveal className="rounded-card border border-border-soft bg-white p-[clamp(24px,4vw,44px)] shadow-[0_30px_70px_-44px_rgba(181,16,31,.35)]">
            <PaymentFlowDiagram />
          </Reveal>
        </div>
      </section>

      {/* ===================== 5 · API REFERENCE ===================== */}
      <section id="api" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="API REFERENCE"
            title="Referência da API"
            lead="REST, versionada, idempotente e com erros estruturados."
            className="mb-4 max-w-[680px]"
          />
          <p className="m-0 mb-8 max-w-[680px] text-[13px] font-semibold leading-[1.55] text-ink-muted">
            Os exemplos usam nomes e endpoints previstos para integração técnica. A disponibilidade
            pública dos pacotes e chaves de produção acompanha a ativação da plataforma.
          </p>
          <Reveal className="mb-8 overflow-hidden rounded-card border border-border-soft bg-white shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]">
            {ENDPOINTS.map((e, i) => (
              <div
                key={e.path}
                className={`flex flex-wrap items-center gap-[14px] px-[22px] py-[16px] ${
                  i > 0 ? 'border-t border-border-soft' : ''
                }`}
              >
                <MethodPill method={e.method} />
                <span className="bz-mono text-[13.5px] font-semibold text-ink">{e.path}</span>
                <span className="text-[13.5px] font-semibold text-ink-soft">{e.desc}</span>
              </div>
            ))}
          </Reveal>

          {/* Reference table: purpose / user / when */}
          <DocTable
            className="mb-8"
            columns={[
              { key: 'endpoint', header: 'Endpoint', mono: true },
              { key: 'purpose', header: 'Propósito' },
              { key: 'user', header: 'Utilizador típico' },
              { key: 'when', header: 'Quando usar' },
            ]}
            rows={ENDPOINT_TABLE.map((r) => ({
              endpoint: r.endpoint,
              purpose: r.purpose,
              user: r.user,
              when: r.when,
            }))}
          />

          {/* Per-endpoint detail accordions */}
          <Reveal className="mb-8 flex flex-col gap-3">
            {ENDPOINT_DETAILS.map((e) => (
              <EndpointAccordion key={e.path} e={e} />
            ))}
          </Reveal>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal>
              <CodeBlock title="request" lang="POST /v1/business/payment-sessions">
                <K>POST</K> /v1/business/payment-sessions{'\n'}
                Authorization: Bearer <S>bz_test_sk_xxx</S>
                {'\n'}
                Idempotency-Key: <S>order_123</S>
                {'\n\n'}
                {'{\n'}
                {'  '}<F>&quot;amount&quot;</F>: <F>2500</F>,{'\n'}
                {'  '}<F>&quot;currency&quot;</F>: <S>&quot;AOA&quot;</S>,{'\n'}
                {'  '}<F>&quot;recipient&quot;</F>: <S>&quot;@cantina-alex&quot;</S>,{'\n'}
                {'  '}<F>&quot;description&quot;</F>: <S>&quot;1 Kg de Arroz&quot;</S>
                {'\n}'}
              </CodeBlock>
            </Reveal>
            <Reveal delay={80}>
              <CodeBlock title="response" lang="201 Created">
                {'{\n'}
                {'  '}<F>&quot;id&quot;</F>: <S>&quot;pay_01HX...&quot;</S>,{'\n'}
                {'  '}<F>&quot;status&quot;</F>: <S>&quot;pending_confirmation&quot;</S>,{'\n'}
                {'  '}<F>&quot;amount&quot;</F>: <F>2500</F>,{'\n'}
                {'  '}<F>&quot;currency&quot;</F>: <S>&quot;AOA&quot;</S>
                {'\n}'}
              </CodeBlock>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== PAYMENT STATES ===================== */}
      <section
        id="payment-states"
        className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]"
      >
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="ESTADOS DE PAGAMENTO"
            title="Estados de pagamento"
            lead="Um pagamento percorre um ciclo de estados. A app deve reagir ao estado, nunca presumir."
            className="mb-10 max-w-[700px]"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PAYMENT_STATES.map((s, i) => (
              <Reveal
                key={s.code}
                delay={(i % 3) * 50}
                className="flex items-center gap-[12px] rounded-card border border-border-soft bg-white p-[18px] shadow-[0_14px_40px_-30px_rgba(181,16,31,.3)]"
              >
                <StatePill code={s.code} tone={s.tone} />
                <span className="text-[13.5px] font-semibold leading-[1.4] text-ink-soft">
                  {s.label}
                </span>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-6 rounded-card border border-pink-200 bg-pink-100 px-6 py-[18px]">
            <p className="m-0 text-[14px] font-semibold leading-[1.6] text-ink-secondary">
              <strong className="text-cherry-dark">Importante.</strong> Os sistemas do comerciante{' '}
              <strong>não devem entregar bens só porque um pagamento foi criado — devem esperar
              por <span className="bz-mono">confirmed</span></strong> (ou por um webhook válido).
              Exemplo: uma cantina ou serviço de entrega só deve libertar o produto após{' '}
              <span className="bz-mono text-cherry-dark">payment_session.paid</span> ou confirmação por
              webhook.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===================== 6 · SDKS ===================== */}
      <section id="sdks" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="SDKS OFICIAIS"
            title="SDKs oficiais"
            lead="O caminho recomendado — clientes tipados sobre o mesmo contrato."
            className="mb-4 max-w-[680px]"
          />
          <p className="m-0 mb-8 max-w-[680px] text-[13px] font-semibold leading-[1.55] text-ink-muted">
            Os exemplos usam nomes e endpoints previstos para integração técnica. A disponibilidade
            pública dos pacotes e chaves de produção acompanha a ativação da plataforma.
          </p>
          <Reveal className="mb-8 rounded-card border border-border-soft bg-white p-[clamp(24px,4vw,40px)] shadow-[0_30px_70px_-44px_rgba(181,16,31,.35)]">
            <SdkEcosystemDiagram />
          </Reveal>

          {/* SDK vs REST definitions */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TheoryCard
              title="SDK"
              definition="Kit oficial que envolve a API e reduz boilerplate."
              matters="Traz tipos, idempotência, retries e verificação de webhooks já resolvidos."
            />
            <TheoryCard
              title="REST API"
              definition="Integração HTTP direta, para qualquer backend ou linguagem."
              matters="Útil quando não existe SDK oficial — a mesma API, idempotente e versionada."
            />
          </div>

          {/* Integration type table */}
          <DocTable
            className="mb-8"
            columns={[
              { key: 'type', header: 'Tipo de integração' },
              { key: 'bestFor', header: 'Melhor para' },
              { key: 'example', header: 'Exemplo' },
            ]}
            rows={SDK_TABLE.map((r) => ({ type: r.type, bestFor: r.bestFor, example: r.example }))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SDKS.map((sdk, i) => (
              <Reveal
                key={sdk.name}
                delay={(i % 2) * 50}
                className="flex flex-col rounded-card border border-border-soft bg-white p-[26px] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]"
              >
                <h3 className="m-0 text-[18px] font-black text-ink">{sdk.name}</h3>
                <p className="bz-mono m-0 mt-2 text-[12.5px] text-cherry">{sdk.install}</p>
                <p className="m-0 mt-3 text-[14px] font-semibold leading-[1.5] text-ink-soft">
                  {sdk.desc}
                </p>
                <pre className="m-0 mt-4 overflow-x-auto rounded-[14px] bg-cream-50 p-[14px] bz-mono text-[12px] leading-[1.6] text-[#3a2a2e]">
                  {sdk.snippet}
                </pre>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== 6.5 · API KEYS & ENVIRONMENTS ===================== */}
      <section id="api-keys" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="CHAVES & AMBIENTES"
            title="Chaves de API e ambientes"
            lead="Dois ambientes, chaves com prefixo por ambiente. Como no modelo Stripe — sandbox para desenvolver, live para produção."
            className="mb-4 max-w-[700px]"
          />
          <p className="m-0 mb-8 max-w-[700px] text-[13px] font-semibold leading-[1.55] text-ink-muted">
            <strong className="text-cherry-dark">Sandbox</strong> é para desenvolvimento;{' '}
            <strong className="text-cherry-dark">live</strong> é para produção. O live move dinheiro
            real e só fica disponível após onboarding e ativação dos rails aprovados — não está
            ativo por omissão.
          </p>

          {/* Sandbox vs Live */}
          <DocTable
            className="mb-8"
            columns={[
              { key: 'env', header: 'Ambiente' },
              { key: 'use', header: 'Para quê' },
              { key: 'money', header: 'Dinheiro' },
              { key: 'sk', header: 'Chave secreta', mono: true },
              { key: 'whsec', header: 'Webhook secret', mono: true },
            ]}
            rows={[
              {
                env: <strong className="text-ink">Sandbox</strong>,
                use: 'Desenvolvimento e testes',
                money: 'Virtual — confirmações, falhas e reembolsos simulados',
                sk: 'bz_test_sk_…',
                whsec: 'whsec_test_…',
              },
              {
                env: <strong className="text-ink">Live</strong>,
                use: 'Produção',
                money: 'Kwanza real (requer ativação)',
                sk: 'bz_live_sk_…',
                whsec: 'whsec_live_…',
              },
            ]}
          />

          {/* Key prefixes */}
          <h3 className="mb-3 mt-2 text-[18px] font-black text-ink">Prefixos das chaves</h3>
          <DocTable
            className="mb-8"
            columns={[
              { key: 'type', header: 'Tipo de chave' },
              { key: 'sandbox', header: 'Sandbox', mono: true },
              { key: 'live', header: 'Live', mono: true },
              { key: 'where', header: 'Onde usar' },
            ]}
            rows={[
              {
                type: 'Chave secreta (Secret)',
                sandbox: 'bz_test_sk_…',
                live: 'bz_live_sk_…',
                where: 'Apenas backend',
              },
              {
                type: 'Chave publicável (Publishable)',
                sandbox: 'bz_test_pk_…',
                live: 'bz_live_pk_…',
                where: 'Frontend / mobile (planeado)',
              },
              {
                type: 'Webhook signing secret',
                sandbox: 'whsec_test_…',
                live: 'whsec_live_…',
                where: 'Apenas backend',
              },
            ]}
          />
          <p className="m-0 mb-10 max-w-[760px] text-[13px] font-semibold leading-[1.55] text-ink-muted">
            Compatibilidade: chaves legadas sem o segmento{' '}
            <span className="bz-mono text-cherry-dark">_sk_</span> (
            <span className="bz-mono">bz_test_…</span>, <span className="bz-mono">bz_live_…</span>)
            continuam a funcionar — o prefixo do ambiente é o que conta. As chaves publicáveis são
            um tipo planeado para fluxos client-side; até lá, use chaves secretas apenas no backend.
          </p>

          {/* Key types */}
          <h3 className="mb-4 mt-2 text-[18px] font-black text-ink">Tipos de chave e identificadores</h3>
          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TheoryCard
              title="Chave secreta"
              definition="Autentica chamadas que movem dinheiro — criar pagamentos, reembolsos, gerir webhooks."
              matters="Apenas no backend. Nunca expor em browser ou apps móveis."
            />
            <TheoryCard
              title="Chave publicável"
              definition="Chave segura para frontend/mobile, para iniciar fluxos client-side (planeado)."
              matters="Não move dinheiro por si só. Não substitui a chave secreta."
            />
            <TheoryCard
              title="Webhook secret"
              definition="Verifica a assinatura dos webhooks que o Banzami envia ao seu backend."
              matters="Diferente por ambiente. Nunca exposto no frontend."
            />
            <TheoryCard
              title="Merchant ID"
              definition="Identifica o comerciante ou a aplicação."
              matters="Não é segredo, mas identifica a sua conta."
            />
            <TheoryCard
              title="Wallet ID"
              definition="Identifica a carteira que recebe os pagamentos."
              matters="Não é necessariamente segredo, mas não deve ser exposto ao utilizador final."
            />
          </div>

          {/* Env var examples */}
          <h3 className="mb-4 mt-2 text-[18px] font-black text-ink">Variáveis de ambiente</h3>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal>
              <CodeBlock title=".env.local" lang="sandbox">
                <F>BANZAMI_ENV</F>=<S>sandbox</S>
                {'\n'}
                <F>BANZAMI_GATEWAY_URL</F>=<S>https://sandbox-api.banzami.com</S>
                {'\n'}
                <F>BANZAMI_API_KEY</F>=<S>bz_test_sk_xxx</S>
                {'\n'}
                <F>BANZAMI_MERCHANT_ID</F>=<S>…</S>
                {'\n'}
                <F>BANZAMI_WALLET_ID</F>=<S>…</S>
                {'\n'}
                <F>BANZAMI_WEBHOOK_SECRET</F>=<S>whsec_test_xxx</S>
              </CodeBlock>
            </Reveal>
            <Reveal delay={80}>
              <CodeBlock title=".env.local" lang="live">
                <F>BANZAMI_ENV</F>=<S>live</S>
                {'\n'}
                <F>BANZAMI_GATEWAY_URL</F>=<S>https://api.banzami.com</S>
                {'\n'}
                <F>BANZAMI_API_KEY</F>=<S>bz_live_sk_xxx</S>
                {'\n'}
                <F>BANZAMI_MERCHANT_ID</F>=<S>…</S>
                {'\n'}
                <F>BANZAMI_WALLET_ID</F>=<S>…</S>
                {'\n'}
                <F>BANZAMI_WEBHOOK_SECRET</F>=<S>whsec_live_xxx</S>
              </CodeBlock>
            </Reveal>
          </div>

          {/* Mismatch protection */}
          <h3 className="mb-4 mt-12 text-[18px] font-black text-ink">Proteção contra ambiente errado</h3>
          <p className="m-0 mb-5 max-w-[760px] text-[14px] font-semibold leading-[1.55] text-ink-soft">
            O SDK deteta o ambiente a partir do prefixo da chave. Se indicar um ambiente que entra em
            conflito com a chave, o cliente falha logo na construção — antes de qualquer pedido.
          </p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal>
              <CodeBlock title="ok.ts" lang="inferido da chave">
                <K>new</K> <F>BanzamiClient</F>({'{'}
                {'\n'}
                {'  '}apiKey: process.env.<F>BANZAMI_API_KEY</F>,{'\n'}
                {'}'}); <span className="text-ink-muted">{'// bz_test_sk_… → sandbox'}</span>
              </CodeBlock>
            </Reveal>
            <Reveal delay={80}>
              <CodeBlock title="erro.ts" lang="mismatch">
                <K>new</K> <F>BanzamiClient</F>({'{'}
                {'\n'}
                {'  '}environment: <S>&quot;live&quot;</S>,{'\n'}
                {'  '}apiKey: <S>&quot;bz_test_sk_…&quot;</S>,{'\n'}
                {'}'});{'\n\n'}
                <span className="text-cherry-dark">{'// throws BanzamiConfigError:'}</span>
                {'\n'}
                <span className="text-cherry-dark">{'// environment/key mismatch'}</span>
              </CodeBlock>
            </Reveal>
          </div>

          {/* Security warnings */}
          <Reveal className="mt-8 rounded-card border border-pink-200 bg-pink-100 px-6 py-[20px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry-dark">Regras de segurança</p>
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 text-[13.5px] font-semibold leading-[1.5] text-ink-secondary sm:grid-cols-2">
              <li>Nunca expor chaves secretas no browser ou mobile.</li>
              <li>Nunca commitar chaves nem o ficheiro <span className="bz-mono">.env.local</span>.</li>
              <li>Usar chaves diferentes por ambiente.</li>
              <li>Rodar (revogar e recriar) chaves se vazarem.</li>
              <li>Verificar sempre a assinatura dos webhooks.</li>
              <li>Usar idempotency keys nas operações que movem dinheiro.</li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ===================== 7 · SANDBOX ===================== */}
      <section id="sandbox" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="SANDBOX"
            title="Teste tudo em sandbox"
            lead="Um ambiente simulado e isolado da produção, para integrar sem risco."
            className="mb-4 max-w-[680px]"
          />
          <p className="m-0 mb-8 max-w-[680px] text-[13px] font-semibold leading-[1.55] text-ink-muted">
            Os exemplos usam nomes e endpoints previstos para integração técnica. A disponibilidade
            pública dos pacotes e chaves de produção acompanha a ativação da plataforma.
          </p>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SANDBOX_CAPS.map((cap, i) => (
                <Reveal
                  key={cap}
                  delay={(i % 2) * 40}
                  className="flex items-center gap-[12px] rounded-card bg-cream-50 p-[18px]"
                >
                  <span
                    className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px]"
                    style={{ background: '#FBD2D0' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="#9A1B22" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="text-[14px] font-bold text-[#3a2a2e]">{cap}</span>
                </Reveal>
              ))}
            </div>
            <Reveal delay={60}>
              <CodeBlock title="sandbox.ts" lang="sandbox">
                <K>const</K> payment ={'\n'}
                {'  '}<K>await</K> client.sandbox.payments.<F>confirm</F>(<S>&quot;pay_01HX&quot;</S>);
              </CodeBlock>
              <p className="m-0 mt-5 rounded-card bg-cream-100 px-6 py-[18px] text-[14px] font-semibold leading-[1.6] text-ink-secondary">
                <strong className="text-cherry-dark">Estado.</strong> Sandbox técnico disponível.
                Produção depende da ativação dos rails externos aprovados.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== 8 · WEBHOOKS ===================== */}
      <section id="webhooks" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="WEBHOOKS"
            title="Eventos em tempo real"
            lead="Cada mudança de estado é entregue como um evento assinado."
            className="mb-10 max-w-[680px]"
          />
          <Reveal className="mb-8 flex flex-wrap gap-2">
            {WEBHOOK_EVENTS.map((e) => (
              <span
                key={e}
                className="bz-mono rounded-pill border border-pink-200 bg-white px-[14px] py-[8px] text-[12.5px] font-semibold text-cherry-dark"
              >
                {e}
              </span>
            ))}
          </Reveal>

          {/* Theory blocks */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <WebhookTheory q="O que é um webhook?">
              Um evento que o Banzami envia ao backend do comerciante quando algo muda — por exemplo,
              quando um pagamento é confirmado.
            </WebhookTheory>
            <WebhookTheory q="Porquê webhooks em vez de polling?">
              Em vez de a app perguntar repetidamente «já pagou?», o Banzami avisa assim que o estado
              muda. Menos pedidos, confirmação mais rápida.
            </WebhookTheory>
            <WebhookTheory q="E se o backend estiver offline?">
              O evento pode ser repetido mais tarde. O comerciante deve processar eventos de forma
              idempotente para não duplicar a venda.
            </WebhookTheory>
            <WebhookTheory q="Porque a assinatura importa?">
              A verificação da assinatura confirma que o evento veio mesmo do Banzami e não foi
              forjado por terceiros.
            </WebhookTheory>
          </div>

          {/* Delivery + retry explainer */}
          <Reveal className="mb-10 rounded-card border border-border-soft bg-white p-[clamp(22px,3vw,34px)] shadow-[0_24px_60px_-44px_rgba(181,16,31,.35)]">
            <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
              Entrega e repetição
            </span>
            <div className="mt-5">
              <RetryFlow />
            </div>
            <p className="m-0 mt-6 rounded-card bg-cream-50 px-5 py-[14px] text-[13.5px] font-semibold leading-[1.6] text-ink-secondary">
              Exemplo prático: o sistema recebe{' '}
              <span className="bz-mono text-cherry-dark">payment_session.paid</span> e marca
              automaticamente a encomenda <span className="bz-mono">#123</span> como paga.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <Reveal>
              <CodeBlock title="payload.json" lang="payment_session.paid">
                {'{\n'}
                {'  '}<F>&quot;type&quot;</F>: <S>&quot;payment_session.paid&quot;</S>,{'\n'}
                {'  '}<F>&quot;data&quot;</F>: {'{\n'}
                {'    '}<F>&quot;id&quot;</F>: <S>&quot;pay_01HX...&quot;</S>,{'\n'}
                {'    '}<F>&quot;status&quot;</F>: <S>&quot;confirmed&quot;</S>,{'\n'}
                {'    '}<F>&quot;amount&quot;</F>: <F>2500</F>,{'\n'}
                {'    '}<F>&quot;currency&quot;</F>: <S>&quot;AOA&quot;</S>
                {'\n  }'}
                {'\n}'}
              </CodeBlock>
              <div className="mt-6">
                <CodeBlock title="verify.ts" lang="signature">
                  <K>const</K> event = client.webhooks.<F>verify</F>({'{\n'}
                  {'  '}payload,{'\n'}
                  {'  '}signature: headers[<S>&quot;banza-signature&quot;</S>],{'\n'}
                  {'  '}secret: process.env.<F>BANZA_WEBHOOK_SECRET</F>,{'\n'}
                  {'});'}
                </CodeBlock>
              </div>
            </Reveal>
            <Reveal delay={80} className="rounded-card border border-border-soft bg-white p-[clamp(22px,3vw,36px)] shadow-[0_24px_60px_-40px_rgba(181,16,31,.35)]">
              <WebhookFlowDiagram />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== USE CASES ===================== */}
      <section
        id="use-cases"
        className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]"
      >
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="CASOS DE UTILIZAÇÃO"
            title="Casos de utilização"
            lead="Onde o Banzami encaixa no dia a dia angolano — do problema atual ao ponto de integração técnico."
            className="mb-10 max-w-[700px]"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u, i) => (
              <Reveal
                key={u.title}
                delay={(i % 3) * 50}
                className="flex flex-col rounded-card border border-border-soft bg-white p-[24px] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]"
              >
                <h3 className="m-0 mb-4 text-[17px] font-black text-ink">{u.title}</h3>
                <div className="mb-3">
                  <span className="bz-mono text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                    Problema hoje
                  </span>
                  <p className="m-0 mt-[4px] text-[13px] font-semibold leading-[1.5] text-ink-soft">
                    {u.today}
                  </p>
                </div>
                <div className="mb-3">
                  <span className="bz-mono text-[10px] font-bold uppercase tracking-[0.06em] text-cherry">
                    Fluxo Banzami
                  </span>
                  <p className="m-0 mt-[4px] text-[13px] font-semibold leading-[1.5] text-ink-secondary">
                    {u.flow}
                  </p>
                </div>
                <div className="mt-auto rounded-[12px] bg-cream-50 px-[13px] py-[10px]">
                  <span className="bz-mono text-[10px] font-bold uppercase tracking-[0.06em] text-cherry-dark">
                    Ponto de integração
                  </span>
                  <p className="m-0 mt-[3px] bz-mono text-[11.5px] font-semibold leading-[1.5] text-[#3a2a2e]">
                    {u.integration}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== RECONCILIATION ===================== */}
      <section id="reconciliation" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="RECONCILIAÇÃO"
            title="Reconciliação e comprovativos"
            lead="Muitos negócios perdem tempo a cruzar screenshots, transferências e vendas à mão. O Banzami ajuda a fechar essa lacuna."
            className="mb-10 max-w-[720px]"
          />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
            <Reveal className="rounded-card border border-border-soft bg-white p-[clamp(22px,3vw,30px)] shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]">
              <p className="m-0 mb-4 text-[14px] font-semibold leading-[1.6] text-ink-secondary">
                O Banzami melhora a reconciliação ao expor referências consistentes em cada
                pagamento:
              </p>
              <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
                {[
                  'Recibos digitais por transação.',
                  'Referências guardadas e consultáveis.',
                  'Metadata definida pelo comerciante.',
                  'IDs de pagamento expostos na API.',
                  'Webhooks de cada mudança de estado.',
                  'Registos no ledger de dupla entrada.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-[11px]">
                    <span className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] bg-pink-200">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" stroke="#9A1B22" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-[14px] font-semibold leading-[1.5] text-ink-soft">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={70}>
              <CodeBlock title="metadata" lang="POST /v1/business/payment-sessions">
                {'{\n'}
                {'  '}<F>&quot;amount&quot;</F>: <F>2500</F>, <F>&quot;currency&quot;</F>: <S>&quot;AOA&quot;</S>,{'\n'}
                {'  '}<F>&quot;recipient&quot;</F>: <S>&quot;@cantina-alex&quot;</S>,{'\n'}
                {'  '}<F>&quot;metadata&quot;</F>: {'{\n'}
                {'    '}<F>&quot;order_id&quot;</F>: <S>&quot;order_123&quot;</S>
                {'\n  }'}
                {'\n}'}
              </CodeBlock>
              <p className="m-0 mt-5 rounded-card bg-cream-100 px-6 py-[16px] text-[13.5px] font-semibold leading-[1.6] text-ink-secondary">
                O comerciante envia{' '}
                <span className="bz-mono text-cherry-dark">metadata.order_id = &quot;order_123&quot;</span>{' '}
                e depois cruza, num só passo, o pagamento, o recibo e a encomenda interna.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== 9 · SECURITY ===================== */}
      <section id="security" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="SEGURANÇA"
            title="Construído com segurança desde o início"
            lead="Chaves, assinaturas, idempotência e um ledger de dupla entrada por defeito."
            className="mb-10 max-w-[680px]"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map((s, i) => (
              <Reveal
                key={s.title}
                delay={(i % 3) * 50}
                className="rounded-card border border-border-soft bg-white p-[24px] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]"
              >
                <h3 className="m-0 mb-2 text-[17px] font-black text-ink">{s.title}</h3>
                <p className="m-0 text-[14px] font-semibold leading-[1.5] text-ink-soft">{s.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== 10 · ERROR HANDLING ===================== */}
      <section id="errors" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="ERROS"
            title="Erros claros para integrações robustas"
            lead="Cada erro tem um código estável e uma mensagem legível."
            className="mb-10 max-w-[680px]"
          />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
            <Reveal>
              <CodeBlock title="error.json" lang="response">
                {'{\n'}
                {'  '}<F>&quot;error&quot;</F>: {'{\n'}
                {'    '}<F>&quot;code&quot;</F>: <S>&quot;payment_not_confirmed&quot;</S>,{'\n'}
                {'    '}<F>&quot;message&quot;</F>: <S>&quot;The payment has not been confirmed yet.&quot;</S>
                {'\n  }'}
                {'\n}'}
              </CodeBlock>
            </Reveal>
            <Reveal delay={70} className="overflow-hidden rounded-card border border-border-soft bg-white shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]">
              {ERROR_CODES.map((e, i) => (
                <div
                  key={e.code}
                  className={`px-[20px] py-[14px] ${i > 0 ? 'border-t border-border-soft' : ''}`}
                >
                  <span className="bz-mono text-[12.5px] font-semibold text-cherry">{e.code}</span>
                  <p className="m-0 mt-[3px] text-[13px] font-semibold leading-[1.5] text-ink-soft">
                    {e.desc}
                  </p>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== INTEGRATION RESPONSIBILITIES ===================== */}
      <section
        id="responsibilities"
        className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]"
      >
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="RESPONSABILIDADES"
            title="Responsabilidades da integração"
            lead="O que o lado do comerciante deve garantir para uma integração robusta e segura."
            className="mb-10 max-w-[700px]"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {RESPONSIBILITIES.map((r, i) => (
              <Reveal
                key={r}
                delay={(i % 2) * 40}
                className="flex items-start gap-[12px] rounded-card border border-border-soft bg-white p-[18px] shadow-[0_14px_40px_-30px_rgba(181,16,31,.3)]"
              >
                <span className="mt-[1px] flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] bg-pink-200">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="#9A1B22" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-[14px] font-semibold leading-[1.5] text-[#3a2a2e]">{r}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== 11 · EXAMPLES ===================== */}
      <section id="examples" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="EXEMPLOS"
            title="Exemplos práticos de integração"
            lead="Seis casos reais — do checkout ao marketplace — cada um com problema, ponto de integração e código em sandbox."
            className="mb-10 max-w-[700px]"
          />
          <div className="flex flex-col gap-6">
            {EXAMPLES.map((ex, i) => (
              <Reveal
                key={ex.title}
                delay={(i % 2) * 50}
                className="grid grid-cols-1 gap-6 rounded-card border border-border-soft bg-white p-[clamp(22px,3vw,34px)] shadow-[0_20px_50px_-38px_rgba(181,16,31,.32)] lg:grid-cols-[0.85fr_1.15fr] lg:items-start"
              >
                <div>
                  <h3 className="m-0 text-[20px] font-black text-ink">{ex.title}</h3>
                  <div className="mt-5 flex flex-col gap-[14px]">
                    <div>
                      <span className="bz-mono text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                        Problema resolvido
                      </span>
                      <p className="m-0 mt-[4px] text-[13.5px] font-semibold leading-[1.5] text-ink-soft">
                        {ex.problem}
                      </p>
                    </div>
                    <div>
                      <span className="bz-mono text-[10px] font-bold uppercase tracking-[0.06em] text-cherry">
                        Ponto de integração
                      </span>
                      <p className="m-0 mt-[4px] text-[13.5px] font-semibold leading-[1.5] text-ink-secondary">
                        {ex.point}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <span className="bz-mono text-[10px] font-bold uppercase tracking-[0.06em] text-cherry-dark">
                        Evento-chave
                      </span>
                      <span className="bz-mono rounded-pill border border-pink-200 bg-white px-[12px] py-[5px] text-[11.5px] font-semibold text-cherry-dark">
                        {ex.event}
                      </span>
                    </div>
                    <div className="rounded-[12px] bg-cream-50 px-[13px] py-[10px]">
                      <span className="bz-mono text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                        O que o utilizador / comerciante vê
                      </span>
                      <p className="m-0 mt-[3px] text-[13px] font-semibold leading-[1.5] text-ink-secondary">
                        {ex.sees}
                      </p>
                    </div>
                  </div>
                </div>
                <CodeBlock title={`${ex.title.toLowerCase().replace(/[ /]+/g, '-')}.ts`} lang="sandbox">
                  {ex.snippet}
                </CodeBlock>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== 12 · GOING LIVE ===================== */}
      <section id="going-live" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="GOING LIVE"
            title="Do sandbox à produção"
            lead="Um caminho claro do primeiro teste à monitorização — com a ativação de produção dependente dos rails externos aprovados."
            className="mb-12 max-w-[700px]"
          />
          <Reveal className="mb-10 rounded-card border border-border-soft bg-white p-[clamp(24px,4vw,44px)] shadow-[0_30px_70px_-44px_rgba(181,16,31,.35)]">
            <GoingLiveDiagram />
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GOING_LIVE_STEPS.map((s, i) => (
              <Reveal
                key={s.n}
                delay={(i % 3) * 50}
                className={`rounded-card border p-[24px] ${
                  s.title === 'Production Activation'
                    ? 'border-pink-200 bg-pink-100'
                    : 'border-border-soft bg-white shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]'
                }`}
              >
                <div className="mb-3 flex items-center gap-[10px]">
                  <span
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] text-[13px] font-black text-white"
                    style={{ background: 'linear-gradient(150deg,#B5101F,#6E0E14)' }}
                  >
                    {s.n}
                  </span>
                  <h3 className="m-0 text-[16px] font-black text-ink">{s.title}</h3>
                  {s.title === 'Production Activation' && (
                    <span className="bz-mono rounded-pill bg-pink-200 px-[9px] py-[3px] text-[9.5px] font-extrabold tracking-[0.04em] text-cherry-dark">
                      PENDENTE
                    </span>
                  )}
                </div>
                <p className="m-0 text-[14px] font-semibold leading-[1.5] text-ink-soft">{s.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== 12.5 · AVAILABILITY & STATUS ===================== */}
      <section id="availability" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="DISPONIBILIDADE & ESTADO"
            title="Estado atual e limitações"
            lead="O que está validado hoje, o que é simulado e o que ainda não faz parte do âmbito testado — sem exageros."
            className="mb-10 max-w-[720px]"
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Reveal className="rounded-card border border-border-soft bg-white p-[24px] shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]">
              <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-received">
                Validado no Sandbox
              </span>
              <p className="m-0 mt-3 text-[14px] font-semibold leading-[1.55] text-ink-soft">
                Os fluxos de API/SDK da Developer Platform foram validados no Sandbox interno:
                autenticação, workspace e projeto, chaves e âmbitos, links e intents de
                pagamento, checkout online, verificação de recibo, reconciliação, revogação de
                chave e rejeição de acessos inválidos.
              </p>
            </Reveal>
            <Reveal
              delay={70}
              className="rounded-card border border-pink-200 bg-white p-[24px] shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]"
            >
              <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-cherry-dark">
                Simulado
              </span>
              <p className="m-0 mt-3 text-[14px] font-semibold leading-[1.55] text-ink-soft">
                A entrega de webhooks para um endpoint HTTPS público está fora do âmbito do
                Sandbox. A assinatura{' '}
                <span className="bz-mono text-[12.5px]">banza-signature</span>, o retry/backoff e
                a idempotência estão verificados; a entrega externa é simulada.
              </p>
            </Reveal>
            <Reveal
              delay={140}
              className="rounded-card border border-border-soft bg-cream-50 p-[24px] shadow-[0_16px_40px_-32px_rgba(181,16,31,.3)]"
            >
              <span className="bz-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                Ainda não no âmbito testado
              </span>
              <p className="m-0 mt-3 text-[14px] font-semibold leading-[1.55] text-ink-soft">
                Um Developer Console visual ainda não faz parte do âmbito testado. É planeado em
                separado e não é reivindicado como disponível nesta documentação.
              </p>
            </Reveal>
          </div>
          <Reveal className="mt-6 rounded-card bg-cream-100 px-6 py-[18px]">
            <p className="m-0 text-[14px] font-semibold leading-[1.6] text-ink-secondary">
              O Banzami Developers está atualmente documentado para fins de Sandbox controlado e
              preparação regulatória. A disponibilidade pública com dinheiro real depende das
              condições aplicáveis de ativação regulatória, operacional e dos rails de pagamento.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ===================== 13 · FINAL CTA ===================== */}
      <DeveloperCTA />
      <Footer />
    </main>
  );
}
