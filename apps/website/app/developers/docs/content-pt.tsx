'use client';

// PT documentation content, one page function per documentation route.
//
// The pages are organised by task (DOCS-DX-001): get started, build, console,
// reference, learn, resources. Each guide answers what, why, how, how you know
// it worked and what comes next, and ends somewhere. Structured facts —
// endpoints, events, errors, symptoms — live in data modules both languages
// render, so a fact cannot be true in one language and stale in the other.

import { MailLink } from '@/components/MailLink';
import type { ReactNode } from 'react';
import { GlossaryTerm } from './GlossaryTerm';
import { ConceptModelDiagram, SegregatedAccountsDiagram, PathDiagram, FinancialSetupDiagram, ResponsibilityDiagram, SettlementSplitDiagram, RealtimeChannelsDiagram, MoneyMovementDiagram } from './diagrams';
import { CapabilityCards } from './CapabilityCards';
import { GLOSSARY } from './glossary';
import { Badge, BODY, Callout, Code, CodeBlock, H1_STYLE, H2, INK, LI, LINK, MUT, P, PageLede, Section, TABLE, TD, TD_HEAD, TD_MONO, TH, THEAD, UL, mono, type Tone } from './ui';
import { ResourceReference, ScopeTable } from './reference';
import { ErrorCatalogue, HttpClassTable } from './ErrorCatalogue';
import { EventReference } from './EventReference';
import { Troubleshooting } from './Troubleshooting';
import { StageBar, StepCard, NextStepCards, RecipeCard, ChapterFacts, DoDont } from './dx';
import { EVENT_NAMES } from './events';

export type CopyFn = (text: string, label: string) => void;

// -- SDK maturity matrix (verified: complete source, none published) ------------
const SDKS: { name: string; lang: string; state: string; tone: Tone; consume: string }[] = [
  { name: '@banzami/sdk', lang: 'TypeScript / Node.js', state: 'Publicado — servidor', tone: 'ok', consume: 'npm install @banzami/sdk' },
  // banzami_client is the PUBLIC client SDK; banzami_flutter is Banzami's own
  // application framework and is not published (Banzami ADR-053).
  { name: 'banzami_client', lang: 'Dart / Flutter', state: 'Publicado — cliente, só leitura', tone: 'ok', consume: 'dart pub add banzami_client' },
  { name: 'banzami-python', lang: 'Python', state: 'Não publicado', tone: 'val', consume: '—' },
  { name: 'banzami/sdk-php', lang: 'PHP', state: 'Não publicado', tone: 'val', consume: '—' },
]

// -- Real operator webhook events (verified emitted names) ----------------------
// Public catalogue — every event the operator actually EMITS, and only those.
//
// The rule is emission, not registrability. The gateway also accepts
// subscriptions to payment.completed and payout.sent, which nothing emits yet;
// listing those would hand an integrator an endpoint that never fires, which is
// worse than not mentioning them. Names nothing emits and nothing accepts
// (transfer.completed, wallet.credit, …) are not here either.
//
// Kept in step with core's emitters by tools/check-webhook-event-catalogue.mjs.
const EVENTS: string[] = EVENT_NAMES;

// -- Code samples (grounded in DOA's verified SDK usage) ------------------------
const SAMPLE_SESSION = `import { BanzamiClient } from '@banzami/sdk';

// A chave secreta bz_test_sk_ vive apenas no servidor.
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });

// 0. O projeto tem de estar financeiramente pronto — senão: 403 PAYMENTS_UNAVAILABLE.
const setup = await banzami.getFinancialSetup();

// 1. Criar uma sessão de pagamento.
//    Não indique quem recebe: vem da configuração financeira do projeto, e a API
//    recusa merchant_id ou wallet_id. (walletAccountId escolhe uma conta do projeto.)
const session = await banzami.createPaymentSession({
  purpose: 'ORDER',
  referenceType: 'PEDIDO',
  referenceId: 'order_123',
  amountMinor: 25000,      // 250 Kz — 100 unidades menores = 1 Kz
  currency: 'AOA',
  description: 'Pedido #123',
});

// 2. Apresentar o link ou o QR ao pagador.
const link = banzami.paymentSessionInterface(session, 'PAYMENT_LINK');
// link.value  ->  https://pay.banzami.com/pay/{slug}

// 3. Confirmar o pagamento. A fonte de verdade é o Banzami, não o browser do pagador:
//    confirme no servidor, pelo webhook ou lendo a sessão.
const agora = await banzami.getPaymentSession(session.session_id);
// agora.status  ->  'PAID' depois de o pagador pagar`;

// curl-first — a primeira chamada bem-sucedida não exige nenhum SDK.
// Chaves e identificadores são SEMPRE placeholders; tudo é Sandbox-only.
const SAMPLE_CURL_ME = `# Verificar a sua chave de teste (placeholder) contra a API Sandbox
curl https://sandbox-api.banzami.com/v1/me \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"

# Resposta (200)
{
  "environment": "SANDBOX",
  "project": {
    "id": "6f1c2d3e-0000-4000-8000-000000000000",
    "name": "Meu Projeto",
    "ref": "meu-projeto"
  },
  "scopes": ["identity:read"],
  "key_status": "ACTIVE"
}`;

const SAMPLE_CURL_SESSION = `# Criar uma sessão de pagamento no Sandbox (valores placeholder).
# Quem recebe vem da configuração financeira do projeto: o pedido não nomeia
# merchant nem carteira. amount_minor 25000 = 250 Kz (100 unidades menores = 1 Kz).
curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \\
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
  }'

# Resposta (201) — campos principais
{
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
}`;

const SAMPLE_WEBHOOK_ENVELOPE = `# Envelope de evento entregue ao seu endpoint (implementado no Sandbox)
{
  "id": "evt_XXXXXXXX",
  "type": "payment_session.paid",
  "created_at": "2026-07-11T11:46:02Z",
  "data": { /* objeto do evento */ }
}`;

const SAMPLE_IDEM_RETRY = `# Repetição segura: a mesma Idempotency-Key reproduz a resposta original
curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_pedido_123" \
  -d '{ ...mesmo corpo... }'
# -> 201 com a mesma resposta; nenhuma sessão duplicada é criada.

# Evite: mudar a Idempotency-Key ao repetir após um timeout —
# isso pode criar um segundo efeito. Reutilize sempre a chave original.`;

const SAMPLE_ERROR = `# Envelope canónico de erro (Sandbox)
{
  "code": "INVALID_AMOUNT",
  "message": "amount_minor must be a positive integer",
  "request_id": "4f3c1b9a2e7d5086c1af03be7d2915ce"
}`;

const SAMPLE_KEYS = `bz_test_pk_XXXXXXXXXXXXXXXX   # publicável — pode ir no cliente
bz_test_sk_XXXXXXXXXXXXXXXX   # secreta — apenas no servidor, revelada uma única vez`;

const SAMPLE_WEBHOOK = `import { BanzamiClient } from '@banzami/sdk';

// O segredo do endpoint vem com o cliente — sem ele, constructEvent recusa.
const apiKey = process.env.BANZAMI_API_KEY;
const webhookSecret = process.env.BANZAMI_WEBHOOK_SECRET;
if (!apiKey || !webhookSecret) throw new Error('chave ou segredo de webhook em falta');
const banzami = new BanzamiClient({ apiKey, webhookSecret });

// No endpoint de webhook (servidor): o corpo em bruto e o header.
const raw = await req.text();
const sig = req.headers.get('banza-signature') ?? '';
// constructEvent verifica a assinatura e só depois devolve o evento.
// Com uma assinatura inválida, lança uma exceção e nada é lido.
const event = banzami.webhooks.constructEvent(raw, sig);

switch (event.type) {
  case 'payment_session.paid':             /* confirmar a doação (idempotente) */ break;
  case 'application_settlement.completed': /* registar a liquidação */            break;
}

// Responda 2xx rapidamente; a entrega é at-least-once, sem garantia de ordem.`;

const SAMPLE_WEBHOOK_MANAGE = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });

// Registar o endpoint. Sem merchant, sem wallet: o dono vem da configuração financeira do projeto.
const ep = await banzami.createWebhookEndpoint({
  url:    'https://www.exemplo.com/api/webhooks/banzami',
  events: ['payment_session.paid'],
});
guardarSegredo(ep.secret);   // devolvido uma vez — nenhuma leitura posterior o traz

// Ver o que aconteceu
const { data: endpoints } = await banzami.listWebhookEndpoints();
const { data: eventos }   = await banzami.listWebhookEvents(20);
const { data: entregas }  = await banzami.listWebhookDeliveries(eventos[0].id);

// Rodar o segredo. Atualize o recetor antes: a troca é imediata, não sobreposta.
const rodado = await banzami.rotateWebhookEndpointSecret(ep.id);
guardarSegredo(rodado.secret);`;



// -- Samples for the task pages ------------------------------------------------
const SAMPLE_READY = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });

// Antes de mostrar «Pagar»: o projeto pode receber?
const setup = await banzami.getFinancialSetup();
const podeReceber = setup.financial_setup.state !== 'UNCONFIGURED' && setup.wallet.ready;
// state: 'UNCONFIGURED' | 'READY' | 'SEALED'

// Antes de liquidar: o que ainda bloqueia?
if (!setup.settlement.ready) console.log(setup.settlement.blockers);`;

const SAMPLE_LINK_CURL = `# Criar um link de pagamento reutilizável (valores placeholder).
# amount_minor 25000 = 250 Kz. Sem merchant_id nem wallet_id: quem recebe vem do projeto.
curl -X POST https://sandbox-api.banzami.com/v1/payment-links \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idem_link_001" \\
  -d '{ "amount_minor": 25000, "currency": "AOA", "description": "Pedido #123" }'

# Resposta (201) — o pagador abre https://pay.banzami.com/pay/slug_exemplo
{ "slug": "slug_exemplo", "amount_minor": 25000, "currency": "AOA", "status": "ACTIVE" }`;

const SAMPLE_LINK = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });

// Sem merchantId nem walletId: quem recebe vem da configuração financeira do projeto.
const link = await banzami.createPaymentLink({
  amountMinor: 25000,       // 250 Kz
  currency: 'AOA',
  description: 'Pedido #123',
});
// link.slug  ->  o pagador abre https://pay.banzami.com/pay/{slug}

const pagina = await banzami.listPaymentLinks({ limit: 20 });`;

const SAMPLE_REALTIME = `import { watchPaymentSessionStatus } from '@banzami/sdk/realtime';

// Na página do pagador. O token vem do seu servidor (session.realtime.token);
// não é uma chave, e a função recusa uma chave secreta.
declare const sessionId: string;
declare const token: string;

const watch = watchPaymentSessionStatus({
  sessionId,
  token,
  onStatus: (status) => {
    if (status.status === 'PAID') {
      // Mostrar "pago". Entregar a encomenda só com o webhook verificado no servidor.
    }
  },
  onEnd: (end) => {
    if (end.reason === 'token_expired') {
      // Pedir ao seu servidor um token novo.
    }
  },
});
// watch.close() ao sair da página.`;

const SAMPLE_TEST_PAYER = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;   // bz_test_sk_ com sandbox:write
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });
declare const sessionId: string;   // uma sessão do seu projeto

const payer = await banzami.createTestPayer({ label: 'Cliente de teste' });
await banzami.fundTestPayer(payer.id, { amountMinor: 100000, idempotencyKey: 'carregar_001' });  // 1 000 Kz fictícios
const paid = await banzami.payAsTestPayer(payer.id, {
  paymentSessionId: sessionId,
  via: 'QR',
  idempotencyKey: 'pagamento_001',
});
// paid.status  ->  'PAID';  paid.proof_reference  ->  o comprovativo

// Um pagamento que se conclui depois: 202 PENDING agora, PAID cerca de 10 s mais tarde.
declare const outraSessionId: string;
const depois = await banzami.payAsTestPayer(payer.id, {
  paymentSessionId: outraSessionId,
  simulate: 'DELAYED',
  idempotencyKey: 'pagamento_002',
});
// depois.status  ->  'PENDING'`;

const SAMPLE_WEBHOOK_TEST = `// Com o endpoint registado (createWebhookEndpoint):
declare const endpointId: string;
const test = await banzami.sendWebhookTestEvent(endpointId);
// test.type -> 'webhook.test';  test.synthetic -> true
const entregas = await banzami.listWebhookDeliveries(test.event_id);`;

const SAMPLE_REFUND = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });

// O pagamento a devolver: o refund_source que payment_session.paid trouxe,
// ou o da própria sessão depois de paga.
const sessao = await banzami.getPaymentSession('psess_exemplo');
if (!sessao.refund_source) throw new Error('a sessão ainda não foi paga');

// Crie a chave de idempotência antes do pedido e guarde-a:
// é ela que impede um segundo reembolso se a resposta se perder.
const chave = 'idem_reembolso_pedido_123';

const reembolso = await banzami.createRefund({
  source_type: sessao.refund_source.source_type,   // 'WALLET_PAYMENT'
  source_id:   sessao.refund_source.source_id,
  amount_minor: 5000,                               // 50 Kz — parcial
  currency:    'AOA',
  idempotency_key: chave,
  reason:      'Artigo em falta',
});
// reembolso.status -> 'SUCCEEDED'`;

const SAMPLE_TRANSFER = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });

// Duas contas do MESMO titular — por exemplo, a campanha A e a campanha B.
const t = await banzami.createTransfer({
  sourceWalletAccountId:      'wacc_campanha_a',
  destinationWalletAccountId: 'wacc_campanha_b',
  amountMinor: 50000,            // 500 Kz
  currency: 'AOA',
  idempotencyKey: 'idem_transferencia_123',
});
// t.status -> 'COMPLETED' — o total do titular não mudou, só a distribuição.`;

const SAMPLE_SETTLE = `import { BanzamiClient } from '@banzami/sdk';
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });

// 1. Pronto para liquidar? Cada bloqueio é a recusa que a liquidação daria.
const setup = await banzami.getFinancialSetup();
if (!setup.settlement.ready) throw new Error(setup.settlement.blockers.join(', '));

// 2. Liquidar a conta inteira da campanha. Sem montante e sem taxa no pedido.
const liquidacao = await banzami.createBusinessApplicationSettlement({
  sourceAccountId:         'wacc_campanha_123',
  beneficiaryBanzaName:    '@beneficiario_exemplo',
  feeDestinationBanzaName: '@meu-negocio',       // quando o seu preço tem taxa
  referenceId:             'campanha_123',
  idempotencyKey:          'idem_liquidacao_campanha_123',
});
// liquidacao.gross_amount_minor     100000   (1 000 Kz, o saldo da conta)
// liquidacao.application_fee_minor    2000   (200 bps = 2%)
// liquidacao.net_amount_minor        98000   (para o beneficiário)`;

const SAMPLE_WEBHOOK_WRONG = `// (banzami foi criado com { apiKey, webhookSecret })

// ERRADO — lê o corpo como JSON e só depois verifica.
// Os bytes que chegam à verificação já não são os que o Banzami assinou,
// e o seu código usou dados que ninguém autenticou.
const evento = await req.json();                      // ✗ parse antes de verificar
banzami.webhooks.constructEvent(JSON.stringify(evento), assinatura); // ✗ falha

// CERTO — o corpo em bruto, verificado, e só então o evento.
const raw = await req.text();
const verificado = banzami.webhooks.constructEvent(raw, assinatura);`;


const QS_STAGES = [
  { title: 'Conta e projeto', steps: [1, 3] as [number, number], note: 'Alguns minutos, com um email.' },
  { title: 'Configuração financeira', steps: [4, 4] as [number, number], note: 'Revista pelo Banzami antes de ficar pronta.' },
  { title: 'Chave e SDK', steps: [5, 7] as [number, number], note: 'Alguns minutos, até à primeira resposta 200.' },
  { title: 'Primeiro pagamento', steps: [8, 12] as [number, number], note: 'Sessão, pagamento, confirmação e webhook.' },
];

export function PtGetStarted({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="quickstart">
              <h1 style={H1_STYLE}>Quickstart</h1>
              <PageLede>Crie o seu primeiro pagamento no <GlossaryTerm id="sandbox">Sandbox</GlossaryTerm> e confirme-o no servidor. São doze passos, em quatro etapas.</PageLede>
              <Callout>
                <strong>Pré-requisitos:</strong> um email e Node.js 18 ou superior no servidor. No Sandbox não precisa de dados de nenhuma entidade nem de esperar por ninguém.
              </Callout>
              <PathDiagram title="Do registo ao primeiro pagamento" desc="Conta, workspace, projeto, configuração financeira, chave de API, SDK e pagamento, por esta ordem. No Sandbox, todos os passos são seus: nenhum espera por uma revisão do Banzami." steps={['Conta', 'Workspace', 'Projeto', 'Config. financeira', 'Chave de API', 'SDK', 'Pagamento']} highlight={3} />
              <StageBar lang="pt" stages={QS_STAGES} anchor={(n) => 'passo-' + n} />

              <H2 id="conta-e-projeto">Conta e projeto</H2>
              <StepCard lang="pt" n={1} of={12} id="passo-1" title="Entrar na Consola"
                what={<>A sua conta de developer em <Code>developers.banzami.com</Code>.</>}
                why="Workspaces, projetos e chaves pertencem a uma pessoa autenticada."
                success="A Consola mostra a lista de workspaces."
                next="Criar um workspace.">
                Abra <a href="/login" style={a}>developers.banzami.com/login</a> e entre com o seu email e o código de seis dígitos que recebe. Não há palavra-passe.
              </StepCard>

              <StepCard lang="pt" n={2} of={12} id="passo-2" title="Criar um workspace"
                what="O espaço partilhado pela sua equipa."
                why="O workspace define quem tem acesso aos projetos, às chaves e aos registos."
                success="O workspace aparece no seletor, com o seu papel de Owner."
                next="Criar o projeto da aplicação.">
                Na Consola, selecione <strong>Criar workspace</strong> e indique o nome da empresa ou da equipa.
              </StepCard>

              <StepCard lang="pt" n={3} of={12} id="passo-3" title="Criar um projeto"
                what="A unidade de integração: uma aplicação, com as suas chaves, webhooks e registos."
                why="As chaves identificam o projeto, e é o projeto que determina quem recebe os pagamentos."
                success="A Consola mostra o Project ID, que se mantém mesmo que mude o nome."
                next="Concluir a configuração financeira.">
                No workspace, selecione <strong>Novo projeto</strong>. Crie um projeto por aplicação.
              </StepCard>

              <H2 id="configuracao-financeira">Configuração financeira</H2>
              <P>
                A configuração financeira liga o projeto a um <strong>Business</strong>: a entidade que recebe os pagamentos.
                Sem ela, o projeto pode usar chaves, webhooks e a API, mas não pode receber — criar uma sessão responde <Code>403 PAYMENTS_UNAVAILABLE</Code>.
                No Sandbox, o Banzami cria para o projeto um <strong>negócio de teste</strong> no momento em que escolhe o tipo de uso: sem candidatura, sem documentos e sem esperar. É uma entidade de teste — não é verificada e não existe fora do Sandbox.
              </P>
              <FinancialSetupDiagram l={{
                title: 'Configuração financeira no Sandbox: dois caminhos, o mesmo resultado',
                desc: 'O projeto fica financeiramente pronto de uma de duas formas: criando um negócio de teste, de imediato, a partir do tipo de uso, ou ligando um Business existente com o código de consentimento do seu titular.',
                project: 'Projeto',
                newBusiness: 'Criar um negócio de teste', newNote: 'imediato, pelo tipo de uso',
                existing: 'Ligar um Business existente', existingNote: 'código de consentimento',
                ready: 'Financeiramente pronto', readyNote: 'o projeto pode receber pagamentos',
              }} />
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}>
                    <th style={TH}></th>
                    <th style={TH}>Negócio de teste</th>
                    <th style={TH}>Business existente</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Quando usar', 'Quase sempre: é o caminho do Sandbox para um projeto novo.', 'Outro projeto seu já tem um negócio de teste, ou quer usar um Business Banzami que já existe.'],
                      ['O que faz', 'Escolhe o tipo de uso: “Loja, serviço ou negócio” ou “Aplicação ou plataforma”.', 'Introduz o código de consentimento gerado pelo titular — na Consola do outro projeto ou na app Banzami Business.'],
                      ['Quem decide', 'Ninguém espera: o Banzami cria o negócio e atribui a classificação e o preço para esse uso.', 'O titular, ao gerar o código. O código é de utilização única e vale dez minutos.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <StepCard lang="pt" n={4} of={12} id="passo-4" title="Concluir a configuração financeira"
                what="Ligar o projeto ao Business que recebe os pagamentos."
                why="O destinatário de um pagamento vem desta configuração, nunca do pedido da sua aplicação."
                success={<>A Consola mostra o projeto como pronto, e <Code>getFinancialSetup()</Code> devolve <Code>financial_setup.state</Code> igual a <Code>READY</Code> ou <Code>SEALED</Code>.</>}
                next="Criar uma chave secreta.">
                Na Consola, abra <strong>Configuração financeira</strong>, escolha o tipo de uso e selecione <strong>Configurar a Sandbox</strong> — ou ligue um Business existente com o código. Na aplicação, consulte a prontidão antes de oferecer o pagamento:
                <CodeBlock label="ts · consultar a prontidão financeira" raw={SAMPLE_READY} onCopy={copy} />
              </StepCard>
              <Callout>A sua aplicação nunca envia uma classificação, um preço ou uma taxa: o Banzami atribui-os ao Business para o tipo de uso escolhido. O tipo de uso pode mudar até ao primeiro pagamento emitido.</Callout>

              <H2 id="chave-e-sdk">Chave e SDK</H2>
              <StepCard lang="pt" n={5} of={12} id="passo-5" title="Criar uma chave secreta"
                what={<>Uma <GlossaryTerm id="chave-secreta">chave secreta</GlossaryTerm> <Code>bz_test_sk_…</Code> com os scopes deste guia.</>}
                why="A chave autentica a sua aplicação. Os scopes definem-se na criação e não podem ser alterados."
                success={<>O segredo está guardado numa variável de ambiente do servidor, <Code>BANZAMI_API_KEY</Code>. A Consola mostra-o uma única vez.</>}
                next="Instalar o SDK.">
                No projeto, abra <strong>Chaves de API</strong> e crie uma chave com <Code>identity:read</Code>, <Code>payment_sessions:write</Code>,{' '}
                <Code>payment_sessions:read</Code>, <Code>webhooks:write</Code> e <Code>webhooks:read</Code>.
                <CodeBlock label="prefixos das chaves de teste" raw={SAMPLE_KEYS} onCopy={copy} />
              </StepCard>
              <Callout>Mantenha a chave secreta no servidor. <a href="/docs/trust#chaves" style={a}>Onde guardar chaves</a></Callout>

              <StepCard lang="pt" n={6} of={12} id="passo-6" title="Instalar o SDK"
                what={<><Code>@banzami/sdk</Code>, o SDK oficial de servidor.</>}
                why="O SDK trata da autenticação, das chaves de idempotência, das repetições e da verificação de webhooks."
                success={<><Code>import {'{'} BanzamiClient {'}'} from &apos;@banzami/sdk&apos;</Code> compila.</>}
                next="Fazer a primeira chamada.">
                <Code>npm install @banzami/sdk</Code>
              </StepCard>

              <StepCard lang="pt" n={7} of={12} id="passo-7" title="Fazer a primeira chamada"
                what={<><Code>GET /v1/me</Code> devolve o ambiente, o projeto, os scopes e o estado da chave.</>}
                why="Confirma a chave antes de criar qualquer pagamento."
                success={<><Code>200</Code> com <Code>&quot;environment&quot;: &quot;SANDBOX&quot;</Code>. Um <Code>401</Code> indica um problema com a chave.</>}
                next="Criar uma sessão de pagamento.">
                <CodeBlock label="curl · primeira chamada (GET /v1/me)" raw={SAMPLE_CURL_ME} onCopy={copy} />
                Com o SDK: <Code>await banzami.me()</Code>.
              </StepCard>

              <H2 id="primeiro-pagamento">Criar o primeiro pagamento</H2>
              <Callout>
                <strong>Montantes em unidades menores:</strong> <Code>amount_minor: 25000</Code> são 250 Kz (100 unidades menores = 1 Kz). <a href="/docs/concepts#unidades-menores" style={a}>Montantes em unidades menores</a>
              </Callout>
              <StepCard lang="pt" n={8} of={12} id="passo-8" title="Criar uma sessão de pagamento"
                what={<>Uma <GlossaryTerm id="sessao-pagamento">sessão de pagamento</GlossaryTerm>, com um link e um QR para o pagador.</>}
                why="A sessão é o recurso principal para cobrar: um pedido de pagamento, várias formas de pagar e uma confirmação."
                success={<><Code>201</Code> com <Code>status: &quot;ACTIVE&quot;</Code> e a interface <Code>PAYMENT_LINK</Code>. Guarde o <Code>session_id</Code>.</>}
                next="Abrir a página de pagamento.">
                Não indique o destinatário: vem da configuração financeira. Use <Code>reference_id</Code> para associar a sessão à sua encomenda.
                <CodeBlock label="ts · criar sessão de pagamento (@banzami/sdk)" raw={SAMPLE_SESSION} onCopy={copy} />
                <CodeBlock label="curl · criar sessão de pagamento (pedido + resposta)" raw={SAMPLE_CURL_SESSION} onCopy={copy} />
              </StepCard>
              <P style={{ fontSize: 13, color: MUT }}>
                Respostas de erro mais frequentes neste passo: <Code>403 PAYMENTS_UNAVAILABLE</Code> (passo 4 por concluir), <Code>403 INSUFFICIENT_SCOPE</Code> (passo 5),{' '}
                <Code>400 BAD_REQUEST</Code> (montante inválido) e <Code>409 IDEMPOTENCY_KEY_REUSED</Code>. <a href="/docs/errors" style={a}>Consultar o catálogo de erros</a>
              </P>

              <StepCard lang="pt" n={9} of={12} id="passo-9" title="Abrir a página de pagamento"
                what={<>O link da sessão, em <Code>pay.banzami.com/pay/…</Code>. O QR codifica o mesmo endereço.</>}
                why="O pagamento é feito numa página do Banzami. A sua aplicação nunca processa os dados do pagamento."
                success="A página mostra o montante e a indicação SANDBOX — ambiente de testes."
                next="Pagar a sessão e confirmá-la no servidor.">
                Abra <Code>paymentSessionInterface(session, &apos;PAYMENT_LINK&apos;).value</Code> num browser. A página muda para «Pagamento confirmado» assim que a sessão é paga, em qualquer dispositivo. <a href="/docs/payments#tempo-real" style={a}>Estado em tempo real</a>
              </StepCard>

              <StepCard lang="pt" n={10} of={12} id="passo-10" title="Confirmar o pagamento no servidor"
                what={<>Pagar a sessão com um pagador de teste e consultá-la com <Code>getPaymentSession</Code>.</>}
                why="O regresso do pagador à sua página não confirma o pagamento. A confirmação vem do Banzami."
                success={<><Code>status</Code> igual a <Code>PAID</Code>.</>}
                next="Receber a mesma confirmação por webhook.">
                Na Consola, em <strong>Dados de teste</strong>, crie um pagador de teste e pague a sessão pelo seu <Code>session_id</Code>. O pagamento segue o caminho real: a sessão fica paga, o evento é emitido e o comprovativo é emitido. <a href="/docs/testing#pagar-sessao" style={a}>Pagar uma sessão de teste</a>
              </StepCard>

              <StepCard lang="pt" n={11} of={12} id="passo-11" title="Receber o webhook"
                what={<>O evento <Code>payment_session.paid</Code>, entregue ao seu endpoint HTTPS.</>}
                why="Confirma o pagamento sem polling, mesmo que o pagador feche a página."
                success={<>Em <strong>Webhooks</strong>, a entrega mostra a resposta <Code>2xx</Code> do seu servidor.</>}
                next="Ver o pagamento na Consola.">
                Registe o endpoint com <Code>createWebhookEndpoint</Code>, verifique a assinatura antes de ler o evento e deduplique pelo <Code>id</Code>. <a href="/docs/webhooks" style={a}>Configurar webhooks</a>
              </StepCard>

              <StepCard lang="pt" n={12} of={12} id="passo-12" title="Ver o pagamento na Consola"
                what={<>O pagamento em <strong>Transações</strong> e os pedidos da chave em <strong>Registos</strong>.</>}
                why={<>É onde investiga uma resposta inesperada, a partir do <Code>request_id</Code>.</>}
                success="O pagamento aparece com o montante e o estado."
                next="Escolher o próximo passo.">
                No projeto, abra <strong>Transações</strong>. A Consola mostra as horas no fuso horário do seu browser.
              </StepCard>

              <NextStepCards lang="pt" items={[
                { href: '/docs/webhooks', title: 'Configurar webhooks', desc: 'Verificação, duplicados, repetições e rotação do segredo.' },
                { href: '/docs/payments', title: 'Aceitar pagamentos', desc: 'Sessões, links e QR, e quando usar cada um.' },
                { href: '/docs/testing', title: 'Testar no Sandbox', desc: 'Cenários de teste e respetivos resultados.' },
                { href: '/docs/doa', title: 'Construir como o DOA', desc: 'Uma integração completa, do pagamento à liquidação.' },
              ]} />
              </Section>
    </>
  );
}

export function PtConcepts({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="conceitos-banzami">
              <h1 style={H1_STYLE}>Como o Banzami funciona</h1>
              <PageLede>Como o Banzami organiza uma integração — workspace, projeto, Business — e as regras que todos os recursos financeiros seguem. Leia antes da primeira integração, ou quando um termo de outro guia não for claro.</PageLede>

              <H2 id="sandbox-live">Sandbox e Live</H2>
              <P>
                O <strong>Sandbox</strong> é o ambiente de integração disponível. Os pagamentos, saldos, reembolsos e liquidações seguem as mesmas regras
                que seguirão em produção, mas usam dinheiro fictício: nenhum valor entra ou sai de uma conta bancária.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}>
                    <th style={TH}></th>
                    <th style={TH}>Sandbox</th>
                    <th style={TH}>Financial Live</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Estado', 'Disponível', 'Indisponível (fail-closed)'],
                      ['Dinheiro', 'Fictício', '—'],
                      ['Regras da API', 'API v1: autorização, idempotência, eventos e erros', 'As mesmas, quando existir'],
                      ['Dados', 'Podem ser retirados pelo Banzami; mantenha os seus próprios registos', '—'],
                      ['Não comprova', 'Aprovação regulatória, prontidão para Live ou acesso automático a Live', '—'],
                      ['Chaves', 'bz_test_sk_ e bz_test_pk_', 'bz_live_ é recusada; não são emitidas'],
                      ['API', 'https://sandbox-api.banzami.com/v1', '—'],
                      ['Consola', 'Dados reais do seu projeto', '—'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P><a href="/docs/going-live" style={a}>Preparar a integração para Live</a></P>
              <CapabilityCards lang="pt" />

              <H2 id="como-o-dinheiro-se-move">Como o dinheiro se move</H2>
              <P>
                O Banzami é uma rede de pagamentos nativa de carteira. Cada participante — uma pessoa, um negócio, uma aplicação — tem uma carteira e contas de carteira,
                e cada movimento entre elas é um lançamento de dupla entrada escrito pelo Banzami Core no ledger. Um pagamento a um negócio, uma transferência entre pessoas,
                o reembolso de um pagamento feito a partir da carteira e uma liquidação de aplicação movem valor <strong>dentro</strong> da rede e não precisam de um rail externo
                para acontecer.
              </P>
              <MoneyMovementDiagram l={{
                title: 'Como o dinheiro se move no Banzami',
                desc: 'O sistema financeiro externo liga-se à rede Banzami em dois pontos: a entrada de valor e a saída de valor. Dentro da rede, a carteira de um pagador paga a outra pessoa ou a um negócio através do Core e do ledger, sem rail externo. A plataforma para developers lê essa mesma verdade financeira.',
                external: 'Sistema financeiro externo', externalRails: 'bancos · EMIS · PSP · outros rails',
                cashIn: 'entrada de valor', cashOut: 'saída de valor',
                network: 'Rede Banzami',
                payer: 'Carteira do pagador', person: 'Carteira de outra pessoa', business: 'Negócio · contas',
                p2p: 'transferência entre pessoas', payment: 'pagamento · QR · link',
                ledger: 'Banzami Core · ledger de dupla entrada',
                platform: 'Plataforma para developers: API · SDK · webhooks · tempo real',
                footnote: 'Sandbox: dinheiro fictício e rail externo simulado · Financial Live: indisponível',
              }} />
              <P>
                Os rails externos — bancos, EMIS, PSP — são <strong>fronteiras de interoperabilidade</strong>: são atravessados quando o valor entra ou sai da rede, ou quando
                uma operação o exige explicitamente. O Banzami é desacoplado dos rails, não independente deles, e isto não dispensa nenhuma obrigação regulatória.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Operação</th><th style={TH}>Atravessa um rail externo</th><th style={TH}>Com o rail externo em baixo</th></tr></thead>
                  <tbody>
                    {[
                      ['Pagamento a partir da carteira (sessão, link, QR)', 'Não', 'Conclui-se'],
                      ['Transferência entre pessoas', 'Não', 'Conclui-se'],
                      ['Reembolso de um pagamento feito a partir da carteira', 'Não', 'Conclui-se'],
                      ['Liquidação de aplicação', 'Não', 'Conclui-se'],
                      ['Pagamento pelo rail externo da página alojada', 'Sim', '503 PROVIDER_UNAVAILABLE; nada é criado nem creditado'],
                      ['Entrada ou saída de valor por um rail externo', 'Sim', 'Não se conclui sem a confirmação do rail'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Uma verdade financeira:</strong> o saldo deriva do ledger; nenhum serviço o altera diretamente. Sessões, links, QR e liquidações têm o seu próprio estado de fluxo, mas o valor é sempre o do ledger.</LI>
                <LI><strong>Webhooks e tempo real vêm depois:</strong> são enviados a partir de um movimento já registado. Uma entrega de webhook que falha é repetida; não desfaz o pagamento. O estado em tempo real mostra o resultado; não o decide.</LI>
                <LI><strong>Reconciliação:</strong> compara o ledger com o que um rail externo reporta e assinala diferenças; uma correção é sempre um novo movimento equilibrado.</LI>
                <LI><strong>No Sandbox:</strong> o carregamento de um pagador de teste é valor fictício criado pelo Core e não atravessa nenhum rail. Pode colocar o rail externo simulado do seu projeto em baixo e ver esta tabela acontecer. <a href="/docs/testing#rail-externo" style={a}>Testar com o rail externo em baixo</a></LI>
              </UL>

              <H2 id="modelo">O modelo de integração</H2>
              <ConceptModelDiagram l={{
                title: 'Workspace, projeto e o que cada projeto contém',
                desc: 'Cada workspace contém projetos. Cada projeto tem uma configuração financeira que o liga a um Business e às suas contas, e tem chaves de API e endpoints de webhook.',
                workspace: 'Workspace', project: 'Projeto',
                financialSetup: 'Configuração financeira', business: 'Business',
                accounts: 'Contas',
                apiKeys: 'Chaves de API', webhooks: 'Endpoints de webhook',
                noteWorkspace: 'quem tem acesso',
                noteProject: 'a unidade de integração',
                noteBusiness: 'quem recebe os pagamentos',
                noteKeys: 'como a aplicação se autentica',
                noteWebhooks: 'para onde vão os eventos',
              }} />
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Conceito</th><th style={TH}>O que é</th><th style={TH}>Não confundir com</th></tr></thead>
                  <tbody>
                    {[
                      ['Workspace', 'A fronteira de acesso da equipa. Uma pessoa pode pertencer a vários workspaces.', 'Projeto — a fronteira da integração.'],
                      ['Projeto', 'Uma aplicação: chaves, webhooks e registos.', 'Business — a entidade que recebe.'],
                      ['Business', 'A entidade verificada que recebe os pagamentos.', 'Conta — onde o valor fica, dentro da carteira do Business.'],
                      ['Conta', 'Uma divisão da carteira, por exemplo por campanha ou loja.', 'Carteira — o conjunto das contas do Business.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout>
                <strong>A autoridade vem da chave.</strong> A chave identifica o projeto, e o projeto determina o Business. Os ids que envia selecionam recursos seus; nunca dão acesso a recursos de outro projeto.
              </Callout>

              <H2 id="responsabilidades">O que é da sua aplicação e o que é do Banzami</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>A sua aplicação</th><th style={TH}>O Banzami</th></tr></thead>
                  <tbody>
                    {[
                      ['Clientes, encomendas, campanhas e regras de negócio', 'Execução dos pagamentos'],
                      ['Experiência do utilizador', 'Saldos, contas e registo contabilístico (ledger)'],
                      ['Estado dos seus recursos (encomenda paga, campanha encerrada)', 'Preços e taxas'],
                      ['Reconciliação com os seus próprios registos', 'Comprovativos e respetiva verificação pública'],
                      ['Pedido de liquidação, quando decide liquidar', 'Cálculo e execução da liquidação'],
                    ].map((r, i) => (
                      <tr key={i}><td style={TD}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="padrao">O mesmo padrão em todos os recursos financeiros</H2>
              <P>Todos os recursos financeiros se criam no servidor, se confirmam no servidor e se consultam na Consola.</P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ ...TABLE, minWidth: 640 }}>
                  <thead><tr style={THEAD}>
                    <th style={TH}>Recurso</th>
                    <th style={TH}>Criar</th>
                    <th style={TH}>Confirmar</th>
                    <th style={TH}>Idempotência</th>
                    <th style={TH}>Consola</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Sessão de pagamento', 'createPaymentSession', 'payment_session.paid · status PAID', 'Idempotency-Key; uma sessão por purpose + reference', 'Transações'],
                      ['Link de pagamento', 'POST /v1/payment-links', 'payment_link.paid', 'Idempotency-Key', 'Transações'],
                      ['QR', 'incluído na sessão (DYNAMIC_QR ou STATIC_QR)', 'o da sessão', '—', 'Transações'],
                      ['Reembolso', 'createRefund', 'refund.completed · status SUCCEEDED', 'idempotency_key obrigatória', 'Transações'],
                      ['Transferência', 'createTransfer', 'resposta · status COMPLETED', 'idempotencyKey obrigatória', 'Transações · Saldos'],
                      ['Liquidação', 'createBusinessApplicationSettlement', 'application_settlement.completed', 'idempotencyKey obrigatória', 'Saldos'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : i === 1 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="unidades-menores">Montantes em unidades menores</H2>
              <P>
                Todos os montantes são inteiros em unidades menores: <Code>amount_minor: 25000</Code> representa 250 Kz, porque 100 unidades menores equivalem a 1 Kz.
                Os inteiros evitam os erros de arredondamento dos números decimais. Para apresentar um montante, divida por 100 ou use <Code>formatMinor</Code> do SDK.
              </P>

              <H2 id="idempotencia">Idempotência</H2>
              <P>
                Um pedido que move dinheiro pode perder a resposta por um timeout. Enviado com a mesma chave de idempotência, a repetição devolve o resultado
                original em vez de criar um segundo efeito. <a href="/docs/reference#idempotencia" style={a}>Regras de idempotência</a>
              </P>

              <H2 id="request-id">request_id</H2>
              <P>
                Cada resposta inclui um <Code>request_id</Code>. Registe-o sempre que uma resposta não for a esperada: permite encontrar o pedido em
                <strong> Consola → Registos</strong> (retidos durante 30 dias) e é a primeira informação pedida pelo suporte.
              </P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/get-started', title: 'Quickstart', desc: 'Criar e confirmar o primeiro pagamento.' },
                { href: '/docs/payments', title: 'Aceitar pagamentos', desc: 'Sessões, links e QR.' },
                { href: '/docs/doa', title: 'Construir como o DOA', desc: 'O modelo aplicado a uma integração completa.' },
              ]} />
            </Section>
    </>
  );
}


const SAMPLE_CURL_REALTIME = `curl -N https://sandbox-api.banzami.com/v1/realtime/payment-sessions/payment_session_exemplo \\
  -H "Authorization: Bearer bzst_XXXXXXXXXXXXXXXX" \\
  -H "Accept: text/event-stream"

retry: 3000

event: snapshot
data: {"session_id":"payment_session_exemplo","status":"ACTIVE","terminal":false,…}

: heartbeat

event: status
data: {"session_id":"payment_session_exemplo","status":"PAID","terminal":true,…}`;

export function PtPayments({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="pagamentos">
              <h1 style={H1_STYLE}>Aceitar pagamentos</h1>
              <PageLede>Cobre com uma sessão de pagamento, um link reutilizável ou um QR. O pagador paga numa página do Banzami e a sua aplicação recebe a confirmação no servidor.</PageLede>

              <H2 id="escolher">Escolher o recurso</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Sessão de pagamento</th><th style={TH}>Link de pagamento</th></tr></thead>
                  <tbody>
                    {[
                      ['Para', 'Uma encomenda, uma doação, um pedido concreto', 'Um endereço partilhável, criado uma vez'],
                      ['Referência sua', 'purpose + reference_id, devolvidos nos eventos', 'Não tem; associe pelo id ou pelo slug'],
                      ['Link e QR', 'Link e QR: DYNAMIC_QR com montante fixo, STATIC_QR com montante aberto', 'Link; o QR é gerado a partir do URL'],
                      ['Conta de destino', 'A conta por omissão ou uma conta sua (wallet_account_id)', 'A conta por omissão do projeto'],
                      ['Confirmação', 'payment_session.paid e status PAID', 'payment_link.paid'],
                      ['SDK', 'createPaymentSession', 'createPaymentLink'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>Na maioria das integrações, a sessão de pagamento é a escolha certa: associa o pagamento à sua referência e já inclui o link e o QR.</P>

              <H2 id="percurso">O percurso de um pagamento</H2>
              <ResponsibilityDiagram
                title="O percurso de um pagamento"
                desc="A aplicação cria a sessão e apresenta o link ou o QR. O pagador paga na página do Banzami. O Banzami regista o pagamento e envia o webhook. A aplicação verifica o webhook e atualiza o seu estado."
                appLabel="A sua aplicação" banzamiLabel="Banzami"
                steps={[
                  { side: 'app', text: 'Cria a sessão' },
                  { side: 'banzami', text: 'Devolve link e QR' },
                  { side: 'app', text: 'Mostra link ou QR' },
                  { side: 'banzami', text: 'O pagador paga' },
                  { side: 'banzami', text: 'Regista e envia o webhook' },
                  { side: 'app', text: 'Verifica e confirma' },
                ]} />

              <H2 id="criar-sessao">Criar uma sessão de pagamento</H2>
              <Callout><strong>Unidades menores:</strong> <Code>amountMinor: 25000</Code> são 250 Kz (100 = 1 Kz).</Callout>
              <CodeBlock label="ts · criar sessão de pagamento (@banzami/sdk)" raw={SAMPLE_SESSION} onCopy={copy} />
              <UL>
                <LI><strong>Destinatário:</strong> vem da configuração financeira. <Code>merchant_id</Code>, <Code>wallet_id</Code> ou <Code>payee</Code> no pedido respondem <Code>400 PAYEE_NOT_ALLOWED</Code>.</LI>
                <LI><strong>Conta de destino:</strong> por omissão, a conta principal do projeto. Para separar valores, indique <Code>walletAccountId</Code> de uma conta sua. <a href="/docs/transfers" style={a}>Contas segregadas</a></LI>
                <LI><strong>Referência:</strong> existe uma sessão por <Code>purpose</Code> + <Code>reference_id</Code>. Repetir a mesma referência devolve a sessão existente (<Code>200</Code>), mesmo com outro montante.</LI>
                <LI><strong>Montante aberto:</strong> sem <Code>amountMinor</Code>, o pagador indica o valor, e a interface QR é <Code>STATIC_QR</Code> em vez de <Code>DYNAMIC_QR</Code>.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}><strong>Resultado esperado:</strong> <Code>201</Code>, <Code>status: &quot;ACTIVE&quot;</Code> e <Code>interfaces</Code> com <Code>PAYMENT_LINK</Code> (e <Code>DYNAMIC_QR</Code>, com montante fixo).</P>

              <H2 id="apresentar">Apresentar o link ou o QR</H2>
              <UL>
                <LI><strong>Link:</strong> <Code>paymentSessionInterface(session, &apos;PAYMENT_LINK&apos;).value</Code> — um URL <Code>https://pay.banzami.com/pay/…</Code>.</LI>
                <LI><strong>QR:</strong> <Code>paymentSessionInterface(session, &apos;DYNAMIC_QR&apos;).value</Code> (ou <Code>STATIC_QR</Code>, com montante aberto) contém o mesmo URL. Para a imagem, use <Code>GET /v1/payment-sessions/{'{'}id{'}'}/qr?format=svg</Code>.</LI>
                <LI>Qualquer câmara de telemóvel abre a página a partir do QR. A página indica «SANDBOX — ambiente de testes».</LI>
              </UL>

              <H2 id="confirmar">Confirmar o pagamento</H2>
              <P>
                Confirme sempre no servidor: pelo webhook <Code>payment_session.paid</Code> ou consultando a sessão até <Code>status</Code> ser <Code>PAID</Code>.
                O regresso do pagador à sua página não é uma confirmação.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Estado</th><th style={TH}>Significado</th><th style={TH}>O que fazer</th></tr></thead>
                  <tbody>
                    {[
                      ['ACTIVE', 'A sessão aguarda pagamento.', 'Mostrar o link ou o QR. Não é um erro.'],
                      ['PAID', 'O pagamento foi recebido na sua conta.', 'Confirmar a encomenda, uma única vez.'],
                      ['CANCELLED', 'A sessão foi cancelada e já não pode ser paga.', 'Criar uma sessão nova, se ainda quiser cobrar.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="tempo-real">Estado em tempo real</H2>
              <P>
                Uma página que mostra um QR ou um link pode mudar para «pago» no instante em que o pagamento acontece — mesmo que o pagador tenha pago noutro dispositivo.
                Cada sessão lida com a sua chave traz <Code>realtime.token</Code>: um token de estado (<Code>bzst_…</Code>) que abre, só em leitura e durante até 30 minutos, o estado público dessa sessão.
                Passe o token à sua página; a página abre <Code>GET /v1/realtime/payment-sessions/{'{id}'}</Code> com o token no cabeçalho <Code>Authorization</Code>.
              </P>
              <RealtimeChannelsDiagram l={{
                title: 'Três formas de saber o estado de um pagamento',
                desc: 'A mesma sessão de pagamento chega por três canais. O webhook assinado e a leitura com a chave, no seu servidor, são o que confirma a encomenda. O estado em tempo real, no browser, com um token de estado, só atualiza o ecrã.',
                source: 'Sessão de pagamento',
                channels: [
                  { name: 'Webhook', who: 'O Banzami chama o seu servidor', credential: 'banza-signature', use: 'Confirmar e entregar', authority: true },
                  { name: 'GET com a chave', who: 'O seu servidor pergunta', credential: 'bz_test_sk_…', use: 'Confirmar e reconciliar', authority: true },
                  { name: 'Tempo real', who: 'A página do pagador', credential: 'bzst_… · 30 min', use: 'Atualizar o ecrã', authority: false },
                ],
                authority: 'Autoridade para entregar a encomenda',
                screenOnly: 'Só para o ecrã',
              }} />
              <UL>
                <LI><strong>O stream:</strong> com <Code>Accept: text/event-stream</Code>, um evento <Code>snapshot</Code> com o estado atual, um <Code>status</Code> em cada mudança, um heartbeat a cada 5 segundos e um <Code>expired</Code> quando o token expira. Fecha num estado final: <Code>PAID</Code>, <Code>EXPIRED</Code>, <Code>CANCELLED</Code> ou <Code>FAILED</Code>. Com <Code>Accept: application/json</Code>, uma leitura única.</LI>
                <LI><strong>O token vai no cabeçalho, nunca no endereço:</strong> um token no URL é recusado com <Code>400 REALTIME_TOKEN_IN_URL</Code>. Por isso a página usa <Code>fetch</Code> com leitura em streaming, e não <Code>EventSource</Code>, que não envia cabeçalhos.</LI>
                <LI><strong>Religar:</strong> se a ligação cair, abra-a de novo — começa com um snapshot novo. Com o token expirado (<Code>401 REALTIME_TOKEN_EXPIRED</Code>), leia a sessão no seu servidor para um token novo.</LI>
                <LI><strong>Sem stream:</strong> se a ligação não se mantiver (<Code>503 REALTIME_UNAVAILABLE</Code>, rede restrita), a página pergunta ao seu servidor a um intervalo moderado, por exemplo cinco segundos.</LI>
                <LI><strong>Limites:</strong> 3 ligações por sessão e 20 por IP (<Code>429 REALTIME_STREAM_LIMIT</Code>). Uma página precisa de uma.</LI>
              </UL>
              <CodeBlock label="TypeScript · estado em tempo real na página" raw={SAMPLE_REALTIME} onCopy={copy} />
              <CodeBlock label="curl · estado em tempo real (stream)" raw={SAMPLE_CURL_REALTIME} onCopy={copy} />
              <Callout tone="warn">O estado em tempo real não é prova de pagamento. Entregue a encomenda com o webhook <Code>payment_session.paid</Code> verificado, ou com <Code>getPaymentSession</Code> no seu servidor. O token não é uma chave: nunca coloque uma chave secreta na página.</Callout>

              <H2 id="links">Criar um link de pagamento</H2>
              <P>
                Um link de pagamento é um endereço reutilizável que pode partilhar sem criar uma sessão por cliente. Com uma chave de projeto, o pedido não indica o destinatário.
              </P>
              <CodeBlock label="TypeScript · criar link de pagamento" raw={SAMPLE_LINK} onCopy={copy} />
              <CodeBlock label="curl · criar link de pagamento" raw={SAMPLE_LINK_CURL} onCopy={copy} />
              <UL>
                <LI><strong>Confirmar:</strong> o evento <Code>payment_link.paid</Code>, ou <Code>GET /v1/payment-links/{'{'}id{'}'}</Code> com o id devolvido na criação (o slug responde <Code>404</Code>).</LI>
                <LI><strong>Fechar um link por pagar:</strong> <Code>DELETE /v1/payment-links/{'{'}id{'}'}</Code> devolve-o com <Code>status: &quot;CANCELLED&quot;</Code>.</LI>
                <LI><strong>Listar:</strong> <Code>GET /v1/payment-links?limit=20</Code>, com <Code>next_cursor</Code> para a página seguinte.</LI>
              </UL>

              <H2 id="erros-pagamentos">Erros frequentes</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Resposta</th><th style={TH}>Causa</th><th style={TH}>Resolução</th></tr></thead>
                  <tbody>
                    {[
                      ['403 PAYMENTS_UNAVAILABLE', 'O projeto não tem a configuração financeira concluída.', 'Concluir a configuração financeira.'],
                      ['403 INSUFFICIENT_SCOPE', 'A chave não tem payment_sessions:write.', 'Criar uma chave com esse scope.'],
                      ['400 PAYEE_NOT_ALLOWED', 'O pedido indica um destinatário.', 'Remover merchant_id, wallet_id e payee.'],
                      ['400 BAD_REQUEST', 'Montante zero, negativo ou moeda diferente da conta.', 'Enviar um inteiro positivo em unidades menores.'],
                      ['404 NOT_FOUND', 'wallet_account_id de uma conta que não é sua.', 'Usar uma conta do projeto.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="consola-pagamentos">Na Consola</H2>
              <P>Os pagamentos aparecem em <strong>Transações</strong>, com montante e estado. Cada pedido da chave aparece em <strong>Registos</strong>, com o <Code>request_id</Code>.</P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/webhooks', title: 'Configurar webhooks', desc: 'Receber payment_session.paid de forma segura.' },
                { href: '/docs/refunds', title: 'Reembolsar um pagamento', desc: 'Total ou parcial, com idempotência.' },
                { href: '/docs/reference#resource-sessions', title: 'Referência: sessões', desc: 'Parâmetros, respostas e erros.' },
              ]} />
            </Section>
    </>
  );
}


export function PtWebhooks({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="webhooks">
              <h1 style={H1_STYLE}>Webhooks</h1>
              <PageLede>O Banzami envia eventos assinados para um endpoint HTTPS seu quando um pagamento, reembolso ou liquidação muda de estado.</PageLede>

              <H2 id="ciclo">O ciclo de uma entrega</H2>
              <PathDiagram title="O ciclo de uma entrega de webhook" desc="O Banzami regista o evento e envia-o ao endpoint. O endpoint verifica a assinatura, deduplica pelo id, aplica o efeito e responde 2xx. Sem 2xx, o Banzami tenta novamente até cinco vezes." steps={['Evento', 'Entrega assinada', 'Verificar', 'Deduplicar', 'Aplicar', 'Responder 2xx']} highlight={2} />

              <H2 id="receita">Configurar um endpoint, passo a passo</H2>
              <StepCard lang="pt" n={1} of={10} id="webhook-passo-1" title="Expor um endpoint HTTPS público"
                what="Uma rota POST no seu servidor, acessível pela internet."
                why="O Banzami entrega a partir da internet pública. HTTP, localhost e endereços privados são recusados no registo."
                success="Um POST de teste ao URL chega ao seu servidor."
                next="Registar o endpoint.">
                Por exemplo <Code>https://www.exemplo.com/api/webhooks/banzami</Code>.
              </StepCard>
              <StepCard lang="pt" n={2} of={10} id="webhook-passo-2" title="Registar o endpoint e guardar o segredo"
                what={<><Code>createWebhookEndpoint</Code> (<Code>POST /v1/webhooks/endpoints</Code>) com o URL e os eventos que quer receber.</>}
                why="O segredo devolvido é a única forma de verificar que uma entrega vem do Banzami."
                success={<>A resposta inclui <Code>secret</Code>. Guarde-o como <Code>BANZAMI_WEBHOOK_SECRET</Code> — não volta a ser devolvido.</>}
                next="Ler o corpo em bruto.">
                <CodeBlock label="ts · registar e rodar o segredo" raw={SAMPLE_WEBHOOK_MANAGE} onCopy={copy} />
              </StepCard>
              <StepCard lang="pt" n={3} of={10} id="webhook-passo-3" title="Ler o corpo em bruto"
                what={<><Code>await req.text()</Code>, antes de qualquer interpretação.</>}
                why="A assinatura é calculada sobre os bytes recebidos. Interpretar e voltar a serializar o JSON altera esses bytes."
                success="Tem o corpo como texto, sem o ter convertido em objeto."
                next="Verificar a assinatura.">
                Em frameworks que interpretam o corpo automaticamente, desative esse comportamento nesta rota.
              </StepCard>
              <StepCard lang="pt" n={4} of={10} id="webhook-passo-4" title="Verificar a assinatura antes de interpretar"
                what={<><Code>banzami.webhooks.constructEvent(raw, assinatura)</Code>, com o header <Code>banza-signature</Code>.</>}
                why="Qualquer pessoa pode enviar um POST para o seu endpoint. Até a assinatura ser válida, o conteúdo não é de confiança."
                success={<><Code>constructEvent</Code> devolve o evento. Se a assinatura for inválida, lança uma exceção.</>}
                next="Responder a assinaturas inválidas.">
                <CodeBlock label="ts · verificar e tratar um evento" raw={SAMPLE_WEBHOOK} onCopy={copy} />
              </StepCard>
              <Callout tone="warn"><strong>Erro comum:</strong> ler o corpo com <Code>req.json()</Code> e verificar depois. A verificação falha e o código usou dados não autenticados.</Callout>
              <CodeBlock label="ts · errado e certo" raw={SAMPLE_WEBHOOK_WRONG} onCopy={copy} />
              <StepCard lang="pt" n={5} of={10} id="webhook-passo-5" title="Recusar assinaturas inválidas"
                what={<>Responder <Code>400</Code> sem efeitos quando <Code>constructEvent</Code> lança.</>}
                why="Uma entrega legítima que falhou é repetida pelo Banzami; um pedido forjado não produz efeitos."
                success="O pedido é recusado e nada é gravado."
                next="Deduplicar.">
                O formato do header é <Code>t=&lt;unix&gt;,v1=&lt;hmac_sha256_hex&gt;</Code>. A tolerância temporal é de 5 minutos.
              </StepCard>
              <StepCard lang="pt" n={6} of={10} id="webhook-passo-6" title="Deduplicar pelo id do evento"
                what={<>Registar o <Code>id</Code> do envelope e ignorar um id já processado.</>}
                why="A entrega é at-least-once: o mesmo evento pode chegar mais de uma vez."
                success="Uma segunda entrega do mesmo evento não produz um segundo efeito."
                next="Aplicar o efeito.">
                Guarde o id na mesma transação em que aplica o efeito.
              </StepCard>
              <StepCard lang="pt" n={7} of={10} id="webhook-passo-7" title="Aplicar o efeito de negócio"
                what={<>Atualizar o seu estado a partir de <Code>type</Code> e <Code>data</Code>.</>}
                why="O evento transporta a sua referência — por exemplo reference_id — para associar o evento ao seu recurso."
                success="A encomenda, doação ou liquidação fica atualizada uma única vez."
                next="Responder rapidamente.">
                Os campos de cada evento estão em <a href="/docs/events" style={a}>Eventos</a>. Não dependa da ordem de chegada.
              </StepCard>
              <StepCard lang="pt" n={8} of={10} id="webhook-passo-8" title="Responder 2xx rapidamente"
                what={<>Responder <Code>2xx</Code> e mover trabalho demorado para uma fila.</>}
                why="Uma resposta lenta ou fora de 2xx conta como falha e origina nova tentativa."
                success={<>Em <strong>Consola → Webhooks</strong>, a entrega aparece com <Code>2xx</Code>.</>}
                next="Tratar falhas e repetições.">
                Qualquer código <Code>2xx</Code> conta como entregue.
              </StepCard>
              <StepCard lang="pt" n={9} of={10} id="webhook-passo-9" title="Recuperar entregas falhadas"
                what="Consultar as entregas e reenviar as que falharam."
                why="Uma entrega que falhou cinco vezes não volta a ser tentada automaticamente."
                success={<>A entrega reenviada fica <Code>SUCCESS</Code>.</>}
                next="Rodar o segredo quando necessário.">
                <Code>listWebhookEvents</Code>, <Code>listWebhookDeliveries(eventId)</Code> e <Code>replayWebhookDelivery(deliveryId)</Code>. Uma entrega que já teve sucesso responde <Code>409 DELIVERY_ALREADY_SUCCEEDED</Code>.
              </StepCard>
              <StepCard lang="pt" n={10} of={10} id="webhook-passo-10" title="Rodar o segredo sem perder entregas"
                what={<><Code>rotateWebhookEndpointSecret(id)</Code> devolve um segredo novo, uma única vez.</>}
                why="A troca é imediata: a entrega seguinte já é assinada com o segredo novo."
                success="O servidor aceita entregas assinadas com o segredo novo."
                next="Monitorizar em Consola → Webhooks.">
                Prepare o servidor para o segredo novo antes de rodar. Uma entrega recusada durante a troca é repetida pelo Banzami.
              </StepCard>

              <H2 id="reentrega">Tentativas e reentrega</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Tentativa</th><th style={TH}>Quando</th></tr></thead>
                  <tbody>
                    {[
                      ['1', 'Imediatamente após o evento'],
                      ['2', '1 minuto após a falha anterior'],
                      ['3', '5 minutos após a falha anterior'],
                      ['4', '30 minutos após a falha anterior'],
                      ['5', '2 horas após a falha anterior'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_MONO}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>Depois da quinta falha, a entrega fica <Code>FAILED</Code> e pode ser reenviada. A ordem de entrega não é garantida.</P>

              <H2 id="evento-teste">Testar o endpoint sem um pagamento</H2>
              <P>
                No Sandbox, <strong>Enviar evento de teste</strong> (Consola → Webhooks), <Code>sendWebhookTestEvent</Code> ou <Code>POST /v1/webhooks/endpoints/{'{id}'}/test</Code> entrega ao endpoint um evento <Code>webhook.test</Code>, assinado com <Code>banza-signature</Code> como qualquer outro.
                Serve para confirmar que o servidor lê o corpo em bruto, verifica a assinatura e responde <Code>2xx</Code>. O evento vem marcado <Code>synthetic: true</Code>, não descreve nenhum pagamento, não se subscreve e não move nada; a entrega pode ser reenviada mesmo depois de ter sucesso.
                Trate um <Code>type</Code> que não conhece respondendo <Code>2xx</Code> sem efeitos. Um endpoint desativado responde <Code>409 ENDPOINT_DISABLED</Code>; mais de 10 entregas de teste por minuto ao mesmo endpoint, envios e reenvios juntos, respondem <Code>429 WEBHOOK_TEST_RATE_LIMITED</Code> com <Code>Retry-After</Code>.
              </P>
              <CodeBlock label="TypeScript · evento de teste" raw={SAMPLE_WEBHOOK_TEST} onCopy={copy} />

              <H2 id="desativar">Desativar e reativar um endpoint</H2>
              <P>
                Um endpoint desativado deixa de receber eventos. <strong>Os eventos emitidos enquanto está desativado nunca lhe são entregues</strong>, mesmo depois de o reativar;
                continuam visíveis em <strong>Eventos</strong>. A reativação aplica-se aos eventos seguintes.
              </P>

              <H2 id="envelope">Formato do envelope</H2>
              <CodeBlock label="json · envelope do evento" raw={SAMPLE_WEBHOOK_ENVELOPE} onCopy={copy} />
              <P style={{ fontSize: 13, color: MUT }}><Code>id</Code> (deduplicação), <Code>type</Code> (um dos eventos), <Code>created_at</Code> (UTC) e <Code>data</Code>. <a href="/docs/events" style={a}>Campos de cada evento</a></P>

              <H2 id="gerir-endpoint">Scopes e acesso</H2>
              <UL>
                <LI><Code>webhooks:read</Code> consulta endpoints, eventos e entregas. <Code>webhooks:write</Code> regista, desativa, reenvia e roda o segredo.</LI>
                <LI>Um endpoint, evento ou entrega de outro projeto responde <Code>404</Code>.</LI>
                <LI>O titular vem da configuração financeira: nenhum pedido aceita <Code>merchant_id</Code>.</LI>
              </UL>

              <NextStepCards lang="pt" items={[
                { href: '/docs/events', title: 'Referência de eventos', desc: 'Quando cada evento é emitido e o que fazer.' },
                { href: '/docs/testing#testar-webhook', title: 'Testar webhooks', desc: 'Provocar uma entrega, uma falha e uma reentrega.' },
                { href: '/docs/troubleshooting#symptom-webhook-missing', title: 'O webhook não chega', desc: 'Diagnóstico passo a passo.' },
              ]} />
            </Section>
    </>
  );
}

export function PtEvents({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="eventos-page">
              <h1 style={H1_STYLE}>Eventos</h1>
              <PageLede>Os sete eventos que o Banzami emite: quando acontecem, que campos trazem e o que a sua aplicação deve fazer.</PageLede>
              <UL>
                <LI>Todos chegam no mesmo <a href="/docs/webhooks#envelope" style={a}>envelope</a>, assinados, com entrega at-least-once e sem ordem garantida.</LI>
                <LI>Os campos listados são o contrato. Um payload pode incluir outros campos de auditoria interna; não dependa deles.</LI>
                <LI>Montantes em unidades menores (100 = 1 Kz); datas em UTC.</LI>
              </UL>
              <H2 id="catalogo-eventos">Catálogo</H2>
              <EventReference lang="pt" onCopy={copy} />
              <NextStepCards lang="pt" items={[
                { href: '/docs/webhooks', title: 'Configurar webhooks', desc: 'Verificar, deduplicar e responder.' },
                { href: '/docs/testing', title: 'Testar no Sandbox', desc: 'Que eventos consegue provocar e como.' },
              ]} />
            </Section>
    </>
  );
}


export function PtRefunds({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="reembolsos">
              <h1 style={H1_STYLE}>Reembolsos</h1>
              <PageLede>Devolva ao pagador a totalidade ou parte de um pagamento confirmado. O valor é debitado da conta que recebeu o pagamento.</PageLede>

              <H2 id="fluxo-reembolso">Como funciona</H2>
              <PathDiagram title="O percurso de um reembolso" desc="Um pagamento confirmado traz refund_source. A aplicação cria o reembolso com esse refund_source e uma idempotency_key. O Banzami debita a conta que recebeu e devolve o valor ao pagador, emitindo refund.completed." steps={['Pagamento PAID', 'refund_source', 'createRefund', 'Débito na conta', 'refund.completed']} highlight={2} />

              <H2 id="criar-reembolso">Reembolsar um pagamento</H2>
              <Callout><strong>Unidades menores:</strong> <Code>amount_minor: 5000</Code> são 50 Kz (100 = 1 Kz).</Callout>
              <StepCard lang="pt" n={1} of={3} id="reembolso-passo-1" title="Obter a origem do pagamento"
                what={<>O <Code>refund_source</Code> do pagamento: <Code>{'{'} source_type, source_id {'}'}</Code>.</>}
                why="O reembolso refere-se ao pagamento em si, não à sessão ou ao link que o originou."
                success={<>Tem <Code>source_type</Code> (<Code>WALLET_PAYMENT</Code>) e <Code>source_id</Code>.</>}
                next="Criar a chave de idempotência.">
                Vem no evento <Code>payment_session.paid</Code> ou <Code>payment_link.paid</Code>, e na sessão depois de paga.
              </StepCard>
              <StepCard lang="pt" n={2} of={3} id="reembolso-passo-2" title="Guardar uma chave de idempotência"
                what={<>Uma <Code>idempotency_key</Code> por intenção de reembolso, guardada antes do pedido.</>}
                why="Se a resposta se perder, repetir com a mesma chave devolve o reembolso original em vez de devolver o valor duas vezes."
                success="A chave está registada no seu sistema, associada ao reembolso."
                next="Criar o reembolso.">
                O SDK não gera esta chave: um valor aleatório gerado a cada tentativa anularia a proteção.
              </StepCard>
              <StepCard lang="pt" n={3} of={3} id="reembolso-passo-3" title="Criar o reembolso"
                what={<><Code>createRefund</Code>, com a origem, o montante, a moeda e a chave.</>}
                why="O reembolso é executado de imediato e emite refund.completed."
                success={<><Code>201</Code> com <Code>status: &quot;SUCCEEDED&quot;</Code>, e o evento <Code>refund.completed</Code> com <Code>trace_id</Code> igual à sua chave.</>}
                next="Mostrar o reembolso ao seu cliente.">
                <CodeBlock label="ts · reembolsar um pagamento (@banzami/sdk)" raw={SAMPLE_REFUND} onCopy={copy} />
              </StepCard>

              <H2 id="regras-reembolso">Regras</H2>
              <UL>
                <LI><strong>Origens:</strong> <Code>WALLET_PAYMENT</Code>, para pagamentos de sessões e links, e <Code>ACQUIRING_PAYMENT</Code>, para pagamentos por trilho externo.</LI>
                <LI><strong>Parciais:</strong> pode fazer vários reembolsos sobre o mesmo pagamento, até ao total recebido.</LI>
                <LI><strong>Moeda:</strong> tem de ser a do pagamento.</LI>
                <LI><strong>Saldo:</strong> o valor sai da conta que recebeu o pagamento. Se essa conta já não tiver saldo, o pedido responde <Code>422 REFUND_NOT_FUNDABLE</Code>.</LI>
                <LI><strong>Comprovativo:</strong> quando o pagamento é totalmente reembolsado, o comprovativo passa a <Code>REVERSED</Code>. <a href="/docs/receipts" style={a}>Comprovativos</a></LI>
                <LI><strong>Acesso:</strong> scope <Code>refunds:write</Code>, em <Code>POST /v1/refunds</Code>. Um pagamento de outro projeto responde <Code>404</Code>.</LI>
              </UL>

              <H2 id="erros-reembolso">Erros frequentes</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Resposta</th><th style={TH}>Causa</th><th style={TH}>Repetir</th></tr></thead>
                  <tbody>
                    {[
                      ['422 REFUND_EXCEEDS_CAPTURED', 'O montante excede o que falta reembolsar.', 'Com outro montante e uma chave nova.'],
                      ['422 REFUND_NOT_FUNDABLE', 'A conta que recebeu não tem saldo suficiente.', 'Quando houver saldo, com uma chave nova.'],
                      ['422 INVALID_PAYMENT_STATUS', 'O pagamento não pode ser reembolsado.', 'Não.'],
                      ['422 CURRENCY_MISMATCH', 'A moeda não é a do pagamento.', 'Com a moeda correta e uma chave nova.'],
                      ['409 IDEMPOTENCY_KEY_CONFLICT', 'A mesma chave foi usada com outro montante ou moeda neste pagamento.', 'Com o pedido original, ou com uma chave nova para outro reembolso.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="consola-reembolsos">Na Consola</H2>
              <P>Em <strong>Transações</strong>, o filtro <strong>Reembolsos</strong> mostra cada reembolso. Por API, <Code>listRefunds({'{'} sourceId {'}'})</Code> lista os de um pagamento.</P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/testing#testar-reembolso', title: 'Testar um reembolso', desc: 'Total, parcial e acima do permitido.' },
                { href: '/docs/events#event-refund-completed', title: 'refund.completed', desc: 'Os campos do evento.' },
                { href: '/docs/reference#resource-refunds', title: 'Referência: reembolsos', desc: 'Parâmetros, respostas e erros.' },
              ]} />
            </Section>
    </>
  );
}

export function PtSettlements({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="liquidacoes">
              <h1 style={H1_STYLE}>Liquidações</h1>
              <PageLede>Transfira o saldo de uma conta segregada para um beneficiário. O Banzami calcula a taxa, credita o valor líquido e emite o resultado.</PageLede>

              <H2 id="pagamento-vs-liquidacao">Pagamento e liquidação</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Pagamento</th><th style={TH}>Liquidação</th></tr></thead>
                  <tbody>
                    {[
                      ['Movimento', 'Do pagador para a sua conta', 'Da sua conta para o beneficiário'],
                      ['Quem inicia', 'O pagador', 'A sua aplicação, com um pedido explícito'],
                      ['Taxa', 'Nenhuma', 'A do perfil de preço atribuído pelo Banzami'],
                      ['Automática', 'Sim, quando o pagador paga', 'Não. Só acontece quando a pede'],
                      ['Evento', 'payment_session.paid', 'application_settlement.completed'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="calculo">Como o valor é dividido</H2>
              <Callout><strong>Unidades menores:</strong> <Code>100000</Code> são 1 000 Kz (100 = 1 Kz).</Callout>
              <SettlementSplitDiagram l={{
                title: 'Liquidação de 1 000 Kz com uma taxa de 200 bps',
                desc: 'A conta da campanha tem 100000 unidades menores. Com 200 pontos base, a taxa é 2000 e vai para o seu destino de taxa; 98000 vão para o beneficiário. A soma dos três movimentos é zero.',
                source: 'Conta da campanha', gross: '100000',
                beneficiary: 'Beneficiário (líquido)', net: '98000',
                fee: 'Destino da taxa', feeAmount: '2000',
                sum: '−100000 + 2000 + 98000 = 0',
              }} />
              <UL>
                <LI><strong>Bruto:</strong> todo o saldo disponível da conta no momento do pedido. O pedido não indica montante.</LI>
                <LI><strong>Taxa:</strong> 200 pontos base (bps) = 2%. Vem do perfil de preço atribuído pelo Banzami ao seu Business; um campo de preço no pedido responde <Code>400 PRICING_FIELD_NOT_ACCEPTED</Code>.</LI>
                <LI><strong>Líquido:</strong> bruto menos taxa, creditado ao beneficiário.</LI>
              </UL>

              <H2 id="pedir-liquidacao">Pedir uma liquidação</H2>
              <StepCard lang="pt" n={1} of={3} id="liquidacao-passo-1" title="Confirmar que o projeto pode liquidar"
                what={<><Code>getFinancialSetup()</Code> → <Code>settlement.ready</Code> e <Code>settlement.blockers</Code>.</>}
                why="Cada bloqueio corresponde à recusa que a liquidação devolveria."
                success={<><Code>settlement.ready</Code> é <Code>true</Code>.</>}
                next="Escolher a conta e o beneficiário.">
                Bloqueios comuns: sem perfil de preço (<Code>PRICING_NOT_CONFIGURED</Code>) ou destino de taxa não elegível (<Code>FEE_DESTINATION_TYPE_NOT_ALLOWED</Code>).
              </StepCard>
              <StepCard lang="pt" n={2} of={3} id="liquidacao-passo-2" title="Guardar a chave de idempotência"
                what={<>Uma <Code>idempotencyKey</Code> por liquidação, guardada antes do pedido.</>}
                why="Se a resposta se perder, a mesma chave devolve a liquidação já feita, ou retoma uma que não concluiu."
                success="A chave está registada com a campanha ou o pedido."
                next="Criar a liquidação.">
                Por exemplo <Code>idem_liquidacao_campanha_123</Code>.
              </StepCard>
              <StepCard lang="pt" n={3} of={3} id="liquidacao-passo-3" title="Criar a liquidação"
                what={<><Code>createBusinessApplicationSettlement</Code> com a conta, o beneficiário e, se houver taxa, o destino da taxa.</>}
                why="O Banzami calcula bruto, taxa e líquido e move os três valores numa só operação."
                success={<><Code>201</Code> com <Code>status: &quot;COMPLETED&quot;</Code>, <Code>gross_amount_minor</Code>, <Code>application_fee_minor</Code> e <Code>net_amount_minor</Code>. Guarde a resposta.</>}
                next="Receber application_settlement.completed.">
                <CodeBlock label="ts · liquidar uma conta (@banzami/sdk)" raw={SAMPLE_SETTLE} onCopy={copy} />
              </StepCard>

              <H2 id="destino-taxa">Destino da taxa</H2>
              <P>
                Quando o perfil de preço resulta numa taxa, indique <Code>feeDestinationBanzaName</Code>: um @banza do seu próprio Business, do tipo
                <Code> APPLICATION</Code> ou <Code>PLATFORM</Code>, com verificação aprovada e carteira ativa. Sem ele, a liquidação responde <Code>422 FEE_DESTINATION_REQUIRED</Code>.
                A classificação da conta como APPLICATION é atribuída pelo Banzami. No Sandbox, é atribuída ao escolher o tipo de uso <strong>Aplicação ou plataforma</strong>, e o negócio de teste do próprio projeto serve de destino da taxa sem verificação — só no Sandbox.
              </P>

              <H2 id="erros-liquidacao">Erros e repetição</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Resposta</th><th style={TH}>Causa</th><th style={TH}>Chave de idempotência</th></tr></thead>
                  <tbody>
                    {[
                      ['409 PRICING_NOT_CONFIGURED', 'O Business ainda não tem perfil de preço.', 'Nova, depois de o Banzami atribuir o perfil'],
                      ['422 FEE_DESTINATION_REQUIRED', 'Há taxa e falta o destino.', 'Nova, com o destino indicado'],
                      ['422 NOTHING_TO_SETTLE', 'A conta não tem saldo disponível.', 'Nova, quando houver saldo'],
                      ['422 SOURCE_NOT_SEGREGATED', 'A origem é a conta principal do Business.', 'Nova, com uma conta segregada'],
                      ['422 BENEFICIARY_NOT_FOUND', 'O @banza não tem carteira ativa nesta moeda.', 'Nova, com outro beneficiário'],
                      ['422 SETTLEMENT_NOT_COMPLETED', 'A liquidação foi criada mas não concluída.', 'A mesma — retoma a liquidação'],
                      ['503', 'Falha temporária.', 'A mesma'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="consola-liquidacoes">Na Consola</H2>
              <UL>
                <LI><strong>Configuração financeira</strong> mostra a prontidão para liquidar, o perfil de preço e o destino da taxa.</LI>
                <LI><strong>Saldos</strong> mostra o saldo da conta, que passa a zero depois da liquidação.</LI>
                <LI>A Consola não lista liquidações, e uma chave de projeto não as consulta por id. Guarde a resposta do pedido e o evento <Code>application_settlement.completed</Code>.</LI>
              </UL>

              <NextStepCards lang="pt" items={[
                { href: '/docs/doa#doa-liquidacao', title: 'Liquidação no DOA', desc: 'Encerrar uma campanha e liquidá-la.' },
                { href: '/docs/events#event-application_settlement-completed', title: 'Eventos de liquidação', desc: 'completed, cancelled e failed.' },
                { href: '/docs/reference#ref-settlement-create', title: 'Referência: liquidação', desc: 'Parâmetros, respostas e erros.' },
              ]} />
            </Section>
    </>
  );
}

export function PtReceipts({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="comprovativos">
              <h1 style={H1_STYLE}>Comprovativos</h1>
              <PageLede>Cada pagamento confirmado tem um comprovativo com uma referência pública. Qualquer pessoa com a referência pode verificar o pagamento, sem conta nem chave.</PageLede>

              <H2 id="duas-referencias">Referência da transação e referência de prova</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Referência da transação</th><th style={TH}>Referência de prova (SECURE_V1)</th></tr></thead>
                  <tbody>
                    {[
                      ['Exemplo', '5AD6BEA0', 'BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'],
                      ['O que é', 'O início do id da transferência', 'O identificador do comprovativo'],
                      ['Onde aparece', 'Na lista de atividade da app Banzami', 'No comprovativo, com um QR'],
                      ['Verificável publicamente', 'Não', 'Sim, em banzami.com/r/{referência} e na API'],
                      ['Serve para', 'Reconhecer a transação na lista', 'Provar que o pagamento existe e em que estado está'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : i === 1 || (i === 2 && r[0] === 'Exemplo') ? TD_MONO : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="formato">Formato SECURE_V1</H2>
              <UL>
                <LI><Code>BZM-</Code> seguido de 24 símbolos em seis grupos de quatro.</LI>
                <LI>Alfabeto: dígitos e letras maiúsculas, sem I, L, O e U, para evitar confusão com dígitos.</LI>
                <LI>120 bits aleatórios: a referência não é adivinhável nem enumerável.</LI>
                <LI>As referências antigas de oito símbolos (<Code>BZM-XXXX-XXXX</Code>) continuam verificáveis.</LI>
              </UL>
              <Callout>Quem tem a referência vê o montante, os @banza das partes e a descrição. Partilhe-a com o mesmo cuidado com que partilharia o comprovativo.</Callout>

              <H2 id="verificar">Verificar um comprovativo</H2>
              <P>O QR do comprovativo abre <Code>banzami.com/r/&#123;referência&#125;</Code>, a página pública de verificação. A API pública faz a mesma verificação, sem autenticação.</P>
              <PathDiagram title="Verificação de um comprovativo" desc="O comprovativo tem uma referência e um QR. O QR abre banzami.com/r/{referência}. A mesma verificação existe na API pública, que responde 200, 404 ou 503." steps={['Comprovativo', 'Referência BZM-…', 'banzami.com/r/… ou API', 'Resultado']} highlight={2} />
              <CodeBlock label="curl · verificar um comprovativo" onCopy={copy} raw={`curl https://sandbox-api.banzami.com/v1/public/proofs/BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`} />
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>HTTP</th><th style={TH}>Resposta</th><th style={TH}>Significado</th></tr></thead>
                  <tbody>
                    {[
                      ['200', 'status, montante, partes e data', 'Verificado. status: CONFIRMED, PENDING, REVERSED, CANCELLED, FAILED ou EXPIRED.'],
                      ['404', 'exists: false, status NOT_FOUND', 'Não existe, ou a referência foi alterada. As duas situações têm a mesma resposta.'],
                      ['503', 'exists: false, status UNAVAILABLE', 'Verificação temporariamente indisponível. Tente mais tarde; não indica que o comprovativo é falso.'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_MONO}>{r[0]}</td><td style={TD}>{r[1]}</td><td style={TD}>{r[2]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Sem normalização:</strong> minúsculas, espaços ou um hífen a mais respondem <Code>404</Code>. Copie a referência, não a reescreva.</LI>
                <LI><strong>Reembolsos:</strong> um pagamento totalmente reembolsado mantém o comprovativo, com <Code>status: REVERSED</Code>.</LI>
                <LI><strong>Emissão:</strong> o PDF do comprovativo é emitido ao Business na app Banzami Business. Uma chave de projeto não descarrega comprovativos.</LI>
              </UL>

              <NextStepCards lang="pt" items={[
                { href: '/docs/doa#doa-comprovativo', title: 'Comprovativos no DOA', desc: 'Comprovativo do Banzami e recibo da aplicação.' },
                { href: '/docs/reference#ref-public-proof', title: 'Referência: verificação', desc: 'GET /v1/public/proofs/{ref}.' },
              ]} />
            </Section>
    </>
  );
}

export function PtTransfers({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="contas-transferencias">
              <h1 style={H1_STYLE}>Contas e transferências</h1>
              <PageLede>Separe valores por campanha, loja ou evento em contas segregadas, e mova valor entre contas do mesmo Business.</PageLede>

              <H2 id="contas-segregadas">Contas segregadas</H2>
              <SegregatedAccountsDiagram l={{
                title: 'Um Business, uma conta por campanha',
                desc: 'O projeto está ligado a um Business pela configuração financeira. Dentro da carteira desse Business, cada campanha tem uma conta própria.',
                project: 'O seu projeto',
                owner: 'Business',
                ownerNote: 'definido pela configuração financeira',
                accounts: ['Campanha A', 'Campanha B', 'Campanha C'],
                accountNote: 'uma conta por campanha',
              }} />
              <UL>
                <LI><strong>Criar:</strong> <Code>createWalletAccount</Code> com <Code>purpose</Code> e a sua referência. O pedido não indica carteira nem Business.</LI>
                <LI><strong>Receber:</strong> passe o <Code>walletAccountId</Code> dessa conta a <Code>createPaymentSession</Code>.</LI>
                <LI><strong>Liquidar:</strong> a conta é a origem de <a href="/docs/settlements" style={a}>uma liquidação</a>.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}>Uma conta de outro projeto responde <Code>404</Code>, tal como uma conta inexistente. Indicar a carteira responde <Code>400 PAYEE_NOT_ALLOWED</Code>.</P>

              <H2 id="transferencias">Transferir entre contas</H2>
              <Callout><strong>Unidades menores:</strong> <Code>amountMinor: 50000</Code> são 500 Kz (100 = 1 Kz).</Callout>
              <CodeBlock label="ts · transferir entre contas (@banzami/sdk)" raw={SAMPLE_TRANSFER} onCopy={copy} />
              <P style={{ fontSize: 13, color: MUT }}><strong>Resultado esperado:</strong> <Code>201</Code> com <Code>status: &quot;COMPLETED&quot;</Code>. O débito e o crédito são atómicos; o total do Business não muda.</P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Uma transferência é</th><th style={TH}>Uma transferência não é</th></tr></thead>
                  <tbody>
                    <tr><td style={TD}>Um movimento entre duas contas do mesmo Business</td><td style={TD}>Um pagamento a terceiros</td></tr>
                    <tr><td style={TD}>Síncrona e confirmada na resposta</td><td style={TD}>Uma liquidação com taxa</td></tr>
                    <tr><td style={TD}>Protegida pela idempotencyKey</td><td style={TD}>Um levantamento para uma conta bancária</td></tr>
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Idempotência:</strong> a mesma chave devolve a transferência original; a mesma chave com outro pedido responde <Code>409 IDEMPOTENCY_KEY_REUSED</Code>.</LI>
                <LI><strong>Saldo:</strong> sem saldo suficiente, responde <Code>422 INSUFFICIENT_FUNDS</Code> e nada se move.</LI>
                <LI><strong>Acesso:</strong> scope <Code>transfers:write</Code>, em <Code>POST /v1/wallet-account-transfers</Code>.</LI>
              </UL>

              <NextStepCards lang="pt" items={[
                { href: '/docs/settlements', title: 'Liquidar uma conta', desc: 'Do saldo da conta para o beneficiário.' },
                { href: '/docs/reference#resource-accounts', title: 'Referência: contas', desc: 'Parâmetros, respostas e erros.' },
              ]} />
            </Section>
    </>
  );
}


export function PtDoa({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="doa">
              <h1 style={H1_STYLE}>Implementação de referência — DOA</h1>
              <PageLede>
                O <a href="https://www.doadoa.app" style={a}>DOA</a> é uma aplicação angolana de angariação de fundos que usa o Sandbox do Banzami para os seus fluxos financeiros.
                Este guia mostra, com o DOA como exemplo, como uma aplicação externa integra o Banzami através dos contratos públicos.
              </PageLede>
              <Callout>
                <strong>O DOA é uma implementação de referência, não um cliente privilegiado do Banzami.</strong> Usa a mesma API pública, o mesmo SDK, o mesmo modelo de autorização,
                os mesmos webhooks e o mesmo modelo de liquidação disponíveis a qualquer developer.
              </Callout>

              <H2 id="doa-o-que-e">O que o DOA demonstra</H2>
              <UL>
                <LI>Uma conta segregada por campanha, para que o valor de cada campanha nunca se misture com o de outra.</LI>
                <LI>Pagamentos através de uma sessão, com a página de pagamento e o QR do Banzami.</LI>
                <LI>Confirmação por webhook verificado, aplicada uma única vez.</LI>
                <LI>Liquidação da campanha para o beneficiário, com a taxa calculada pelo Banzami.</LI>
                <LI>Reconciliação sem manter saldos próprios.</LI>
              </UL>

              <H2 id="doa-arquitetura">Arquitetura</H2>
              <PathDiagram title="Arquitetura da integração do DOA" desc="O doador usa a aplicação DOA. O servidor do DOA chama a API do Banzami através do @banzami/sdk. O doador paga em pay.banzami.com. O Banzami envia webhooks assinados para o servidor do DOA." steps={['Doador', 'Aplicação DOA', '@banzami/sdk', 'API Banzami', 'pay.banzami.com', 'Webhook ao DOA']} highlight={3} />

              <H2 id="doa-fronteira">Divisão de responsabilidades</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>O DOA é responsável por</th><th style={TH}>O Banzami é responsável por</th></tr></thead>
                  <tbody>
                    {[
                      ['Campanhas', 'Execução financeira'],
                      ['Experiência do doador', 'Saldos'],
                      ['Estado da campanha', 'Registo contabilístico (ledger)'],
                      ['Regras de negócio da aplicação', 'Preços e taxas'],
                      ['Reconciliação do lado da aplicação', 'Comprovativos e verificação pública'],
                      ['Pedido de liquidação', 'Liquidação'],
                    ].map((r, i) => (
                      <tr key={i}><td style={TD}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>O DOA nunca guarda um saldo. Quando precisa de saber quanto uma campanha recebeu, consulta o Banzami.</P>

              <H2 id="doa-fluxo">O percurso da integração</H2>
              <ResponsibilityDiagram
                title="Do doador à liquidação: o que faz o DOA e o que faz o Banzami"
                desc="O DOA cria a conta da campanha e a sessão de pagamento. O Banzami devolve o link e o QR, recebe o pagamento, emite o comprovativo e envia o webhook. O DOA confirma a doação e, no fecho, pede a liquidação. O Banzami calcula a taxa e liquida."
                appLabel="DOA" banzamiLabel="Banzami"
                steps={[
                  { side: 'app', text: 'Conta da campanha' },
                  { side: 'app', text: 'Sessão de pagamento' },
                  { side: 'banzami', text: 'Link, QR e pagamento' },
                  { side: 'banzami', text: 'Comprovativo e webhook' },
                  { side: 'app', text: 'Confirma a doação' },
                  { side: 'app', text: 'Pede a liquidação' },
                  { side: 'banzami', text: 'Taxa e liquidação' },
                ]} />

              <H2 id="doa-preparar">1. Preparar o projeto</H2>
              <ChapterFacts lang="pt" appLabel="DOA"
                goal="Um projeto com configuração financeira concluída e uma chave com os scopes necessários."
                app="Cria o workspace e o projeto na Consola, conclui a configuração financeira e guarda a chave e o segredo do webhook no servidor."
                banzami="Cria o negócio de teste do projeto para o tipo de uso Aplicação ou plataforma — ou aceita o código de consentimento do titular — e atribui a classificação e o perfil de preço."
                result={<><Code>getFinancialSetup()</Code> devolve <Code>financial_setup.state</Code> igual a <Code>READY</Code> ou <Code>SEALED</Code>.</>}
                failure={<><Code>403 PAYMENTS_UNAVAILABLE</Code> ao criar a sessão: a configuração financeira ainda não está concluída.</>} />
              <ol style={{ margin: '0 0 14px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Na <a href="/docs/console" style={a}>Consola</a>, crie um <strong>workspace</strong> e um <strong>projeto</strong> para a aplicação.</LI>
                <LI>
                  Conclua a <strong>configuração financeira</strong>: escolha o tipo de uso <strong>Aplicação ou plataforma</strong> — o Banzami cria o negócio de teste com a classificação APPLICATION e o preço de referência, sem esperar por ninguém — ou ligue um Business existente com o
                  código de consentimento gerado pelo titular. <a href="/docs/get-started#configuracao-financeira" style={a}>Configuração financeira</a>
                </LI>
                <LI>
                  Crie uma chave secreta com <Code>identity:read</Code>, <Code>wallet_accounts:create</Code>, <Code>wallet_accounts:read</Code>,{' '}
                  <Code>payment_sessions:write</Code>, <Code>payment_sessions:read</Code>, <Code>webhooks:write</Code>, <Code>webhooks:read</Code> e{' '}
                  <Code>application_settlements:write</Code>. A liquidação tem um scope próprio: poder receber não dá acesso a liquidar.
                </LI>
                <LI>Instale o SDK no servidor: <Code>npm install @banzami/sdk</Code>.</LI>
                <LI>
                  Configure <Code>BANZAMI_API_KEY</Code> e <Code>BANZAMI_WEBHOOK_SECRET</Code> (o segredo do endpoint, devolvido uma vez no registo). Se o perfil de preço
                  aplicar taxa às liquidações, configure também <Code>BANZAMI_FEE_DESTINATION</Code>, o @banza do seu Business que recebe a taxa.
                </LI>
                <LI>Antes de ativar uma campanha, confirme com <Code>getFinancialSetup()</Code> que o projeto pode receber.</LI>
              </ol>

              <H2 id="doa-contas">2. Criar a conta da campanha</H2>
              <ChapterFacts lang="pt" appLabel="DOA"
                goal="Uma conta segregada por campanha."
                app="Cria a conta quando a campanha é ativada e guarda o id junto da campanha."
                banzami="Abre a conta na carteira do Business do projeto."
                result={<><Code>201</Code> com o <Code>id</Code> da conta e <Code>status: &quot;ACTIVE&quot;</Code>.</>}
                failure={<><Code>400 PAYEE_NOT_ALLOWED</Code> se o pedido indicar a carteira.</>} />
              <CodeBlock label="ts · conta por campanha" onCopy={copy} raw={`// Ao ativar a campanha, abrir a conta que a vai receber.
const conta = await banzami.createWalletAccount({
  purpose:       'CAMPAIGN',
  referenceType: 'CAMPANHA',
  referenceId:   campanha.id,      // a referência da sua aplicação
  label:         campanha.titulo,
});

// Guardar o id: é a origem da liquidação.
await db.campanhas.update(campanha.id, { banzami_wallet_account_id: conta.id });`} />

              <H2 id="doa-pagamento">3. Criar o pagamento</H2>
              <Callout><strong>Unidades menores:</strong> <Code>amountMinor: 500000</Code> são 5 000 Kz (100 = 1 Kz).</Callout>
              <ChapterFacts lang="pt" appLabel="DOA"
                goal="Uma sessão de pagamento por doação, creditada na conta da campanha."
                app="Cria a sessão com o id da intenção de doação como referência."
                banzami="Cria o link e o QR, ambos associados à conta da campanha."
                result={<><Code>201</Code> com <Code>status: &quot;ACTIVE&quot;</Code> e um link <Code>pay.banzami.com/pay/…</Code>.</>}
                failure="Repetir a mesma referência devolve a sessão existente, mesmo com outro montante." />
              <CodeBlock label="ts · sessão por doação" onCopy={copy} raw={`const sessao = await banzami.createPaymentSession({
  walletAccountId: campanha.banzami_wallet_account_id,
  purpose:         'DONATION',
  referenceType:   'DOACAO',
  referenceId:     intencao.id,     // devolvido em payment_session.paid
  amountMinor:     500000,          // 5 000 Kz
  currency:        'AOA',
  description:     'Doação para ' + campanha.titulo,
});
const link = banzami.paymentSessionInterface(sessao, 'PAYMENT_LINK');`} />

              <H2 id="doa-pagina">4. Página de pagamento e QR</H2>
              <P>
                O doador paga numa página do Banzami. A sessão devolve um link para <Code>pay.banzami.com/pay/…</Code> e um QR que codifica o mesmo endereço;
                o DOA mostra um dos dois. O regresso do doador à página do DOA não confirma o pagamento: a confirmação chega pelo webhook, ou lendo a sessão no servidor.
              </P>

              <H2 id="doa-webhook">5. Receber o webhook</H2>
              <ChapterFacts lang="pt" appLabel="DOA"
                goal="Confirmar cada doação uma única vez, a partir de um evento verificado."
                app="Verifica a assinatura sobre o corpo em bruto, deduplica pelo id do evento e confirma a doação."
                banzami="Assina e entrega payment_session.paid, e repete a entrega se não receber 2xx."
                result="A doação fica confirmada uma vez, mesmo que o evento chegue mais de uma vez."
                failure="Interpretar o JSON antes de verificar: a assinatura falha." />
              <CodeBlock label="ts · webhook" onCopy={copy} raw={`export async function POST(req) {
  // 1. O corpo em bruto: reserializar o JSON altera os bytes assinados.
  const raw = await req.text();

  // 2. Verificar antes de ler. constructEvent verifica a assinatura e só depois
  //    devolve o evento. (cliente criado com { apiKey, webhookSecret })
  let evento;
  try {
    evento = banzami.webhooks.constructEvent(raw, req.headers.get('banza-signature') ?? '');
  } catch {
    return new Response('assinatura inválida', { status: 400 });
  }

  // 3. Idempotente pelo id do evento: a entrega é at-least-once.
  if (await db.eventos.existe(evento.id)) return new Response('ok');
  await db.eventos.registar(evento.id);

  // 4. O efeito de negócio.
  if (evento.type === 'payment_session.paid') {
    // reference_id é a referência dada ao criar a sessão.
    await confirmarDoacao(evento.data.reference_id);
  }

  // 5. Responder 2xx rapidamente; trabalho demorado vai para uma fila.
  return new Response('ok');
}`} />

              <H2 id="doa-estado">6. Atualizar o estado da aplicação</H2>
              <UL>
                <LI><strong>A doação</strong> passa a confirmada quando o evento é aplicado. O DOA confirma pela intenção de doação, uma única vez, venha a confirmação por <Code>payment_session.paid</Code> ou por <Code>payment_link.paid</Code>.</LI>
                <LI><strong>O total da campanha</strong> não é um saldo guardado pelo DOA: consulta-se no Banzami com <Code>getWalletAccount</Code>.</LI>
                <LI><strong>O estado da campanha</strong> (ativa, encerrada, liquidada) é do DOA. O estado do dinheiro é do Banzami.</LI>
              </UL>

              <H2 id="doa-comprovativo">7. Comprovativo</H2>
              <P>
                O comprovativo do pagamento é emitido pelo Banzami, com uma referência pública <Code>BZM-…</Code> e um QR que abre <Code>https://banzami.com/r/&#123;referência&#125;</Code>.
                O recibo da doação enviado pelo DOA é um documento da aplicação, que pode citar essa referência.
              </P>
              <P>
                A verificação é pública: <Code>GET /v1/public/proofs/&#123;referência&#125;</Code> responde <Code>200</Code> com o estado e o montante, ou <Code>404</Code>.{' '}
                <a href="/docs/receipts" style={a}>Comprovativos</a>
              </P>

              <H2 id="doa-encerrar">8. Encerrar a campanha</H2>
              <P>
                Encerrar a campanha é uma decisão do DOA e é o momento em que pede a liquidação. Até lá, o saldo mantém-se na conta da campanha.
                Uma campanha encerrada com liquidação pendente é um estado normal, que a aplicação deve apresentar como tal.
              </P>

              <H2 id="doa-liquidacao">9. Liquidar a campanha</H2>
              <ChapterFacts lang="pt" appLabel="DOA"
                goal="Transferir o saldo da campanha para o beneficiário."
                app="Pede a liquidação da conta da campanha, com uma chave de idempotência por campanha, e guarda o id da liquidação."
                banzami="Lê o saldo, aplica o perfil de preço, credita a taxa e o líquido, e emite application_settlement.completed."
                result={<><Code>201</Code> com <Code>gross_amount_minor</Code>, <Code>application_fee_minor</Code> e <Code>net_amount_minor</Code>.</>}
                failure={<><Code>422 FEE_DESTINATION_REQUIRED</Code>: o perfil de preço tem taxa e o pedido não indica o destino.</>} />
              <CodeBlock label="ts · liquidação" onCopy={copy} raw={`const liquidacao = await banzami.createBusinessApplicationSettlement({
  sourceAccountId:         campanha.banzami_wallet_account_id,
  beneficiaryBanzaName:    campanha.beneficiario_banza,   // o @banza de quem recebe
  // Um @banza do seu Business (APPLICATION ou PLATFORM) quando o perfil tem taxa.
  feeDestinationBanzaName: process.env.BANZAMI_FEE_DESTINATION,
  referenceType:           'CAMPANHA',
  referenceId:             campanha.id,
  // Uma chave por campanha, guardada antes do pedido.
  idempotencyKey:          'idem_liquidacao_' + campanha.id,
});

// Resultado, calculado pelo Banzami:
// {
//   gross_amount_minor:     100000,   // o saldo da conta
//   application_fee_minor:    2000,   // 200 bps
//   net_amount_minor:        98000,   // para o beneficiário
//   currency: "AOA", status: "COMPLETED"
// }`} />
              <P>
                Os três movimentos somam zero: <Code>-100000 + 2000 + 98000 = 0</Code>. O pedido não leva montante nem taxa; a liquidação não é automática.{' '}
                <a href="/docs/settlements" style={a}>Liquidações</a>
              </P>

              <H2 id="doa-reconciliacao">10. Reconciliar</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Verificação</th><th style={TH}>Fonte no Banzami</th></tr></thead>
                  <tbody>
                    {[
                      ['Cada doação confirmada corresponde a um pagamento', 'payment_session.paid e getPaymentSession'],
                      ['O total da campanha', 'getWalletAccount (saldo da conta)'],
                      ['Bruto, taxa e líquido da liquidação', 'A resposta de createBusinessApplicationSettlement e application_settlement.completed'],
                      ['Um pedido específico', 'request_id em Consola → Registos'],
                    ].map((r, i) => (
                      <tr key={i}><td style={TD}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="doa-credenciais">11. Rodar e revogar credenciais</H2>
              <UL>
                <LI><strong>Chave de API:</strong> crie uma chave nova com os mesmos scopes, coloque-a no servidor, confirme <Code>GET /v1/me</Code> e revogue a anterior. A revogação é imediata: a chave antiga passa a responder <Code>401</Code>.</LI>
                <LI><strong>Segredo do webhook:</strong> <Code>rotateWebhookEndpointSecret</Code> devolve um segredo novo, uma vez. A troca é imediata; prepare o servidor antes de rodar.</LI>
                <LI><strong>Suspeita de exposição:</strong> revogue primeiro e investigue depois. Uma chave revogada não pode ser reativada.</LI>
              </UL>

              <H2 id="doa-licoes">O que reutilizar na sua aplicação</H2>
              <UL>
                <LI><strong>Uma conta por unidade de negócio desde o início.</strong> Separar valores depois de misturados é muito mais difícil.</LI>
                <LI><strong>Nenhum saldo duplicado.</strong> Mostre o valor que o Banzami devolve.</LI>
                <LI><strong>A prontidão financeira é uma condição.</strong> Consulte-a antes de oferecer o pagamento, em vez de esperar pelo 403.</LI>
                <LI><strong>Registe o request_id</strong> de cada resposta inesperada.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}>Os exemplos usam identificadores fictícios e não contêm chaves, segredos nem ids internos.</P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/get-started', title: 'Quickstart', desc: 'Os mesmos passos, para a sua aplicação.' },
                { href: '/docs/settlements', title: 'Liquidações', desc: 'Cálculo, destino da taxa e erros.' },
                { href: '/docs/troubleshooting', title: 'Resolução de problemas', desc: 'Por sintoma, com o que verificar.' },
              ]} />
            </Section>
    </>
  );
}


export function PtConsole({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="console">
              <h1 style={H1_STYLE}>A Consola</h1>
              <PageLede>A Consola, em <Code>developers.banzami.com</Code>, é onde gere workspaces, projetos, configuração financeira, chaves, webhooks e registos.</PageLede>

              <H2 id="modelo">O modelo</H2>
              <P>Pessoa, workspace, projeto e Business são conceitos distintos. <a href="/docs/concepts#modelo" style={a}>O modelo de integração</a></P>

              <H2 id="conta">Conta</H2>
              <P>A conta pessoal fica em <Code>/conta</Code>. A autenticação é feita com email e um código de seis dígitos; não há palavra-passe.</P>
              <UL>
                <LI><strong>Perfil</strong> — o nome apresentado aos membros dos seus workspaces. O email é o identificador e não pode ser alterado.</LI>
                <LI><strong>Segurança</strong> — descreve o modelo de autenticação: código por email e sessão em cookie. Não há palavra-passe nem MFA para configurar.</LI>
                <LI><strong>Sessões</strong> — as sessões abertas, com origem e última utilização, e a opção de terminar todas as outras.</LI>
                <LI><strong>Sair</strong> — pede confirmação e termina a sessão atual.</LI>
              </UL>

              <H2 id="workspace">Workspaces, membros e papéis</H2>
              <P>O workspace define quem tem acesso. Criá-lo é imediato.</P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Papel</th><th style={TH}>Permissões</th></tr></thead>
                  <tbody>
                    {[
                      ['Owner', 'Todas, incluindo convidar, alterar papéis, arquivar e eliminar. O último Owner não pode sair.'],
                      ['Admin', 'Gerir membros, projetos e chaves. Não altera nem remove Owners ou outros Admins, e não nomeia Admins.'],
                      ['Developer', 'Criar e gerir projetos, chaves e webhooks. Não gere membros.'],
                      ['Finance', 'Consultar saldos, transações e liquidações. Não cria chaves.'],
                      ['Viewer', 'Apenas consulta.'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_HEAD}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Convidar</strong> gera um link que a Consola copia. O convite define o papel; quem o aceita entra com o próprio email.</LI>
                <LI><strong>Sair de um workspace</strong> é sempre possível, exceto para o último Owner.</LI>
                <LI><strong>Transferir a titularidade</strong> faz-se em dois passos: um Owner atribui o papel de Owner a outro membro e depois sai ou altera o seu papel. O workspace nunca fica sem Owner.</LI>
                <LI><strong>Arquivar</strong> é opcional e serve apenas para organizar; é recusado enquanto houver projetos ativos.</LI>
                <LI><strong>Eliminar</strong> está disponível para o Owner, mesmo depois de atividade, e sem arquivar primeiro. Elimina todos os projetos do workspace, ativos e arquivados, revoga as chaves e invalida os membros e os convites pendentes.</LI>
              </UL>

              <H2 id="atividade">Atividade do workspace</H2>
              <P>
                Em <Code>Configurações · Atividade</Code>, o registo administrativo do workspace: convites, entradas e saídas, alterações de papel, e alterações ao workspace,
                aos projetos e às chaves. Uma alteração de papel mostra o papel anterior e o novo.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Atividade</th><th style={TH}>Registos</th></tr></thead>
                  <tbody>
                    {[
                      ['Responde a', 'Quem alterou o quê no workspace', 'O que a aplicação pediu à API'],
                      ['Âmbito', 'O workspace', 'Um projeto'],
                      ['Quem vê', 'Owners e Admins', 'Membros com acesso ao projeto'],
                      ['Retenção', 'Permanente; sobrevive a projetos eliminados', '30 dias'],
                      ['Segredos', 'Nunca: nem valores de chaves nem prefixos', 'Nunca: nem Authorization, nem corpos de pedido'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P style={{ fontSize: 13, color: MUT }}>Sessões pessoais, códigos de entrada e definições de conta não aparecem na Atividade; pertencem a <Code>/conta</Code>.</P>

              <H2 id="projeto">Projetos</H2>
              <UL>
                <LI><strong>Project ID</strong> — não muda quando altera o nome.</LI>
                <LI><strong>Eliminar</strong> — disponível para Owners e Admins, mesmo depois de pagamentos, reembolsos ou liquidações de teste, e também para um projeto arquivado. Confirma-se escrevendo o nome do projeto.</LI>
                <LI><strong>Arquivar</strong> — opcional. Revoga as chaves ativas; a partir daí, respondem <Code>401</Code>. Os projetos arquivados aparecem em <strong>Mostrar arquivados</strong>.</LI>
              </UL>

              <H2 id="eliminar">O que acontece ao eliminar</H2>
              <P>No Sandbox, os recursos são descartáveis. Eliminar tira o projeto do seu ambiente de imediato e o Banzami encerra o resto:</P>
              <UL>
                <LI><strong>De imediato</strong> — as chaves de API são revogadas e respondem <Code>401</Code>; o projeto sai das listas; tokens de tempo real deixam de ser aceites; não se criam novas sessões nem links.</LI>
                <LI><strong>Encerramento</strong> — os pagadores de teste são retirados, as sessões e os links abertos são cancelados, os webhooks são desativados e o negócio de teste do projeto é retirado, se nenhum outro projeto o usar. Os saldos fictícios são devolvidos por lançamentos equilibrados; nenhum saldo é editado.</LI>
                <LI><strong>Estado</strong> — enquanto o encerramento decorre, o pedido responde <Code>202</Code> com <Code>DELETING</Code>; quando termina, <Code>DELETED</Code>. Repetir o pedido é seguro.</LI>
                <LI><strong>O que fica</strong> — o histórico do ledger não é reescrito: pagamentos, reembolsos e comprovativos já emitidos continuam verificáveis como SANDBOX. O Banzami guarda internamente apenas os registos financeiros, de auditoria e de segurança necessários; a Atividade do workspace continua a mostrar o projeto eliminado. Os registos de pedidos são apagados.</LI>
                <LI><strong>O nome</strong> fica livre: um projeto novo com o mesmo nome é um recurso novo, sem nada do anterior.</LI>
                <LI>Um Business real ligado por código de consentimento, ou um negócio de teste partilhado com outro projeto, não é afetado.</LI>
                <LI>Aplica-se apenas ao Sandbox. Não dá à produção financeira nenhuma eliminação equivalente.</LI>
              </UL>

              <H2 id="financeiro">Configuração financeira</H2>
              <P>
                Liga o projeto ao Business que recebe os pagamentos. No Sandbox, escolha o tipo de uso — <strong>Loja, serviço ou negócio</strong> ou <strong>Aplicação ou plataforma</strong> — e o Banzami cria um negócio de teste, com a classificação e o preço desse uso; ou ligue um Business existente com o código de consentimento.
                Mostra o negócio (um negócio de teste aparece como não verificado), a prontidão para liquidar, o perfil de preço e o destino da taxa. O tipo de uso pode mudar até ao primeiro pagamento emitido, e
                <strong> Gerar código de ligação</strong> permite que outro projeto seu use o mesmo negócio de teste. <a href="/docs/get-started#configuracao-financeira" style={a}>Os dois caminhos</a>
              </P>
              <P style={{ fontSize: 13, color: MUT }}>O mesmo estado está disponível por API em <Code>GET /v1/financial-setup</Code>.</P>

              <H2 id="chaves">Chaves de API</H2>
              <UL>
                <LI><strong>Nome</strong> — identifica a chave na lista e na Atividade; não altera permissões.</LI>
                <LI><strong>Scopes</strong> — definidos na criação e imutáveis.</LI>
                <LI><strong>Segredo</strong> — começa por <Code>bz_test_sk_</Code> e é mostrado uma única vez, no diálogo de criação. Depois, a lista mostra apenas o prefixo e uma máscara.</LI>
                <LI><strong>Rodar</strong> — cria a chave sucessora e revoga a anterior no mesmo passo. Para trocar sem interrupção, crie primeiro uma chave nova, coloque-a em uso e só depois revogue a anterior.</LI>
                <LI><strong>Revogar</strong> — imediato: o pedido seguinte com essa chave responde <Code>401</Code>.</LI>
                <LI><strong>Última utilização</strong> — permite identificar chaves que já não são usadas.</LI>
              </UL>
              <P>Cada endpoint exige um scope. Crie cada chave só com os scopes de que o servidor precisa:</P>
              <ScopeTable lang="pt" />
              <P><a href="/docs/trust#chaves" style={a}>Onde guardar chaves</a></P>

              <H2 id="webhooks-console">Webhooks</H2>
              <UL>
                <LI><strong>Registar</strong> um endpoint HTTPS devolve o segredo de assinatura uma única vez.</LI>
                <LI><strong>Eventos</strong> lista os eventos do projeto; cada evento mostra as entregas, com estado e código de resposta.</LI>
                <LI><strong>Reenviar</strong> repete a mesma entrega.</LI>
                <LI><strong>Enviar evento de teste</strong> envia <Code>webhook.test</Code> ao endpoint, assinado, marcado como teste; não move nada e pode ser reenviado.</LI>
                <LI><strong>Rodar o segredo</strong> emite um segredo novo, mostrado uma vez; o endpoint mantém-se.</LI>
                <LI><strong>Desativar</strong> deixa de enviar eventos para o endpoint, sem o eliminar. Os eventos emitidos enquanto está desativado não lhe são entregues depois.</LI>
              </UL>
              <P><a href="/docs/webhooks" style={a}>Configurar webhooks</a></P>

              <H2 id="registos">Saldos, transações e registos</H2>
              <UL>
                <LI><strong>Saldos</strong> — as contas do Business ligado ao projeto e o saldo de cada uma.</LI>
                <LI><strong>Transações</strong> — pagamentos, reembolsos e transferências entre contas do Business ligado ao projeto, incluindo as que outros projetos do mesmo Business iniciaram.</LI>
                <LI><strong>Registos</strong> — cada pedido feito com as chaves do projeto, com <Code>request_id</Code>, estado e latência, retido durante 30 dias. Filtre por método e por origem: as chaves da integração ou o API Explorer.</LI>
              </UL>

              <H2 id="dados-teste-console">Dados de teste e API Explorer</H2>
              <UL>
                <LI><strong>Visão geral</strong> — os passos para começar no Sandbox, marcados a partir do que o projeto já fez, e os dois ambientes: Sandbox disponível; Live indisponível, a requerer aprovação institucional.</LI>
                <LI><strong>Dados de teste</strong> — pagadores de teste (criar, carregar, pagar como, retirar), os cenários e <strong>Repor a Sandbox</strong>.</LI>
                <LI><strong>API Explorer</strong> — executa a API v1 contra o Sandbox sem nenhuma chave no browser: cada pedido usa uma chave de 60 segundos, só com o scope da operação.</LI>
              </UL>
              <P><a href="/docs/testing" style={a}>Testar no Sandbox</a></P>
              <P style={{ fontSize: 13, color: MUT }}>Nenhuma página da Consola apresenta dados ilustrativos. Uma lista vazia significa que ainda não há registos.</P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/get-started', title: 'Quickstart', desc: 'Da conta ao primeiro pagamento.' },
                { href: '/docs/trust', title: 'Segurança', desc: 'Chaves, segredos e permissões.' },
                { href: '/docs/troubleshooting', title: 'Resolução de problemas', desc: 'O que ver na Consola, por sintoma.' },
              ]} />
            </Section>
    </>
  );
}

export function PtReference({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="api-reference">
              <h1 style={H1_STYLE}>Referência da API</h1>
              <PageLede>A API pública v1 do Banzami, endpoint a endpoint: autenticação, scope, parâmetros, resposta, erros, eventos e o método do SDK correspondente.</PageLede>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <tbody>
                    {[
                      ['URL base', 'https://sandbox-api.banzami.com/v1'],
                      ['Autenticação', 'Authorization: Bearer bz_test_sk_…'],
                      ['Formato', 'JSON; datas em UTC (RFC 3339); montantes em unidades menores'],
                      ['Versão', 'v1'],
                      ['SDK recomendado', '@banzami/sdk'],
                      ['Especificação', 'OpenAPI em /developers/openapi/banzami-sandbox.openapi.json'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_HEAD}>{r[0]}</td><td style={TD_MONO}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="autenticacao">Autenticação</H2>
              <UL>
                <LI>Envie a chave secreta no header <Code>Authorization: Bearer bz_test_sk_…</Code>. Não há token a trocar.</LI>
                <LI>As chaves <Code>bz_live_</Code> são recusadas. <a href="/docs/concepts#sandbox-live" style={a}>Sandbox e Live</a></LI>
                <LI>Uma chave revogada ou rodada responde <Code>401 UNAUTHORIZED</Code>.</LI>
                <LI>Workspaces, projetos, membros e chaves geem-se na Consola; não fazem parte desta API.</LI>
              </UL>

              <H2 id="credenciais">Capacidades por credencial</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Capacidade</th><th style={TH}>Credencial</th><th style={TH}>Estado</th></tr></thead>
                  <tbody>
                    {([
                      ['Consola — workspaces, projetos, membros, chaves', 'Sessão (email + código)', 'Disponível em Sandbox'],
                      ['GET /v1/me', 'Chave de projeto (identity:read)', 'Disponível em Sandbox'],
                      ['Sessões de pagamento', 'Chave de projeto (payment_sessions:write / :read) e configuração financeira concluída', 'Disponível em Sandbox'],
                      ['Links de pagamento', 'Chave de projeto (payment_links:write / :read) e configuração financeira concluída', 'Disponível em Sandbox'],
                      ['Webhooks', 'Chave de projeto (webhooks:write / :read)', 'Disponível em Sandbox'],
                      ['Reembolsos', 'Chave de projeto (refunds:write / :read)', 'Disponível em Sandbox'],
                      ['Transferências entre contas', 'Chave de projeto (transfers:write)', 'Disponível em Sandbox'],
                      ['Liquidações', 'Chave de projeto (application_settlements:write)', 'Disponível em Sandbox'],
                      ['Financial Live', '—', 'Indisponível (fail-closed)'],
                    ] as [string, string, string][]).map(([cap, cred, st]) => (
                      <tr key={cap}><td style={TD_HEAD}>{cap}</td><td style={TD}>{cred}</td><td style={TD}>{st}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H2 id="idempotencia">Idempotência <Badge tone="ok" /></H2>
              <UL>
                <LI><strong>Timeout ou erro de rede:</strong> repita com a mesma chave e o mesmo corpo. Uma chave nova faz dele um segundo pedido.</LI>
                <LI><strong>Header <Code>Idempotency-Key</Code>:</strong> em qualquer escrita, a resposta original (2xx ou 4xx) é reproduzida para a mesma chave durante 24 horas, por credencial, método e caminho.</LI>
                <LI><strong>5xx:</strong> nunca é reproduzido; o pedido pode ser repetido com a mesma chave.</LI>
                <LI><strong>Pedidos simultâneos</strong> com a mesma chave: o segundo recebe <Code>409 IDEMPOTENCY_CONFLICT</Code>. Aguarde e repita com a mesma chave.</LI>
                <LI><strong>A mesma chave com outro corpo</strong> recebe <Code>409 IDEMPOTENCY_KEY_REUSED</Code>: é outro pedido e precisa de outra chave.</LI>
                <LI><strong>Reembolsos, transferências e liquidações</strong> exigem também <Code>idempotency_key</Code> no corpo, que protege o movimento de dinheiro.</LI>
              </UL>
              <CodeBlock label="curl · repetição segura com Idempotency-Key" raw={SAMPLE_IDEM_RETRY} onCopy={copy} />

              <H2 id="limites">Limites de pedidos</H2>
              <P>
                Há limites por endereço IP e por chave. Ao excedê-los, a API responde <Code>429 RATE_LIMITED</Code> com o header <Code>Retry-After</Code>, em segundos, e não executa o pedido.
                Os valores dos limites podem mudar; este comportamento não.
              </P>
              <H2 id="datas">Datas e horas</H2>
              <P>
                Todas as datas são UTC, em RFC 3339 (<Code>2026-07-11T11:45:00Z</Code>). A Consola apresenta-as no fuso horário do browser e a página pública de verificação
                de comprovativos no fuso horário de Luanda.
              </P>
              <H2 id="identificadores">Identificadores a guardar</H2>
              <UL>
                <LI><strong>Project ID</strong> — não muda com o nome do projeto.</LI>
                <LI><strong>Ids dos recursos</strong> — <Code>session_id</Code>, conta, reembolso, endpoint — para os consultar.</LI>
                <LI><strong><Code>reference_id</Code></strong> — a sua referência, devolvida nos recursos e nos eventos.</LI>
                <LI><strong><Code>id</Code> de cada evento</strong> — para deduplicar entregas.</LI>
                <LI><strong>Referência <Code>BZM-…</Code></strong> — a que se verifica publicamente.</LI>
                <LI><strong><Code>request_id</Code></strong> — de cada resposta inesperada.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}>Um id não confere acesso: um recurso de outro projeto responde <Code>404</Code>.</P>

              <H2 id="referencia-recursos">Endpoints</H2>
              <ResourceReference lang="pt" onCopy={copy} />

              <NextStepCards lang="pt" items={[
                { href: '/docs/errors', title: 'Catálogo de erros', desc: 'Cada código, o que significa e o que fazer.' },
                { href: '/docs/events', title: 'Referência de eventos', desc: 'Campos e ação esperada.' },
                { href: '/docs/artifacts', title: 'OpenAPI e Postman', desc: 'Os mesmos endpoints, em formato máquina.' },
              ]} />
              </Section>
    </>
  );
}

export function PtErrors({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="errors">
              <h1 style={H1_STYLE}>Erros</h1>
              <PageLede>Todas as respostas de erro usam o mesmo envelope. Trate-as pelo código HTTP e depois pelo campo <Code>code</Code>, nunca pela mensagem.</PageLede>
              <CodeBlock label="json · envelope de erro" raw={SAMPLE_ERROR} onCopy={copy} />
              <UL>
                <LI><Code>code</Code> — estável; é o campo a usar na lógica da aplicação.</LI>
                <LI><Code>message</Code> — explicação em inglês, para logs. Pode mudar.</LI>
                <LI><Code>request_id</Code> — encontra o pedido em <strong>Consola → Registos</strong> durante 30 dias. Os registos nunca guardam o header <Code>Authorization</Code>, chaves, segredos, cookies, códigos OTP nem corpos de pedido.</LI>
              </UL>

              <H2 id="por-classe">Por código HTTP</H2>
              <HttpClassTable lang="pt" />

              <H2 id="catalogo-de-erros">Por código de erro</H2>
              <P>Todos os códigos que uma chave de projeto pode receber no Sandbox, e apenas esses. Pesquise por código ou palavra, ou filtre por HTTP e domínio.</P>
              <ErrorCatalogue lang="pt" />

              <H2 id="erros-consola">Erros da Consola</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Código</th><th style={TH}>O que fazer</th></tr></thead>
                  <tbody>
                    {[
                      ['INVALID_EMAIL / INVALID_CODE', 'Corrigir o email ou pedir um código novo.'],
                      ['RATE_LIMITED', 'Aguardar antes de pedir outro código.'],
                      ['UNAUTHENTICATED', 'A sessão expirou: entrar de novo.'],
                      ['FORBIDDEN', 'O seu papel não permite a ação, ou o pedido falhou a verificação de origem.'],
                      ['CONFLICT / LAST_OWNER', 'O estado mudou, ou a ação deixaria o workspace sem Owner.'],
                      ['INVITE_INVALID', 'O convite expirou, foi revogado ou já foi usado: pedir outro.'],
                      ['VALIDATION', 'Corrigir os campos indicados.'],
                    ].map((r) => (
                      <tr key={r[0]}><td style={TD_MONO}>{r[0]}</td><td style={TD}>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <NextStepCards lang="pt" items={[
                { href: '/docs/troubleshooting', title: 'Resolução de problemas', desc: 'Partir do sintoma em vez do código.' },
                { href: '/docs/reference#idempotencia', title: 'Idempotência', desc: 'Quando repetir com a mesma chave.' },
                { href: '/docs/support', title: 'Suporte', desc: 'O que enviar, e o que nunca enviar.' },
              ]} />
            </Section>
    </>
  );
}


export function PtSdk({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="sdks">
              <h1 style={H1_STYLE}>SDKs</h1>
              <PageLede>Os SDKs oficiais tratam da autenticação, idempotência, repetições e verificação de webhooks. São o caminho recomendado; a API HTTP serve para diagnóstico e integrações específicas.</PageLede>

              <H2 id="sdk-matriz">SDKs disponíveis</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ ...TABLE, minWidth: 560 }}>
                  <thead><tr style={THEAD}><th style={TH}>Pacote</th><th style={TH}>Linguagem</th><th style={TH}>Estado</th><th style={TH}>Instalação</th></tr></thead>
                  <tbody>
                    {SDKS.map((s) => (
                      <tr key={s.name}><td style={TD_MONO}>{s.name}</td><td style={TD}>{s.lang}</td><td style={TD}>{s.state}</td><td style={TD_MONO}>{s.consume}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><Code>@banzami/sdk</Code> (npm) é o SDK de servidor e usa a chave secreta.</LI>
                <LI><Code>banzami_client</Code> (pub.dev) é o SDK cliente e usa apenas a chave publicável, de leitura.</LI>
                <LI>Os SDKs de Python, PHP e Go não estão publicados; esta documentação não mostra comandos de instalação para pacotes que nenhum registo disponibiliza.</LI>
              </UL>

              <H2 id="sdk-first">O que o SDK trata por si</H2>
              <UL>
                <LI>Autenticação com a chave e separação de ambientes.</LI>
                <LI>Uma <Code>Idempotency-Key</Code> por pedido de escrita, e repetição em <Code>429</Code>, <Code>502</Code>, <Code>503</Code> e <Code>504</Code>.</LI>
                <LI>Erros tipados: <Code>BanzamiApiError</Code> com <Code>status</Code> e <Code>code</Code>.</LI>
                <LI>Verificação de assinatura de webhooks: <Code>webhooks.constructEvent</Code>.</LI>
              </UL>
              <P style={{ fontSize: 13, color: MUT }}>
                Reembolsos, transferências e liquidações exigem uma chave de idempotência sua: o SDK não a gera, porque uma chave nova em cada tentativa anularia a proteção.
              </P>

              <H2 id="sdk-preview">Versão atual</H2>
              <P>
                <Code>@banzami/sdk</Code> 0.14.1. Com uma chave de projeto: sessões e <a href="/docs/payments#links" style={a}>links de pagamento</a> sem indicar quem recebe, pagadores de teste
                (<Code>createTestPayer</Code>, <Code>fundTestPayer</Code>, <Code>payAsTestPayer</Code>), <Code>sendWebhookTestEvent</Code> e, para o browser, <Code>@banzami/sdk/realtime</Code>.
                <Code>payAsTestPayer</Code> aceita todas as simulações da API, incluindo <Code>DELAYED</Code>, que devolve <Code>PENDING</Code>.
              </P>
              <P>
                Exemplo completo: <a href="/developers/examples/sdk/typescript-payment-session.example.ts" style={a}>typescript-payment-session.example.ts</a>. Os exemplos TypeScript desta documentação
                são compilados contra o pacote publicado.
              </P>

              <H2 id="sdk-familias">Estado por família</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ ...TABLE, minWidth: 560 }}>
                  <thead><tr style={THEAD}><th style={TH}>Família</th><th style={TH}>Estado</th><th style={TH}>Pacote público</th><th style={TH}>Utilização</th></tr></thead>
                  <tbody>
                    {([
                      ['JavaScript / TypeScript', 'Publicado', '@banzami/sdk', 'Servidor — chave secreta'],
                      ['Dart / Flutter (cliente)', 'Publicado', 'banzami_client', 'Cliente — chave publicável, só leitura'],
                      ['Python', 'Não publicado', '—', 'Código-fonte'],
                      ['PHP', 'Não publicado', '—', 'Código-fonte'],
                    ] as [string, string, string, string][]).map((r) => (
                      <tr key={r[0]}><td style={TD_HEAD}>{r[0]}</td><td style={TD}>{r[1]}</td><td style={TD_MONO}>{r[2]}</td><td style={TD}>{r[3]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>
                Contratos machine-readable:{' '}
                <a href="/developers/artifacts/sdk-contract.json" style={a}>sdk-contract.json</a> ·{' '}
                <a href="/developers/artifacts/sdk-first-manifest.json" style={a}>sdk-first-manifest.json</a>.
              </P>

              <H2 id="antes-de-integrar">Referência de implementação</H2>
              <P>
                O <strong>DOA</strong> usa o <Code>@banzami/sdk</Code> para criar contas e sessões, resolver <Code>@banza</Code>, verificar webhooks e pedir liquidações, sem chamadas HTTP diretas.{' '}
                <a href="/docs/doa" style={a}>Construir como o DOA</a>
              </P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/get-started', title: 'Quickstart', desc: 'Instalar o SDK e criar o primeiro pagamento.' },
                { href: '/docs/reference', title: 'Referência da API', desc: 'Cada endpoint, com o método do SDK.' },
                { href: '/docs/support', title: 'Suporte', desc: 'Reportar um problema com o SDK.' },
              ]} />
              </Section>
    </>
  );
}

export function PtArtifacts({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="artefactos-page">
              <h1 style={H1_STYLE}>Artefactos</h1>
              <PageLede>A mesma API em formatos para ferramentas: OpenAPI, Postman, exemplos e manifests. Descrevem o Sandbox.</PageLede>
<H2 id="artefactos">Ficheiros disponíveis</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Artefacto</th><th style={TH}>Para</th></tr></thead>
                  <tbody>
                    <tr><td style={TD}><a href="/developers/openapi/banzami-sandbox.openapi.json" style={a}>OpenAPI 3</a></td><td style={TD}>Gerar clientes, validar pedidos, importar em ferramentas. Só os endpoints públicos.</td></tr>
                    <tr><td style={TD}><a href="/developers/postman/banzami-sandbox.postman_collection.json" style={a}>Coleção Postman</a></td><td style={TD}>Explorar a API manualmente.</td></tr>
                    <tr><td style={TD}><a href="/developers/examples/curl/get-me.sh" style={a}>get-me.sh</a> · <a href="/developers/examples/curl/create-payment-session.sh" style={a}>create-payment-session.sh</a></td><td style={TD}>Diagnóstico com curl.</td></tr>
                    <tr><td style={TD}><a href="/developers/availability/banzami-developers-availability.json" style={a}>Matriz de disponibilidade</a></td><td style={TD}>O estado de cada capacidade, em JSON.</td></tr>
                    <tr><td style={TD}><a href="/developers/artifacts/manifest.json" style={a}>manifest.json</a> · <a href="/developers/artifacts/sdk-first-manifest.json" style={a}>sdk-first-manifest.json</a></td><td style={TD}>Índice dos artefactos e dos SDKs publicados.</td></tr>
                    <tr><td style={TD}><a href="/llms.txt" style={a}>llms.txt</a></td><td style={TD}>Índice da documentação em texto, para ferramentas e assistentes.</td></tr>
                  </tbody>
                </table>
              </div>
              <P style={{ fontSize: 13, color: MUT }}>Os artefactos não descrevem Financial Live, que não está disponível.</P>
              <NextStepCards lang="pt" items={[
                { href: '/docs/reference', title: 'Referência da API', desc: 'A mesma superfície, explicada.' },
                { href: '/docs/changelog', title: 'Changelog', desc: 'O que mudou e quando.' },
              ]} />
</Section>
    </>
  );
}

const RECIPES_NOTE = 'Os exemplos usam uma chave de teste do seu projeto. Nada do que é feito no Sandbox move dinheiro real.';

const SAMPLE_CURL_EXTERNAL_RAIL = `# Colocar o rail externo simulado do seu projeto em baixo
curl -X PUT https://sandbox-api.banzami.com/v1/sandbox/external-rail \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{"state":"UNAVAILABLE"}'
# 200 { "state": "UNAVAILABLE", "simulated": true }

# Um pagamento a partir da carteira continua a concluir-se
# POST /v1/sandbox/test-payers/tp_exemplo/payments {"payment_session_id":"payment_session_exemplo"}
# 200 { "status": "PAID", "rail": "WALLET", … }

# Um pagamento que atravessa o rail externo não se conclui
# POST /v1/sandbox/test-payers/tp_exemplo/payments {"payment_session_id":"…","simulate":"DECLINED"}
# 503 { "code": "PROVIDER_UNAVAILABLE", "rail": "EXTERNAL_SIMULATED", "simulated": true, … }

# Repor o rail: -d '{"state":"AVAILABLE"}'`;

const SAMPLE_CURL_TEST_PAYER_PAY = `curl -X POST https://sandbox-api.banzami.com/v1/sandbox/test-payers/tp_exemplo/payments \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Idempotency-Key: pagamento_001" \\
  -H "Content-Type: application/json" \\
  -d '{"payment_session_id":"payment_session_exemplo","via":"QR"}'

# 200
# { "test_payer_id": "tp_exemplo", "via": "QR", "status": "PAID",
#   "transfer_id": "transfer_exemplo", "proof_reference": "BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX",
#   "simulated": false, … }`;

export function PtTesting({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="testing">
              <h1 style={H1_STYLE}>Testar no Sandbox</h1>
              <PageLede>O Sandbox é self-service: configura-se, ganha pagadores de teste e repõe-se sem pedir nada ao Banzami. Para cada cenário: como provocá-lo, a resposta esperada, o evento, onde confirmar na Consola e como limpar.</PageLede>
              <Callout>O Sandbox não tem montantes, cartões nem referências especiais que provoquem resultados. Cada cenário usa o comportamento real da API; só os resultados de uma rede externa são simulados, e só quando o pedido o diz com <Code>simulate</Code>.</Callout>
              <P style={{ fontSize: 13, color: MUT }}>{RECIPES_NOTE}</P>

              <H2 id="sandbox-self-service">O que o Sandbox lhe dá</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}>Capacidade</th><th style={TH}>Onde</th><th style={TH}>Limites</th></tr></thead>
                  <tbody>
                    {[
                      ['Negócio de teste para o projeto', 'Consola → Configuração financeira: escolha o tipo de uso', 'Um por projeto. Não é verificado e não existe fora do Sandbox.'],
                      ['Pagadores de teste com valor fictício', 'Consola → Dados de teste, ou /v1/sandbox/test-payers', 'Até 10 ativos por projeto; até 10 000 Kz iniciais; carregamentos até 25 000 Kz, saldo até 50 000 Kz, 20 carregamentos e 100 000 Kz por dia.'],
                      ['Resultados de rede externa', 'simulate num pagamento de um pagador de teste', 'DECLINED, PROVIDER_UNAVAILABLE e TIMEOUT. A resposta traz simulated: true.'],
                      ['API Explorer', 'Consola → API Explorer', 'Pedidos com uma chave de 60 segundos, só no Sandbox; 30 por minuto por projeto.'],
                      ['Evento de webhook de teste', 'Consola → Webhooks, ou POST /v1/webhooks/endpoints/{id}/test', 'webhook.test, marcado synthetic; não move nada.'],
                      ['Repor os dados de teste', 'Consola → Dados de teste → Repor a Sandbox', 'Até 5 vezes por dia. Nada é apagado.'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>A lista completa, legível por máquina, está em <Code>GET /v1/sandbox/scenarios</Code> (scope <Code>sandbox:read</Code>): cada cenário tem um id, como provocá-lo e o resultado. Os ids aparecem em cada receita abaixo.</P>

              <H2 id="pagadores-teste">Pagadores de teste</H2>
              <P>
                Um pagador de teste é um cliente Sandbox do seu projeto, com carteira e saldo fictício. Paga as suas sessões e links pelo mesmo caminho que um cliente real — a sessão fica <Code>PAID</Code>, o evento é emitido e o comprovativo é emitido.
                Um pagador do projeto A não existe para o projeto B, e só paga sessões e links do próprio projeto.
              </P>
              <P>
                Na Consola, abra <strong>Dados de teste</strong>: crie um pagador, carregue-o e pague uma sessão pelo seu <Code>session_id</Code>. Pela API, com uma chave com <Code>sandbox:write</Code>:
                <Code>POST /v1/sandbox/test-payers</Code>, <Code>POST /v1/sandbox/test-payers/{'{id}'}/fund</Code> (com <Code>Idempotency-Key</Code>) e <Code>POST /v1/sandbox/test-payers/{'{id}'}/payments</Code>.
                Um pagador de teste age só pela API do seu projeto: não entra em nenhuma app, e o que o seu negócio de teste recebe liquida só para pagadores de teste e negócios de teste — o valor de teste nunca chega a uma conta real. <a href="/docs/reference#resource-sandbox" style={a}>Referência dos dados de teste</a>
              </P>
              <CodeBlock label="TypeScript · pagador de teste" raw={SAMPLE_TEST_PAYER} onCopy={copy} />
              <CodeBlock label="curl · pagar uma sessão como pagador de teste" raw={SAMPLE_CURL_TEST_PAYER_PAY} onCopy={copy} />

              <H2 id="rail-externo">Rail externo em baixo</H2>
              <P>
                O Banzami é desacoplado dos rails externos: o valor que já está na rede move-se pelo Core e pelo ledger sem precisar de nenhum.
                Para o ver, coloque o rail externo simulado do seu projeto em <Code>UNAVAILABLE</Code>. Um pagamento a partir da carteira de um pagador de teste
                continua a concluir-se, com <Code>rail: &quot;WALLET&quot;</Code>; um pagamento com <Code>simulate</Code>, que representa um pagamento que atravessa um rail externo,
                e um pagamento iniciado na página alojada de uma sessão ou link criado por este projeto respondem <Code>503 PROVIDER_UNAVAILABLE</Code> e nada é criado, creditado ou confirmado.
                O estado é só deste projeto: outro projeto ligado ao mesmo negócio não é afetado. Na Consola, em <strong>Dados de teste</strong>, ou pela API: <a href="/docs/concepts#como-o-dinheiro-se-move" style={a}>Como o dinheiro se move</a>
              </P>
              <CodeBlock label="curl · colocar o rail externo em baixo" raw={SAMPLE_CURL_EXTERNAL_RAIL} onCopy={copy} />

              <H2 id="receitas-base">Chaves e prontidão</H2>
              <RecipeCard lang="pt" r={{ id: 'primeira-chamada', title: 'A chave funciona',
                trigger: <><Code>GET /v1/me</Code> com a chave.</>,
                api: <><Code>200</Code> com <Code>environment: &quot;SANDBOX&quot;</Code> e os scopes.</>,
                event: 'Nenhum.', console: 'Registos: o pedido, com request_id.', cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'chave-invalida', title: 'Chave inválida ou revogada', scenario: 'INVALID_KEY',
                trigger: 'Revogue uma chave de teste na Consola e use-a.',
                api: <><Code>401 UNAUTHORIZED</Code>.</>,
                event: 'Nenhum.', console: 'Chaves de API: a chave como revogada.', cleanup: 'Nenhuma; a chave revogada fica no histórico.' }} />
              <RecipeCard lang="pt" r={{ id: 'scope-em-falta', title: 'Scope em falta', scenario: 'MISSING_SCOPE',
                trigger: <>Crie uma chave só com <Code>identity:read</Code> e tente criar uma sessão.</>,
                api: <><Code>403 INSUFFICIENT_SCOPE</Code>.</>,
                event: 'Nenhum.', console: 'Registos: o pedido recusado.', cleanup: 'Revogue a chave de teste.' }} />
              <RecipeCard lang="pt" r={{ id: 'sem-configuracao', title: 'Projeto sem configuração financeira', scenario: 'FINANCIAL_SETUP_NOT_READY',
                trigger: 'Num projeto novo, crie uma sessão de pagamento antes de configurar a Sandbox.',
                api: <><Code>403 PAYMENTS_UNAVAILABLE</Code>; <Code>getFinancialSetup()</Code> devolve <Code>UNCONFIGURED</Code>.</>,
                event: 'Nenhum.', console: 'Configuração financeira: por configurar.', cleanup: 'Configure a Sandbox, ou elimine o projeto se não tiver outro histórico.' }} />
              <RecipeCard lang="pt" r={{ id: 'live-recusado', title: 'Uma chave Live no Sandbox', scenario: 'LIVE_FAIL_CLOSED',
                trigger: <>Chame <Code>GET /v1/me</Code> com uma chave que comece por <Code>bz_live_</Code>.</>,
                api: <><Code>401 UNAUTHORIZED</Code>. O Live não está disponível e nenhuma chave Live é emitida.</>,
                event: 'Nenhum.', console: 'Nada: o pedido é recusado antes de chegar ao projeto.', cleanup: 'Nenhuma.' }} />

              <H2 id="receitas-pagamentos">Pagamentos</H2>
              <RecipeCard lang="pt" r={{ id: 'criar-sessao', title: 'Criar uma sessão',
                trigger: <><Code>createPaymentSession</Code> com <Code>amountMinor: 25000</Code> (250 Kz).</>,
                api: <><Code>201</Code>, <Code>status: &quot;ACTIVE&quot;</Code>, interfaces <Code>PAYMENT_LINK</Code> e <Code>DYNAMIC_QR</Code>, e <Code>realtime.token</Code>.</>,
                event: <><Code>payment_session.created</Code>.</>,
                console: 'Webhooks → Eventos: o evento.',
                cleanup: 'Não é necessária: uma sessão por pagar não tem efeito financeiro.' }} />
              <RecipeCard lang="pt" r={{ id: 'pagar-sessao', title: 'Pagar uma sessão', scenario: 'PAYMENT_SUCCESS',
                trigger: <>Crie um pagador de teste e pague a sessão com <Code>POST /v1/sandbox/test-payers/{'{id}'}/payments</Code>, <Code>payment_session_id</Code> e <Code>via</Code> <Code>LINK</Code> ou <Code>QR</Code> — ou, na Consola, em Dados de teste.</>,
                api: <><Code>200</Code> com <Code>transfer_id</Code> e <Code>proof_reference</Code>; <Code>getPaymentSession</Code> devolve <Code>status: &quot;PAID&quot;</Code> e <Code>refund_source</Code>.</>,
                event: <><Code>payment_session.paid</Code> e <Code>payment_link.paid</Code>.</>,
                console: 'Transações: o pagamento; Saldos: a conta com o valor.',
                cleanup: 'Reembolse o pagamento, ou reponha a Sandbox.' }} />
              <RecipeCard lang="pt" r={{ id: 'saldo-insuficiente', title: 'Saldo insuficiente', scenario: 'INSUFFICIENT_FUNDS',
                trigger: <>Crie o pagador com <Code>initial_balance_minor: 0</Code> e pague uma sessão.</>,
                api: <><Code>422 INSUFFICIENT_FUNDS</Code>; a sessão continua <Code>ACTIVE</Code>.</>,
                event: 'Nenhum.', console: 'Registos: o pedido recusado.', cleanup: 'Carregue o pagador, ou retire-o.' }} />
              <RecipeCard lang="pt" r={{ id: 'recusa-simulada', title: 'Recusa da rede externa', scenario: 'PAYMENT_DECLINED',
                trigger: <>Pague como pagador de teste com <Code>simulate: &quot;DECLINED&quot;</Code>.</>,
                api: <><Code>402 PAYMENT_DECLINED</Code> com <Code>simulated: true</Code>. Nada se move.</>,
                event: 'Nenhum.', console: 'Registos: o pedido, com a resposta 402.', cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'fornecedor-indisponivel', title: 'Fornecedor indisponível', scenario: 'PROVIDER_UNAVAILABLE',
                trigger: <>Pague como pagador de teste com <Code>simulate: &quot;PROVIDER_UNAVAILABLE&quot;</Code>.</>,
                api: <><Code>503 PROVIDER_UNAVAILABLE</Code> com <Code>Retry-After</Code> e <Code>simulated: true</Code>. Nada se move.</>,
                event: 'Nenhum.', console: 'Registos: o pedido, com a resposta 503.', cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'rail-em-baixo-carteira', title: 'Pagar com o rail externo em baixo', scenario: 'EXTERNAL_RAIL_DOWN_WALLET_PAYMENT',
                trigger: <><Code>PUT /v1/sandbox/external-rail</Code> com <Code>state: &quot;UNAVAILABLE&quot;</Code>; depois pague uma sessão como pagador de teste, a partir da carteira.</>,
                api: <><Code>200</Code> com <Code>status: &quot;PAID&quot;</Code> e <Code>rail: &quot;WALLET&quot;</Code>: o valor move-se dentro do Banzami, sem rail externo.</>,
                event: <><Code>payment_session.paid</Code>.</>,
                console: 'Transações: o pagamento; Dados de teste: o rail externo em baixo.', cleanup: <>Reponha o rail com <Code>state: &quot;AVAILABLE&quot;</Code>.</> }} />
              <RecipeCard lang="pt" r={{ id: 'rail-em-baixo-fecha', title: 'Operação que atravessa o rail, com o rail em baixo', scenario: 'EXTERNAL_RAIL_DOWN_FAILS_CLOSED',
                trigger: <>Com o rail externo <Code>UNAVAILABLE</Code>, pague com <Code>simulate: &quot;DECLINED&quot;</Code> ou inicie o pagamento pelo rail externo na página alojada.</>,
                api: <><Code>503 PROVIDER_UNAVAILABLE</Code> com <Code>Retry-After</Code>. Nada é criado, creditado ou confirmado.</>,
                event: 'Nenhum.', console: 'Registos: o pedido, com a resposta 503.', cleanup: <>Reponha o rail com <Code>state: &quot;AVAILABLE&quot;</Code>.</> }} />
              <RecipeCard lang="pt" r={{ id: 'sem-resposta', title: 'Sem resposta a tempo', scenario: 'AMBIGUOUS_TIMEOUT',
                trigger: <>Pague como pagador de teste com <Code>simulate: &quot;TIMEOUT&quot;</Code> e uma <Code>Idempotency-Key</Code>; depois repita o pedido com a mesma chave.</>,
                api: <>Primeiro <Code>503 SANDBOX_SIMULATED_TIMEOUT</Code> — mas o pagamento foi feito. A repetição responde <Code>200</Code> com o resultado real e não paga de novo.</>,
                event: <><Code>payment_session.paid</Code>, uma vez.</>,
                console: 'Transações: um único pagamento.', cleanup: 'Reembolse o pagamento, ou reponha a Sandbox.',
                limits: 'É o caso a tratar em produção: um timeout não diz se o pagamento aconteceu. Repita com a mesma chave; nunca crie um pagamento novo.' }} />
              <RecipeCard lang="pt" r={{ id: 'conclui-depois', title: 'Um pagamento que se conclui depois', scenario: 'DELAYED_COMPLETION',
                trigger: <>Pague como pagador de teste com <Code>simulate: &quot;DELAYED&quot;</Code> e uma <Code>Idempotency-Key</Code>.</>,
                api: <><Code>202</Code> com <Code>status: &quot;PENDING&quot;</Code> e <Code>simulated: true</Code>. Cerca de 10 segundos depois o pagamento conclui-se sozinho: a sessão fica <Code>PAID</Code>, e o mesmo pedido com a mesma chave responde <Code>200</Code> com o resultado.</>,
                event: <><Code>payment_session.paid</Code>, quando se conclui — o stream em tempo real passa a <Code>PAID</Code> no mesmo momento.</>,
                console: 'Transações: o pagamento aparece quando se conclui.', cleanup: 'Reembolse o pagamento, ou reponha a Sandbox.',
                limits: 'Mostre um estado pendente e aja no webhook ou no stream — não no 202.' }} />
              <RecipeCard lang="pt" r={{ id: 'testar-idempotencia', title: 'Repetir um pedido com segurança', scenario: 'IDEMPOTENT_REPLAY IDEMPOTENCY_PAYLOAD_CONFLICT CONCURRENT_DUPLICATE',
                trigger: <>Envie o mesmo POST duas vezes com a mesma <Code>Idempotency-Key</Code>; depois, a mesma chave com outro corpo.</>,
                api: <>A segunda resposta é igual à primeira. Com outro corpo: <Code>409 IDEMPOTENCY_KEY_REUSED</Code>. Dois pedidos simultâneos: <Code>409 IDEMPOTENCY_CONFLICT</Code>.</>,
                event: 'Um único evento, para o primeiro pedido.',
                console: 'Registos: os pedidos com a mesma chave.',
                cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'montante-invalido', title: 'Montante inválido', scenario: 'INVALID_PARAMETER',
                trigger: <><Code>amount_minor: 0</Code>. (Omitir o montante não é um erro: cria uma sessão de montante aberto.)</>,
                api: <><Code>400 BAD_REQUEST</Code>.</>,
                event: 'Nenhum.', console: 'Registos: o pedido recusado.', cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'cursor-invalido', title: 'Cursor de paginação inválido', scenario: 'INVALID_CURSOR',
                trigger: <><Code>GET /v1/payment-links?cursor=abc</Code>, ou <Code>limit=500</Code>. O cursor válido é o <Code>next_cursor</Code> da página anterior, sem alterações.</>,
                api: <><Code>400 INVALID_PARAM</Code>, com a mensagem a indicar o parâmetro.</>,
                event: 'Nenhum.', console: 'Registos: o pedido recusado.', cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'estado-tempo-real', title: 'Estado em tempo real', scenario: 'REALTIME_STATUS',
                trigger: <>Abra o stream de estado com o <Code>realtime.token</Code> da sessão e pague-a com um pagador de teste.</>,
                api: <>Um <Code>snapshot</Code> com <Code>ACTIVE</Code>, depois um <Code>status</Code> com <Code>PAID</Code>, e o stream fecha.</>,
                event: <><Code>payment_session.paid</Code>, no seu webhook — a confirmação a usar para entregar a encomenda.</>,
                console: 'API Explorer: leia a sessão e escolha “Ver o estado em tempo real”.', cleanup: 'Nenhuma.',
                limits: <>O token dura até 30 minutos; leia a sessão de novo para outro. <a href="/docs/payments#tempo-real" style={a}>Estado em tempo real</a></> }} />

              <H2 id="testar-webhook">Webhooks</H2>
              <RecipeCard lang="pt" r={{ id: 'webhook-teste', title: 'Evento de teste', scenario: 'WEBHOOK_SUCCESS',
                trigger: <>Na Consola, em Webhooks, escolha <strong>Enviar evento de teste</strong> — ou <Code>POST /v1/webhooks/endpoints/{'{id}'}/test</Code>.</>,
                api: <><Code>202</Code> com <Code>type: &quot;webhook.test&quot;</Code> e <Code>synthetic: true</Code>.</>,
                event: <><Code>webhook.test</Code>, assinado como os outros, só neste endpoint. Não descreve nenhum pagamento.</>,
                console: 'Webhooks → Eventos: o evento, marcado como teste, com a entrega.',
                cleanup: 'Nenhuma. A entrega pode ser reenviada mesmo depois de ter sucesso.' }} />
              <RecipeCard lang="pt" r={{ id: 'webhook-entrega', title: 'Receber uma entrega',
                trigger: <>Registe um endpoint HTTPS público para <Code>payment_session.created</Code> e crie uma sessão. Não precisa de pagador.</>,
                api: <><Code>createWebhookEndpoint</Code> responde <Code>201</Code> com <Code>secret</Code>.</>,
                event: <><Code>payment_session.created</Code>, assinado, no seu endpoint.</>,
                console: 'Webhooks: a entrega com a resposta 2xx.',
                cleanup: <><Code>deactivateWebhookEndpoint</Code>.</> }} />
              <RecipeCard lang="pt" r={{ id: 'webhook-falha', title: 'Falha e reentrega', scenario: 'WEBHOOK_RETRY WEBHOOK_REPLAY',
                trigger: <>Faça o endpoint responder <Code>500</Code> e crie uma sessão. Corrija o endpoint e reenvie.</>,
                api: <><Code>listWebhookDeliveries</Code> mostra as tentativas; <Code>replayWebhookDelivery</Code> põe a entrega em <Code>PENDING</Code>. Reenviar uma entrega com sucesso responde <Code>409 DELIVERY_ALREADY_SUCCEEDED</Code>, exceto a de um evento de teste.</>,
                event: 'O mesmo evento, com o mesmo id, novamente.',
                console: 'Webhooks: cada tentativa, com o código devolvido.',
                cleanup: <><Code>deactivateWebhookEndpoint</Code>.</>,
                limits: 'As tentativas automáticas seguem o calendário real: a segunda ocorre um minuto após a primeira falha.' }} />
              <RecipeCard lang="pt" r={{ id: 'webhook-assinatura', title: 'Assinatura inválida', scenario: 'WEBHOOK_SIGNATURE_INVALID',
                trigger: <>Envie ao seu próprio endpoint um POST com um <Code>banza-signature</Code> inventado.</>,
                api: <><Code>constructEvent</Code> lança; o endpoint responde <Code>400</Code> sem efeitos.</>,
                event: 'Nenhum — o pedido não veio do Banzami.', console: 'Nada: o teste é local.', cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'webhook-desativado', title: 'Endpoint desativado',
                trigger: 'Desative o endpoint e crie uma sessão.',
                api: <>O evento aparece em <Code>listWebhookEvents</Code>, sem entrega para esse endpoint. Um evento de teste responde <Code>409 ENDPOINT_DISABLED</Code>.</>,
                event: 'Não entregue, nem depois de reativar.',
                console: 'Webhooks → Eventos: o evento sem entrega.',
                cleanup: 'Reative o endpoint na Consola, se o quiser manter.' }} />

              <H2 id="testar-reembolso">Reembolsos, transferências e liquidações</H2>
              <RecipeCard lang="pt" r={{ id: 'reembolso-parcial', title: 'Reembolso total, parcial e excessivo', scenario: 'REFUND_FULL REFUND_PARTIAL REFUND_CUMULATIVE_LIMIT',
                trigger: <>Depois de <a href="#pagar-sessao" style={a}>pagar uma sessão</a>, reembolse parte, depois o resto, depois mais um.</>,
                api: <><Code>201</Code> com <Code>SUCCEEDED</Code> duas vezes; o terceiro responde <Code>422 REFUND_EXCEEDS_CAPTURED</Code>.</>,
                event: <><Code>refund.completed</Code> por cada reembolso feito.</>,
                console: 'Transações → Reembolsos.', cleanup: 'Nenhuma: o pagamento fica totalmente reembolsado.' }} />
              <RecipeCard lang="pt" r={{ id: 'reembolso-nao-elegivel', title: 'Reembolso de algo que não é seu', scenario: 'REFUND_NOT_ELIGIBLE',
                trigger: <>Reembolse com o <Code>refund_source</Code> de outro projeto, ou de uma sessão por pagar.</>,
                api: <><Code>404 NOT_FOUND</Code> ou <Code>422</Code>; nada se move.</>,
                event: 'Nenhum.', console: 'Registos: o pedido recusado.', cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'transferencia-sem-saldo', title: 'Transferência sem saldo',
                trigger: <>Crie duas contas e transfira da conta vazia.</>,
                api: <><Code>422 INSUFFICIENT_FUNDS</Code>; nada se move.</>,
                event: 'Nenhum.', console: 'Saldos: as duas contas, a zero.', cleanup: 'Nenhuma.' }} />
              <RecipeCard lang="pt" r={{ id: 'liquidacao-teste', title: 'Liquidação', scenario: 'SETTLEMENT_SUCCESS SETTLEMENT_REPLAY',
                trigger: <>Num projeto configurado para <strong>Aplicação ou plataforma</strong>, liquide uma conta sem saldo; depois, uma conta com saldo de um pagamento de teste; depois repita com o mesmo <Code>idempotency_key</Code>.</>,
                api: <>Sem saldo: <Code>422 NOTHING_TO_SETTLE</Code>. Com saldo: <Code>201</Code> com bruto, taxa e líquido. A repetição devolve a mesma liquidação.</>,
                event: <><Code>application_settlement.completed</Code>, uma vez.</>,
                console: 'Saldos: a conta a zero; Configuração financeira: a prontidão.',
                cleanup: 'Nenhuma.',
                limits: <>Os eventos <Code>application_settlement.cancelled</Code> e <Code>.failed</Code> resultam de decisões do Banzami e não podem ser provocados para teste.</> }} />

              <H2 id="testar-outros">Comprovativos e limites</H2>
              <RecipeCard lang="pt" r={{ id: 'comprovativo-teste', title: 'Verificar um comprovativo', scenario: 'RECEIPT_VALID RECEIPT_NOT_FOUND',
                trigger: <>Verifique a referência <Code>BZM-…</Code> de um pagamento de teste; depois, a mesma referência com um carácter alterado.</>,
                api: <><Code>200</Code> com <Code>CONFIRMED</Code>; alterada: <Code>404</Code>.</>,
                event: 'Nenhum.', console: 'Transações: o pagamento correspondente.', cleanup: 'Nenhuma.',
                limits: <>A resposta <Code>503</Code> não pode ser provocada.</> }} />
              <RecipeCard lang="pt" r={{ id: 'limite-pedidos', title: 'Limite de pedidos', scenario: 'RATE_LIMIT',
                trigger: <>Teste o tratamento de <Code>429</Code> e <Code>Retry-After</Code> com uma resposta simulada no seu código.</>,
                api: <><Code>429 RATE_LIMITED</Code> com <Code>Retry-After</Code>.</>,
                event: 'Nenhum.', console: 'Registos.', cleanup: 'Nenhuma.',
                limits: 'Não provoque o limite contra o Sandbox: é partilhado com outras integrações.' }} />

              <H2 id="explorer">API Explorer</H2>
              <P>
                Na Consola, <strong>API Explorer</strong> executa as operações publicadas da API v1 contra o Sandbox, com o projeto ativo. Nenhuma chave passa pelo browser: para cada pedido, o Banzami cria no servidor uma chave válida durante 60 segundos, só com o scope dessa operação, faz o pedido e revoga-a.
                A resposta mostra o estado, o <Code>request_id</Code>, a latência e o corpo; um segredo de assinatura é escondido. Os pedidos aparecem em <strong>Registos</strong> com a origem <strong>API Explorer</strong>.
              </P>
              <P>Operações de escrita levam uma <Code>Idempotency-Key</Code> que a Consola gera e mostra: repetir com a mesma chave devolve a resposta original. Ao ler uma sessão, pode abrir o estado em tempo real e pagá-la em Dados de teste para o ver mudar.</P>

              <H2 id="repor">Repor a Sandbox</H2>
              <P>
                Em <strong>Dados de teste → Repor a Sandbox</strong> (Owner ou Admin, escrevendo <Code>RESET</Code>): os pagadores de teste do projeto são retirados e, no negócio de teste do próprio projeto, as sessões e links em aberto são cancelados, o saldo fictício é retirado e as contas extra são encerradas.
                Nada é apagado: pagamentos, reembolsos, comprovativos, eventos, registos e o ledger ficam. Chaves, webhooks e a configuração financeira mantêm-se. Um projeto ligado ao negócio de outro repõe só os seus pagadores. Até 5 vezes por dia.
              </P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/going-live', title: 'Preparar para Live', desc: 'A lista de verificação da sua integração.' },
                { href: '/docs/troubleshooting', title: 'Resolução de problemas', desc: 'Quando um cenário não dá o resultado esperado.' },
              ]} />
            </Section>
    </>
  );
}

export function PtGoingLive({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="going-live">
              <h1 style={H1_STYLE}>Do Sandbox ao Live</h1>
              <PageLede>Financial Live não está disponível. O que o trabalho no Sandbox já garante e o que verificar antes de a integração entrar em uso.</PageLede>

              <H2 id="estado-live">Estado atual</H2>
              <P>
                Uma plataforma de developers, dois ambientes financeiros. O <strong>Sandbox</strong> está disponível e é self-service: valor fictício, chaves <Code>bz_test_</Code>, nenhuma aprovação do Banzami.
                O <strong>Live</strong> é a mesma plataforma e os mesmos contratos, com valor real, e requer aprovação institucional: não está pronto e recusa tudo (fail-closed). Uma chave do Sandbox não abre o Live, e nenhuma chave Live pode ser criada no Sandbox.
              </P>
              <UL>
                <LI>Não há trilhos de dinheiro real ativos e as chaves <Code>bz_live_</Code> não são emitidas.</LI>
                <LI>Não existe candidatura nem lista de espera para Live.</LI>
                <LI>Não há migração automática do Sandbox para Live.</LI>
              </UL>

              <H2 id="o-que-se-mantem">O que o trabalho no Sandbox já garante</H2>
              <P>A integração, o tratamento de webhooks, a idempotência, o tratamento de erros e a reconciliação seguem os contratos da API v1, que são os mesmos documentados aqui.</P>

              <H2 id="lista-verificacao">Lista de verificação</H2>
              <UL>
                <LI><strong>Identidade:</strong> <Code>GET /v1/me</Code> responde com a chave que a aplicação usa.</LI>
                <LI><strong>Prontidão:</strong> a aplicação consulta <Code>getFinancialSetup()</Code> e sabe o que mostrar quando o projeto não pode receber.</LI>
                <LI><strong>Pagamentos:</strong> criação, apresentação do link ou QR e confirmação no servidor testadas.</LI>
                <LI><strong>Idempotência:</strong> uma repetição com a mesma chave testada; pedidos simultâneos compreendidos.</LI>
                <LI><strong>Erros:</strong> um <Code>400</Code> e um <Code>401</Code> testados, com o <Code>request_id</Code> nos seus logs.</LI>
                <LI><strong>Webhooks:</strong> assinatura verificada antes da interpretação, duplicados ignorados, falha e reentrega testadas.</LI>
                <LI><strong>Segredos:</strong> chave e segredo do webhook apenas no servidor, com rotação testada.</LI>
                <LI><strong>Reconciliação:</strong> os seus registos coincidem com Transações e Saldos na Consola.</LI>
              </UL>

              <H2 id="acompanhar">Acompanhar alterações</H2>
              <P>As alterações ao contrato da API e ao Sandbox são publicadas no <a href="/docs/changelog" style={a}>changelog</a>, com o impacto e a ação necessária.</P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/testing', title: 'Testar no Sandbox', desc: 'Um cenário de teste por item da lista.' },
                { href: '/docs/trust', title: 'Segurança', desc: 'Chaves e segredos em produção do seu lado.' },
              ]} />
            </Section>
    </>
  );
}

export function PtTrust({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="trust">
              <h1 style={H1_STYLE}>Segurança</h1>
              <PageLede>Onde guardar chaves e segredos, como limitar permissões e como rodar credenciais.</PageLede>

              <H2 id="chaves">Guardar a chave secreta</H2>
              <P>Uma chave <Code>bz_test_sk_…</Code> autoriza tudo o que o projeto pode fazer, incluindo reembolsos e liquidações. Guarde-a numa variável de ambiente do servidor, fornecida pelo gestor de segredos da sua plataforma.</P>
              <DoDont lang="pt"
                dos={[
                  'Guardar a chave numa variável de ambiente do servidor.',
                  'Criar uma chave por sistema, com os scopes mínimos.',
                  'Rodar a chave quando alguém com acesso sai da equipa.',
                  'Registar o request_id, nunca a chave.',
                ]}
                donts={[
                  <>Colocar a chave no browser, em <Code>localStorage</Code> ou numa variável <Code>NEXT_PUBLIC_*</Code>.</>,
                  'Incluí-la numa aplicação móvel.',
                  'Guardá-la no repositório ou num .env versionado.',
                  'Enviá-la por email, chat, ticket ou captura de ecrã.',
                ]} />

              <H2 id="reveal-once">Revelada uma única vez</H2>
              <P>O valor completo da chave aparece uma vez, no diálogo de criação. Depois, a Consola mostra apenas o prefixo e uma máscara. Se perder a chave, revogue-a e crie outra.</P>

              <H2 id="menor-privilegio">Limitar os scopes</H2>
              <P>Os scopes definem-se na criação e não mudam. Uma chave de leitura nunca pode escrever, mesmo que o código que a usa tenha um erro.</P>
              <UL>
                <LI>Uma chave por sistema que integra.</LI>
                <LI>Sem <Code>:write</Code> quando o sistema só consulta.</LI>
                <LI>Uma chave comprometida revoga-se sem afetar os outros sistemas.</LI>
              </UL>

              <H2 id="rotacao">Rodar e revogar chaves</H2>
              <PathDiagram title="Rodar uma chave sem interrupção" desc="Criar uma chave nova com os mesmos scopes, colocá-la em uso no servidor, confirmar com GET /v1/me e só depois revogar a chave anterior." steps={['Criar chave nova', 'Colocar em uso', 'Confirmar /v1/me', 'Revogar a anterior']} highlight={3} />
              <UL>
                <LI><strong>Rodar na Consola</strong> cria a sucessora e revoga a anterior no mesmo passo; para evitar falhas, siga a sequência acima.</LI>
                <LI><strong>Revogar</strong> é imediato: a chave passa a responder <Code>401</Code>.</LI>
                <LI><strong>Suspeita de exposição:</strong> revogue de imediato, depois investigue.</LI>
              </UL>

              <H2 id="segredo-webhook">O segredo do webhook</H2>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={TABLE}>
                  <thead><tr style={THEAD}><th style={TH}></th><th style={TH}>Chave secreta</th><th style={TH}>Segredo do webhook</th></tr></thead>
                  <tbody>
                    {[
                      ['Serve para', 'Autenticar a sua aplicação perante a API', 'Verificar que uma entrega vem do Banzami'],
                      ['Onde é usado', 'Pedidos da aplicação ao Banzami', 'Endpoint de webhook da aplicação'],
                      ['Revelado', 'Uma vez, na criação', 'Uma vez, no registo e em cada rotação'],
                      ['Rotação', 'Chave nova, depois revogar a anterior', 'rotateWebhookEndpointSecret; troca imediata'],
                    ].map((r) => (
                      <tr key={r[0]}>{r.map((c, i) => <td key={i} style={i === 0 ? TD_HEAD : TD}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>Verifique a assinatura sobre o corpo em bruto, antes de interpretar o evento, com o verificador do SDK. <a href="/docs/webhooks#receita" style={a}>Configurar webhooks</a></P>

              <H2 id="sandbox-garante">O que o Sandbox garante</H2>
              <UL>
                <LI>Os fluxos de pagamento, reembolso, liquidação e webhook seguem as mesmas regras que em produção, com dinheiro fictício.</LI>
                <LI>A entrega de webhooks é real, sobre a internet pública.</LI>
                <LI>A chave de projeto só alcança os endpoints do documento OpenAPI; as rotas de outros tipos de credencial respondem <Code>401</Code> ou <Code>403</Code>.</LI>
                <LI>Trate os dados de teste como dados de clientes: não use dados pessoais de pessoas reais.</LI>
              </UL>

              <H2 id="vulnerabilidades">Reportar uma vulnerabilidade</H2>
              <P>Escreva para <MailLink to="security@banzami.com" style={a} />. Para outras questões, use o <a href="/docs/support" style={a}>suporte</a>.</P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/webhooks', title: 'Configurar webhooks', desc: 'Verificação e rotação do segredo.' },
                { href: '/docs/support', title: 'Suporte', desc: 'O que enviar sem expor segredos.' },
              ]} />
            </Section>
    </>
  );
}

export function PtTroubleshooting({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="troubleshooting">
              <h1 style={H1_STYLE}>Resolução de problemas</h1>
              <PageLede>Comece pelo que está a observar. Cada sintoma indica as causas prováveis, o que verificar, onde ver na Consola e se deve repetir o pedido.</PageLede>
              <Troubleshooting lang="pt" />
              <NextStepCards lang="pt" items={[
                { href: '/docs/errors', title: 'Catálogo de erros', desc: 'Todos os códigos, pesquisáveis.' },
                { href: '/docs/support', title: 'Suporte', desc: 'Quando o sintoma não está aqui.' },
              ]} />
            </Section>
    </>
  );
}

export function PtSupport({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="suporte">
              <h1 style={H1_STYLE}>Suporte</h1>
              <PageLede>Escreva para <MailLink to="developers@banzami.com" style={a} /> a partir do email da sua conta. A mensagem é lida e respondida por uma pessoa; não há sistema de tickets.</PageLede>

              <H2 id="antes">Antes de escrever</H2>
              <UL>
                <LI><a href="/docs/troubleshooting" style={a}>Resolução de problemas</a>, a partir do sintoma.</LI>
                <LI><a href="/docs/errors" style={a}>Catálogo de erros</a>, a partir do código.</LI>
                <LI><strong>Consola → Registos</strong>, a partir do <Code>request_id</Code>.</LI>
              </UL>

              <H2 id="incluir">O que incluir</H2>
              <UL>
                <LI>O <Code>request_id</Code> da resposta.</LI>
                <LI>A data e a hora, com fuso horário.</LI>
                <LI>O ambiente (<Code>SANDBOX</Code>), o Project ID e a operação.</LI>
                <LI>A versão do SDK, se aplicável.</LI>
                <LI>O corpo do pedido sem credenciais, se for relevante.</LI>
              </UL>

              <H2 id="nunca">O que nunca enviar</H2>
              <Callout tone="warn">Nunca envie chaves de API, segredos de webhook, códigos OTP ou tokens de sessão, a ninguém. O suporte não precisa de segredos.</Callout>

              <H2 id="seguranca-suporte">Vulnerabilidades</H2>
              <P>Reporte vulnerabilidades para <MailLink to="security@banzami.com" style={a} />.</P>

              <NextStepCards lang="pt" items={[
                { href: '/docs/troubleshooting', title: 'Resolução de problemas', desc: 'Por sintoma.' },
                { href: '/docs/trust', title: 'Segurança', desc: 'Chaves, segredos e rotação.' },
              ]} />
            </Section>
    </>
  );
}

export function PtChangelog({ copy }: { copy: CopyFn }) {
  const a = { color: LINK, fontWeight: 600, textDecoration: 'none' } as const;
  return (
    <>
<Section id="changelog">
              <h1 style={H1_STYLE}>Changelog</h1>
              <PageLede>Alterações ao contrato da API, ao SDK, ao Sandbox e à documentação, com o impacto para a sua integração e a ação necessária.</PageLede>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ ...TABLE, minWidth: 680 }}>
                  <thead><tr style={THEAD}><th style={TH}>Data</th><th style={TH}>Área</th><th style={TH}>Alteração</th><th style={TH}>Impacto</th><th style={TH}>Ação</th></tr></thead>
                  <tbody>
                    {([
                      ['14 Set 2026', 'SDK', '@banzami/sdk 0.14.1: simulate DELAYED tipado (TestPaymentPending) e README alinhado com a documentação.', 'Um pagamento que se conclui depois testa-se pelo SDK sem conversões de tipo.', 'Atualizar para 0.14.1; nenhuma chamada existente muda.'],
                      ['14 Set 2026', 'SDK', '@banzami/sdk 0.14.0: links sem merchantId, pagadores de teste, sendWebhookTestEvent e @banzami/sdk/realtime.', 'O Sandbox self-service usa-se pelo SDK.', 'Atualizar para 0.14.0; nenhuma chamada existente muda.'],
                      ['14 Set 2026', 'Sandbox', 'Sandbox self-service: negócio de teste pelo tipo de uso, pagadores de teste, simulações explícitas, API Explorer, evento de webhook de teste e reposição.', 'Um projeto novo recebe no Sandbox sem candidatura nem revisão.', 'Nenhuma; os projetos já configurados continuam como estão.'],
                      ['14 Set 2026', 'API', 'Estado em tempo real: GET /v1/realtime/payment-sessions/{id}, com o realtime.token de cada sessão no cabeçalho Authorization.', 'Uma página pode mostrar o pagamento no instante em que acontece.', 'Nenhuma; o webhook continua a ser a confirmação.'],
                      ['13 Set 2026', 'Docs', 'Referência de sessões corrigida: wallet_account_id é aceite com uma chave de projeto, para escolher uma conta sua.', 'Pode segregar pagamentos por conta.', 'Nenhuma.'],
                      ['13 Set 2026', 'Docs', 'Resposta de reembolso corrigida: status SUCCEEDED.', 'Código que compare com COMPLETED não reconhece o reembolso.', 'Comparar com SUCCEEDED.'],
                      ['13 Set 2026', 'SDK', 'createPaymentLink e listPaymentLinks deixam de exigir merchantId (@banzami/sdk 0.14.0).', 'Em 0.13.0, uma chave de projeto não cria links pelo SDK.', 'Atualizar para 0.14.0.'],
                      ['13 Set 2026', 'Docs', 'Documentação reorganizada por tarefa, com referência de eventos, catálogo de erros pesquisável e cenários de teste.', 'Os endereços /docs/guides redirecionam para as páginas novas.', 'Atualizar marcadores, se os tiver.'],
                      ['13 Set 2026', 'API', 'GET /v1/public/proofs/{ref} publicado na referência e no OpenAPI.', 'Verificação pública de comprovativos documentada.', 'Nenhuma.'],
                      ['12 Set 2026', 'SDK', '@banzami/sdk 0.13.0; createApplicationSettlement retirado a favor de createBusinessApplicationSettlement.', 'Chamadas ao método retirado falham.', 'Migrar para createBusinessApplicationSettlement.'],
                      ['11 Set 2026', 'API', 'POST /v1/payment-links/{id}/mark-used retirado: responde 410 ROUTE_RETIRED.', 'Um link só é marcado como pago por um pagamento.', 'Usar DELETE /v1/payment-links/{id} para fechar um link.'],
                      ['10 Set 2026', 'Sandbox', 'Configuração financeira por candidatura revista ou por código de consentimento; a configuração num clique foi retirada.', 'Projetos novos precisam de concluir a configuração financeira para receber.', 'Concluir a configuração financeira.'],
                      ['11 Jul 2026', 'Docs', 'Referência por recurso, guia de testes, autenticação e envelope de webhooks.', '—', 'Nenhuma.'],
                      ['Julho 2026', 'Sandbox', 'Consola Sandbox: entrada por email e código, workspaces, projetos, chaves de teste, papéis e convites.', '—', 'Nenhuma.'],
                    ] as [string, string, string, string, string][]).map((r, i) => (
                      <tr key={i}>
                        <td style={{ ...TD_MONO, whiteSpace: 'nowrap' }}>{r[0]}</td>
                        <td style={TD_HEAD}>{r[1]}</td>
                        <td style={{ ...TD, overflowWrap: 'anywhere' }}>{r[2]}</td>
                        <td style={TD}>{r[3]}</td>
                        <td style={TD}>{r[4]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P style={{ fontSize: 13, color: MUT }}>Alterações incompatíveis são marcadas como tal e indicam sempre a ação necessária. Não há versões de produção: Financial Live não está disponível.</P>
              <NextStepCards lang="pt" items={[
                { href: '/docs/artifacts', title: 'Artefactos', desc: 'OpenAPI e manifests atualizados.' },
                { href: '/docs/sdk', title: 'SDKs', desc: 'Versões publicadas.' },
              ]} />
            </Section>
    </>
  );
}

export function PtGlossary({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="glossario-page">
<div id="conceitos" style={{ scrollMarginTop: 72 }}>
              <span id="glossario" aria-hidden="true" style={{ display: 'block', height: 0, scrollMarginTop: 72 }} />
              <h1 style={H1_STYLE}>Glossário</h1>
              <PageLede>Os termos usados nesta documentação, no contexto do Banzami.</PageLede>
              <dl style={{ margin: 0, maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {GLOSSARY.map((e) => (
                  <div key={e.id} id={`glossario-${e.id}`} style={{ scrollMarginTop: 80 }}>
                    <dt style={{ margin: 0 }}>
                      {e.code ? (
                        <code style={{ fontFamily: mono, fontSize: 13, background: '#F6F2F2', color: INK, padding: '1px 6px', borderRadius: 6, fontWeight: 600 }}>{e.term}</code>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{e.term}</span>
                      )}
                    </dt>
                    <dd style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.6, color: BODY }}>{e.def}</dd>
                  </div>
                ))}
              </dl>
              <NextStepCards lang="pt" items={[
                { href: '/docs/concepts', title: 'Como o Banzami funciona', desc: 'Os conceitos, em contexto.' },
              ]} />
            </div>
</Section>
    </>
  );
}
