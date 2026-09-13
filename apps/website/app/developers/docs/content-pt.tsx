'use client';

// PT documentation content, split by area (P3A information architecture).
// Every block below was MOVED VERBATIM from the previous single-page
// documentation — same components, same styles, same claim-safety wording.
// Cross-area anchors were remapped to their new routes; nothing was reworded
// except navigation glue. See content-map.ts for the migration map.

import type { ReactNode } from 'react';
import { GlossaryTerm } from './GlossaryTerm';
import { ConceptModelDiagram, SegregatedAccountsDiagram, DonationFlowDiagram, JourneyStripDiagram } from './diagrams';
import { CapabilityCards } from './CapabilityCards';
import { GLOSSARY } from './glossary';
import { BADGES, Badge, Callout, Code, CodeBlock, H2, H3, INK, LI, MUT, NextSteps, P, PageLede, RED, Section, UL, mono, type Tone } from './ui';
import { ResourceReference } from './reference';
import { ErrorCatalogue } from './ErrorCatalogue';

export type CopyFn = (text: string, label: string) => void;

// -- SDK maturity matrix (verified: complete source, none published) ------------
const SDKS: { name: string; lang: string; state: string; tone: Tone; consume: string }[] = [
  { name: '@banzami/sdk', lang: 'TypeScript / Node', state: 'Publicado — servidor, chave secreta', tone: 'ok', consume: 'npm install @banzami/sdk' },
  { name: 'banzami-python', lang: 'Python', state: 'Completo (código-fonte)', tone: 'ok', consume: 'código-fonte / local' },
  { name: 'banzami/sdk-php', lang: 'PHP (+ Laravel)', state: 'Completo (código-fonte)', tone: 'ok', consume: 'código-fonte / local' },
  // banzami_client is the PUBLIC client SDK; banzami_flutter is Banzami's own
  // application framework and is not published (Banzami ADR-053). Listing the
  // internal one as an integration SDK would send a developer to a package that
  // is not theirs to use.
  { name: 'banzami_client', lang: 'Dart / Flutter (cliente)', state: 'Publicado — cliente público, chave publicável', tone: 'ok', consume: 'dart pub add banzami_client' },
  { name: '@banzami/checkout', lang: 'JavaScript (browser)', state: 'Completo (código-fonte)', tone: 'ok', consume: 'embed / local' },
  { name: 'banzami-go', lang: 'Go', state: 'Parcial — webhooks + payment links', tone: 'val', consume: 'código-fonte / local' },
];

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
const EVENTS: string[] = [
  'payment_session.created',
  'payment_session.paid',
  'payment_link.paid',
  'refund.completed',
  'application_settlement.completed',
  'application_settlement.cancelled',
  'application_settlement.failed',
];

// -- Code samples (grounded in DOA's verified SDK usage) ------------------------
const SAMPLE_SESSION = `import { BanzamiClient } from '@banzami/sdk';

// A chave secreta bz_test_sk_ vive apenas no servidor.
const apiKey = process.env.BANZAMI_API_KEY;
if (!apiKey) throw new Error('BANZAMI_API_KEY em falta');
const banzami = new BanzamiClient({ apiKey });

// 0. O projeto tem de estar financeiramente pronto — senão: 403 PAYMENTS_UNAVAILABLE.
const setup = await banzami.getFinancialSetup();

// 1. Criar uma sessão de pagamento.
//    Não indique a conta de destino: com uma chave da Consola, o destinatário
//    vem da configuração financeira do projeto. Enviá-la é recusado pela API.
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

// 3. Saber se pagou. A fonte de verdade é o Banzami, não o browser do pagador:
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
# Com uma chave developer NÃO se envia wallet_account_id: o destinatário vem
# da configuração financeira do projeto e a API recusa um destinatário indicado pelo cliente.
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

const SAMPLE_IDEM_RETRY = `# Repetição segura: a MESMA Idempotency-Key reproduz a resposta original
curl -X POST https://sandbox-api.banzami.com/v1/payment-sessions \
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem_pedido_123" \
  -d '{ ...mesmo corpo... }'
# -> 201 com a MESMA resposta; nenhuma sessão duplicada é criada.

# O que NÃO fazer: mudar a Idempotency-Key ao repetir após timeout —
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

// No seu endpoint de webhook (servidor): o corpo EM BRUTO e o header.
const raw = await req.text();
const sig = req.headers.get('banza-signature') ?? '';
// constructEvent verifica a assinatura e SÓ DEPOIS devolve o evento.
// Se a assinatura não bater certo, lança — e nada foi lido.
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
guardarSegredo(ep.secret);   // devolvido UMA vez — nenhuma leitura posterior o traz

// Ver o que aconteceu
const { data: endpoints } = await banzami.listWebhookEndpoints();
const { data: eventos }   = await banzami.listWebhookEvents(20);
const { data: entregas }  = await banzami.listWebhookDeliveries(eventos[0].id);

// Rodar o segredo. Actualize o receptor ANTES: a troca é imediata, não sobreposta.
const rodado = await banzami.rotateWebhookEndpointSecret(ep.id);
guardarSegredo(rodado.secret);`;


// -- Produção card --------------------------------------------------------------
function ProducaoCard() {
  return (
    <div id="producao" style={{ scrollMarginTop: 72, marginTop: 8, borderRadius: 16, border: '1px solid #F7DAD7', background: '#FFF7F6', padding: '18px 20px', maxWidth: 660 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: INK }}>Produção</span>
        <Badge tone="prep" />
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#5a4a4e', fontWeight: 500 }}>
        O ambiente Sandbox permite validar a integração sem movimentação de dinheiro real. A ativação para pagamentos reais
        será disponibilizada após a conclusão das etapas necessárias de habilitação da plataforma.
      </p>
    </div>
  );
}


export function PtGetStarted({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="introducao">
              <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Introdução</h1>
              <NextSteps label="A seguir:" links={[{ href: '/docs/sdk', text: 'SDKs' }, { href: '/docs/testing', text: 'Testar no Sandbox' }, { href: '/docs/reference', text: 'Referência API' }]} />
              <P style={{ fontSize: 15.5, color: MUT, fontWeight: 600 }}>
                Comece a integrar Banzami em poucos minutos. Todas as chamadas usam o ambiente <GlossaryTerm id="sandbox">Sandbox</GlossaryTerm> por defeito.
                Construa e valide a sua integração no Sandbox — a <GlossaryTerm id="producao">Produção</GlossaryTerm> será ativada quando a plataforma estiver
                habilitada para pagamentos reais.
              </P>

              {/* Estado atual — status honesto no topo (P0). Usa o cartão existente. */}
              <div id="estado-atual" style={{ scrollMarginTop: 72, margin: '0 0 18px', borderRadius: 16, border: '1px solid #F7DAD7', background: '#FFF7F6', padding: '16px 18px', maxWidth: 660 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>Estado atual desta documentação</span>
                  <Badge tone="prep">Sandbox</Badge>
                </div>
                <UL>
                  <LI>Isto documenta o <strong>Sandbox</strong>, que é o único ambiente que existe. Os SDKs instalam-se a partir de registos públicos e a Consola é operacional; o que falta é dinheiro real, não capacidade.</LI>
                  <LI>O <strong>dinheiro no Sandbox é fictício</strong>. Os saldos, os pagamentos e as liquidações são reais como mecânica e comportam-se como se comportarão em produção — mas nenhum kwanza sai ou entra de uma conta bancária, e nada do que aqui acontece tem efeito financeiro no mundo. É por isso que pode testar à vontade.</LI>
                  <LI><strong>Produção e trilhos de dinheiro real não estão disponíveis.</strong> Pay/checkout públicos, trilhos live e fornecedores externos não estão disponíveis.</LI>
                  <LI>A Consola é <strong>operacional em Sandbox</strong>. A Visão geral, os Webhooks e os Registos derivam do tráfego real do seu projeto — nenhuma página da Consola apresenta dados ilustrativos. O âmbito testado é o fluxo API/SDK no Sandbox e a gestão de workspaces, projetos, membros e chaves.</LI>
                </UL>
              </div>

              <CapabilityCards lang="pt" />

              {/* h2, not h3: it follows the page h1 directly, and a skipped
                  heading level is a screen reader announcing a subsection of
                  something that is not there. */}
              <H2>Três camadas</H2>
              <P>Ao integrar Banzami, distinga sempre três camadas:</P>
              <UL>
                <LI><strong>Banzami Developers Console</strong> — o portal onde entra por email e <GlossaryTerm id="otp">OTP</GlossaryTerm>, cria workspaces, projetos Sandbox e <strong>chaves de teste</strong>, gere membros e papéis, regista webhooks e consulta os registos da API. A Console não é uma API pública para terceiros chamarem diretamente. A Visão geral, os Saldos, as Transações, os Webhooks e os Registos mostram dados reais do seu projeto: os Saldos as contas do destinatário a que o projeto está ligado, as Transações os pagamentos, reembolsos e transferências que aconteceram, e os Registos cada pedido feito à API com uma chave do projeto. A Console não tem directório de clientes nem página de estado — nenhum dos dois existe como produto.</LI>
                <LI><strong>Camada de integração Banzami</strong> — o que a sua aplicação usa para pagamentos: links de pagamento, sessões, QR, confirmação, comprovativos, <GlossaryTerm id="webhook">webhooks</GlossaryTerm> assinados e <GlossaryTerm id="liquidacao">liquidação</GlossaryTerm> controlada pelo operador.</LI>
                <LI><strong>Banzami Operator / Core</strong> — a camada financeira do Banzami: executa o pagamento, mantém saldos e integridade, calcula e controla a liquidação. A sua aplicação nunca cria nem gere um <GlossaryTerm id="ledger">ledger</GlossaryTerm> financeiro próprio.</LI>
              </UL>

              {/* DOA reference block */}
              <div id="doa" style={{ scrollMarginTop: 72, margin: '24px 0', borderRadius: 18, border: '1px solid #F2E2E0', background: 'linear-gradient(135deg,#fff,#FFF4F3)', padding: 22, boxShadow: '0 18px 44px -38px rgba(181,16,31,.4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.04em', color: RED }}>DOA · INTEGRAÇÃO DE REFERÊNCIA</span>
                  <Badge tone="ok" />
                </div>
                <P style={{ marginBottom: 8 }}>
                  <strong>DOA é a implementação de referência da integração Banzami.</strong> Demonstra como uma aplicação
                  gere a sua própria lógica de negócio — campanhas e doações — enquanto delega toda a parte financeira ao Banzami.
                </P>
                <UL>
                  <LI>Cria uma jornada de pagamento Banzami e apresenta link e <GlossaryTerm id="qr">QR</GlossaryTerm> ao doador.</LI>
                  <LI>Acompanha a confirmação e valida webhooks assinados no servidor.</LI>
                  <LI>Emite <GlossaryTerm id="comprovativo">comprovativos</GlossaryTerm> e solicita a liquidação dentro do modelo do operador.</LI>
                  <LI>Não cria ledger, saldo financeiro nem infraestrutura de pagamentos próprios.</LI>
                </UL>
                <P style={{ margin: 0 }}>
                  Atualmente, a integração DOA encontra-se operacional no ambiente Sandbox e é usada para validar continuamente
                  o modelo de integração Banzami.
                </P>
                <div style={{ marginTop: 14 }}>
                  <JourneyStripDiagram
                    title="O percurso de uma integração, do utilizador à liquidação"
                    steps={['Utilizador', 'App DOA', 'Banzami', 'Link / QR / Sessão', 'Confirmação', 'Webhook / Comprovativo', 'Liquidação']}
                  />
                </div>
              </div>

              <ProducaoCard />
            </Section>
<Section id="quickstart">
              <H2>Quickstart</H2>
              <Callout>
                <strong>Caminho recomendado: o SDK TypeScript.</strong> Instale com{' '}
                <Code>npm install @banzami/sdk</Code>. O curl serve para validar o protocolo,
                diagnosticar o Sandbox ou auditar chamadas de baixo nível — não é o caminho de implementação.
              </Callout>
              <P>Do primeiro acesso ao primeiro pagamento confirmado, no Sandbox — doze passos:</P>
              <ol style={{ margin: '0 0 16px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Entre na Consola em <Code>developers.banzami.com/login</Code> com email e código (OTP).</LI>
                <LI>Crie ou escolha um <strong>workspace</strong>.</LI>
                <LI>Crie um <strong>projeto Sandbox</strong>.</LI>
                <LI>Faça a <a href="#configuracao-financeira" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>configuração financeira</a> do projeto — candidate um Business, ou ligue um que já existe com o código de consentimento do seu dono. <strong>Sem este passo o projeto não recebe pagamentos.</strong></LI>
                <LI>Crie uma <strong>chave secreta de teste</strong> e guarde-a quando aparece — é mostrada uma única vez.</LI>
                <LI>Instale o SDK: <Code>npm install @banzami/sdk</Code>.</LI>
                <LI>Faça a primeira chamada: <Code>GET /v1/me</Code> confirma o ambiente, o projeto, os scopes e o estado da chave.</LI>
                <LI>Crie uma <GlossaryTerm id="sessao-pagamento">sessão de pagamento</GlossaryTerm>.</LI>
                <LI>Abra o link que a sessão devolve — é a página do pagador em <Code>pay.banzami.com</Code>.</LI>
                <LI>Confirme o resultado: <Code>getPaymentSession</Code> passa a <Code>PAID</Code> quando o pagador paga.</LI>
                <LI>Receba o webhook <Code>payment_session.paid</Code> e <strong>verifique a assinatura antes de o ler</strong>.</LI>
                <LI>Veja o pagamento na Consola, em <strong>Transações</strong>.</LI>
              </ol>
              <Callout>
                Os passos 1–3 e 5–7 fazem-se em minutos. O passo 4 não: um Business novo é{' '}
                <strong>revisto pelo Banzami</strong> antes de poder receber, e ligar um Business existente
                precisa do código do seu dono. É por isso que a configuração financeira vem antes do primeiro
                pagamento — e não depois de ele falhar.
              </Callout>
              <CodeBlock label="curl · primeira chamada (GET /v1/me)" raw={SAMPLE_CURL_ME} onCopy={copy} />
              <Callout>
                Todos os exemplos usam <strong>chaves e identificadores placeholder</strong> e são <strong>Sandbox-only</strong> —
                nunca movem dinheiro real. Substitua os valores pelos do seu projeto Sandbox.
              </Callout>
              <CodeBlock label="chaves de teste" raw={SAMPLE_KEYS} onCopy={copy} />
              <UL>
                <LI><Code>bz_test_pk_</Code> — <GlossaryTerm id="chave-publicavel">chave publicável</GlossaryTerm> (pode ir no cliente).</LI>
                <LI><Code>bz_test_sk_</Code> — <GlossaryTerm id="chave-secreta">chave secreta</GlossaryTerm> (apenas no servidor).</LI>
                <LI>A chave secreta aparece <strong>uma única vez</strong>; pode <strong>rodar</strong> ou <strong>revogar</strong> chaves a qualquer momento.</LI>
              </UL>
              <Callout>Nunca exponha chaves secretas no browser, app móvel, repositório, logs, capturas de ecrã ou analytics.</Callout>
              <P>
                A integração Banzami é <strong>SDK-first</strong>. O SDK TypeScript está{' '}
                <strong>publicado</strong> e é o caminho recomendado — instale com{' '}
                <Code>npm install @banzami/sdk</Code>. Os exemplos curl existem como{' '}
                <strong>referência/diagnóstico</strong> do protocolo, não como caminho de implementação.
                O SDK cliente Dart <Code>banzami_client</Code> também está publicado, no pub.dev. Os SDKs para
                Python, PHP e Go ainda <strong>não estão publicados</strong> em PyPI, Packagist ou num proxy de
                módulos — ver{' '}
                <a href="/docs/sdk" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>SDKs</a>.
              </P>

              <H3 id="configuracao-financeira">Configuração financeira — antes do primeiro pagamento</H3>
              <P>
                Um projeto acabado de criar pode fazer tudo menos receber dinheiro. Chaves, webhooks e
                chamadas à API funcionam; criar uma sessão de pagamento responde{' '}
                <Code>403 PAYMENTS_UNAVAILABLE</Code>. O que falta é saber <strong>quem recebe</strong>: o
                dinheiro vai para um <strong>Business</strong>, uma entidade verificada, e é a configuração
                financeira que liga o projeto a esse Business.
              </P>
              <P>Há dois caminhos, e a diferença é quem já existe:</P>
              <UL>
                <LI>
                  <strong>Business novo.</strong> Na Consola, em <strong>Configuração financeira</strong>,
                  candidate o Business: entidade, representante, documentos. O Banzami revê a candidatura —
                  é uma decisão humana e não é imediata, também no Sandbox. Quando é aprovada, o projeto
                  fica ligado e passa a poder receber.
                </LI>
                <LI>
                  <strong>Business que já existe.</strong> Se a entidade já está verificada no Banzami, o seu
                  dono gera um <strong>código de consentimento</strong> na app Banzami Business. Cole-o na
                  Consola e o projeto liga-se a esse Business sem repetir a verificação. O código é de uso
                  único.
                </LI>
              </UL>
              <P>
                Para saber se o projeto já está pronto, veja o estado em{' '}
                <strong>Configuração financeira</strong> na Consola, ou pergunte à API com{' '}
                <Code>getFinancialSetup()</Code> — é o que a sua aplicação deve consultar para decidir se
                mostra a opção de pagar.
              </P>
              <Callout tone="warn">
                Não há atalho: nenhum pedido seu, nenhum campo, nenhuma chave torna um projeto financeiramente
                pronto. É a verificação do Business que dá ao projeto autoridade para receber, e é por isso
                que a sua chave nunca escolhe o destinatário.
              </Callout>

                            <H3 id="primeiro-pagamento">O seu primeiro pagamento</H3>
              <P>
                A sessão de pagamento é o fluxo principal: cria-a, o Banzami devolve um link e um
                QR, e o pagador usa um dos dois. Com uma chave de projeto <strong>não</strong> indica
                a conta de destino — o destinatário vem da configuração financeira do projeto, e a API recusa um
                destinatário indicado pelo cliente.
              </P>
              <CodeBlock label="curl · criar sessão de pagamento (pedido + resposta)" raw={SAMPLE_CURL_SESSION} onCopy={copy} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Falhas que vale a pena esperar: <Code>401</Code> (chave em falta, revogada ou live),{' '}
                <Code>403 PAYMENTS_UNAVAILABLE</Code> (o projeto ainda não tem configuração financeira — ver{' '}
                <a href="#configuracao-financeira" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>acima</a>),{' '}
                <Code>403 INSUFFICIENT_SCOPE</Code>,{' '}
                <Code>400 INVALID_BODY / BAD_REQUEST</Code>, <Code>409 IDEMPOTENCY_CONFLICT</Code> (um pedido com a
                mesma Idempotency-Key ainda em curso) e <Code>409 IDEMPOTENCY_KEY_REUSED</Code> (a mesma chave com outro
                corpo). Ver{' '}
                <a href="/docs/reference#errors" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>.
              </P>
              <CodeBlock label="ts · criar sessão de pagamento (@banzami/sdk)" raw={SAMPLE_SESSION} onCopy={copy} />
              <H3 id="depois-do-pagamento">Depois de criar a sessão</H3>
              <UL>
                <LI><strong>Abrir o pagamento.</strong> O link da sessão é a página do pagador em <Code>pay.banzami.com</Code>; o QR codifica o mesmo endereço, e qualquer câmara o abre.</LI>
                <LI><strong>Confirmar.</strong> Quando o pagador paga, <Code>getPaymentSession</Code> passa a <Code>PAID</Code>. Não conclua que pagou porque o pagador voltou à sua página — confirme no servidor.</LI>
                <LI><strong>Receber o webhook.</strong> Registe o seu endpoint com <Code>createWebhookEndpoint</Code> e guarde o segredo, que aparece uma vez. Ao receber <Code>payment_session.paid</Code>, <strong>verifique a assinatura antes de ler o evento</strong> e trate-o de forma idempotente pelo <Code>id</Code> — a entrega é at-least-once. Ver{' '}
                  <a href="/docs/guides#webhooks" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Webhooks</a>.</LI>
                <LI><strong>Ver na Consola.</strong> O pagamento aparece em <strong>Transações</strong> do projeto, com o valor e o estado.</LI>
              </UL>

              </Section>
    </>
  );
}

export function PtSdk({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="sdks">
              <H2>SDKs</H2>
              <PageLede>Modelo <strong>SDK-first</strong>, dois SDKs publicados em registos públicos, contrato do SDK, estado por família e exemplos de ergonomia.</PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/guides', text: 'Guias' }, { href: '/docs/testing', text: 'Testar no Sandbox' }, { href: '/docs/trust', text: 'Segurança' }]} />
<H3 id="sdk-first">Modelo de integração SDK-first</H3>
              <P>
                A filosofia de integração do Banzami é <strong>SDK-first</strong>. Os SDKs Banzami devem ser o caminho
                recomendado para integrar pagamentos, criar sessões, validar respostas, tratar erros, gerir idempotência e
                consumir webhooks.
              </P>
              <P>
                A API HTTP e o OpenAPI existem como <strong>camada de referência técnica do protocolo</strong>. O uso HTTP
                direto é secundário e deve ser reservado para diagnóstico, auditoria, testes controlados ou integradores
                avançados.
              </P>
              <P>
                Dois SDKs estão publicados em registos públicos e instalam-se sem contacto comercial:{' '}
                <Code>npm install @banzami/sdk</Code> (servidor) e <Code>dart pub add banzami_client</Code> (cliente).
                Os pacotes Python e PHP ainda não foram publicados e consomem-se por código-fonte; para esses, e só
                para esses, o acesso continua em pré-visualização controlada até publicação oficial.
              </P>

              <H3 id="sdk-matriz">Matriz de maturidade dos SDKs</H3>
              <P>
                Os SDKs tratam automaticamente de autenticação, idempotência, retries e verificação de assinatura de webhooks.
                O <Code>@banzami/sdk</Code> está publicado em npm e o <Code>banzami_client</Code> em pub.dev — cada publicação
                foi provada por uma instalação limpa a partir do registo, fora de qualquer repositório Banzami. Os restantes
                consomem-se como <strong>código-fonte</strong>.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>SDK</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Linguagem</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Estado</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Como consumir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SDKS.map((s) => (
                      <tr key={s.name}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontWeight: 700, color: INK }}>{s.name}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{s.lang}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{s.state}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{s.consume}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>
                O <strong>DOA</strong> é a prova real de consumo SDK-first: usa o <Code>@banzami/sdk</Code> para criar sessões e links,
                gerar QR, resolver <Code>@banza</Code>, validar webhooks e solicitar liquidação — sem chamadas HTTP diretas.
              </P>

              {/* The anchor keeps its old id so links written when this section was
   called "SDK preview" still land on it. The section is not a preview. */}
              <H3 id="sdk-preview">Publicação dos SDKs</H3>
              <P>
                O <Code>@banzami/sdk</Code> (npm) e o <Code>banzami_client</Code> (pub.dev) estão publicados e são o caminho
                recomendado. Instalam-se a partir do registo público, sem convite e sem contacto comercial.
              </P>
              <P>
                Os pacotes Python e PHP ainda não foram publicados e permanecem em pré-visualização controlada: esta
                documentação não apresenta comandos de instalação para eles, porque um comando que aponta para um pacote
                que nenhum registo tem devolve um erro que parece culpa de quem integra.
              </P>

              <H3 id="sdk-contrato">Contrato esperado do SDK</H3>
              <P>O que os SDKs oficiais Banzami devem tratar (<strong>contrato esperado</strong>, não comportamento publicado):</P>
              <UL>
                <LI>Autenticação Bearer e separação de ambientes (Sandbox vs futura Produção).</LI>
                <LI>Criação e consulta de sessões de pagamento; obtenção de link público e payload QR (superfícies verificadas).</LI>
                <LI><strong>Idempotência</strong>: geração da Idempotency-Key ou aceitação explícita de uma chave do caller.</LI>
                <LI>Mapeamento canónico de erros e exposição do <Code>request_id</Code>; orientação de retry segura.</LI>
                <LI>Verificação da assinatura de webhooks (<Code>banza-signature</Code>) e parsing do envelope de eventos verificado (esperado/planeado).</LI>
                <LI><strong>Nunca</strong>: expor chaves secretas no cliente, ativar trilhos live automaticamente, ou emitir chaves de Produção (não disponível).</LI>
              </UL>

              <H3 id="sdk-familias">Estado por família de SDK</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Família SDK</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Estado atual</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Pacote público</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Comando de instalação</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Uso recomendado agora</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['JavaScript/TypeScript', 'publicado', '@banzami/sdk', 'npm install @banzami/sdk', 'caminho recomendado (servidor)', 'chave secreta — nunca no cliente'],
                      ['Dart / Flutter (cliente)', 'publicado', 'banzami_client', 'dart pub add banzami_client', 'caminho recomendado (cliente)', 'chave publicável, apenas leitura'],
                      ['Python', 'não publicado', 'nenhum', 'não disponível', 'consumir por código-fonte', 'publicação por fazer'],
                      ['PHP', 'não publicado', 'nenhum', 'não disponível', 'consumir por código-fonte', 'publicação por fazer'],
                    ] as [string, string, string, string, string, string][]).map(([fam, st, pkg, cmd, use, note]) => (
                      <tr key={fam}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontWeight: 700, color: INK }}>{fam}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{st}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{pkg}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{cmd}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{use}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>
                Contrato machine-readable:{' '}
                <a href="/developers/artifacts/sdk-contract.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-contract.json</a>
                {' '}·{' '}
                <a href="/developers/artifacts/sdk-first-manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-first-manifest.json</a>.
                Exemplos SDK-style (ergonomia prevista):{' '}
                <a href="/developers/examples/sdk/typescript-payment-session.example.ts" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>TypeScript</a>
                {' '}·{' '}
                <a href="/developers/examples/sdk/python-payment-session.example.py" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Python</a>
                {' '}·{' '}
                <a href="/developers/examples/sdk/php-payment-session.example.php" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>PHP</a>.
              </P>
              <Callout>
                Os exemplos abaixo mostram a ergonomia que cada SDK oferece. Para
                TypeScript e Dart são instruções reais: os pacotes estão publicados
                e instalam-se com os comandos indicados acima. Para Python e PHP são
                exemplos da ergonomia prevista — sem comando de instalação, porque
                ainda não há pacote em registo público para instalar.
              </Callout>

              <H3 id="antes-de-integrar">Antes de pôr a integração a sério</H3>
              <P>
                Não é um processo de aprovação: não há convite, não há elegibilidade e
                não há contacto comercial entre si e o Sandbox. É a lista do que vale a
                pena ter testado antes de haver utilizadores do outro lado.
              </P>
              <UL>
                <LI>Identidade e autenticação: <Code>GET /v1/me</Code> responde com a chave que a sua aplicação vai usar em produção do seu lado.</LI>
                <LI>Prontidão financeira: <Code>GET /v1/financial-setup</Code> devolve o estado do seu Projeto, e a sua aplicação sabe o que mostrar quando ainda não está pronto.</LI>
                <LI>Criação e consulta do recurso de pagamento que vai usar — sessão ou link — mais o payload QR, se apresentar QR.</LI>
                <LI>Idempotência: um retry com a <strong>mesma</strong> <Code>Idempotency-Key</Code> testado, e o que acontece a pedidos concorrentes compreendido.</LI>
                <LI>Erros: um <Code>400</Code> de validação e um <Code>401</Code> testados, com o <Code>request_id</Code> a aparecer nos seus logs.</LI>
                <LI>Webhooks: assinatura verificada com o método do SDK, entregas duplicadas tratadas como o mesmo evento, e o segredo guardado onde os segredos vivem.</LI>
                <LI>Segredos: a chave secreta apenas no servidor — nunca no browser, nunca numa app móvel, nunca no repositório.</LI>
              </UL>

              <H3 id="reportar-problema">Encontrou um problema?</H3>
              <P>
                Envie o <Code>request_id</Code> da resposta, o carimbo temporal, o ambiente
                (<Code>SANDBOX</Code>), a operação que tentou e a versão do SDK. Com o{' '}
                <Code>request_id</Code> conseguimos seguir o pedido exacto no nosso lado.
              </P>
              <Callout tone="warn">
                Nunca envie a chave secreta, o segredo do webhook, um código OTP ou um token
                de sessão — em nenhum canal de suporte. Nada do que precisamos para ajudar
                é um segredo.
              </Callout>

              </Section>
    </>
  );
}

export function PtConsole({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="console">
              <H2>A Consola</H2>
              <PageLede>Tudo o que existe em <Code>developers.banzami.com</Code>, ecrã a ecrã — e o que cada coisa significa antes de a usar.</PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/get-started', text: 'Quickstart' }, { href: '/docs/guides', text: 'Guias' }, { href: '/docs/trust', text: 'Segurança' }]} />

              <H3 id="modelo">O modelo, antes dos ecrãs</H3>
              <P>
                Quatro coisas, encaixadas umas nas outras. Vale a pena ler isto uma vez, porque
                quase todos os erros de integração são um destes quatro confundido com outro.
              </P>
              <ConceptModelDiagram l={{
                title: 'O modelo: pessoa, workspace, projeto, e o que cada projeto contém',
                person: 'Pessoa (email + código)', workspace: 'Workspace', project: 'Projeto',
                financialSetup: 'Configuração financeira', business: 'Business',
                wallet: 'Carteira', accounts: 'Contas',
                apiKeys: 'Chaves de API', webhooks: 'Endpoints de webhook',
                noteWorkspace: 'quem tem acesso a quê',
                noteProject: 'a unidade de integração',
                noteBusiness: 'quem recebe o dinheiro',
                noteKeys: 'como a sua app se autentica',
                noteWebhooks: 'para onde vão os eventos',
              }} />
              <UL>
                <LI><strong>Pessoa ≠ Workspace.</strong> Uma pessoa é membro de vários workspaces; um workspace tem vários membros.</LI>
                <LI><strong>Workspace ≠ Projeto.</strong> O workspace é a fronteira de acesso. O projeto é a fronteira de <em>integração</em>: chaves, webhooks e registos pertencem ao projeto.</LI>
                <LI><strong>Projeto ≠ Business.</strong> O projeto é a sua aplicação. O Business é a entidade legal que recebe o dinheiro. Ligam-se pela Configuração financeira, e um projeto sem essa ligação pode fazer tudo menos receber.</LI>
                <LI><strong>Business ≠ conta de carteira.</strong> O Business tem uma carteira; a carteira tem contas segregadas. É nas contas que o valor se separa por campanha, loja ou evento.</LI>
              </UL>
              <Callout>
                <strong>A autoridade desce, nunca sobe.</strong> A sua chave identifica o Projeto; o
                Projeto determina o Business; o Business determina a carteira e as contas. Nenhum
                campo do seu pedido escolhe o titular — os ids que envia <em>seleccionam</em>
                recursos dentro do que já lhe pertence, nunca lhe dão acesso a mais nada.
              </Callout>

              <H3 id="conta">Conta</H3>
              <P>
                O seu perfil pessoal, em <Code>/conta</Code>. Entra-se com email e um código de
                seis dígitos: não há palavra-passe para escolher, esquecer ou reutilizar.
              </P>
              <UL>
                <LI><strong>Perfil</strong> — o nome que aparece a quem partilha workspace consigo. O email é o seu identificador e não se edita.</LI>
                <LI><strong>Segurança</strong> — descreve o modelo real: código por email, sessão em cookie. Não há controlos de palavra-passe nem de MFA porque não existe nem uma nem outra.</LI>
                <LI><strong>Sessões</strong> — as sessões abertas, com origem e última utilização, e um botão para terminar todas as outras. É o que se usa quando se perde um portátil.</LI>
                <LI><strong>Sair</strong> — pede confirmação. Cancelar mantém a sessão; confirmar termina-a e o botão «voltar» do browser não a traz de volta.</LI>
              </UL>

              <H3 id="workspace">Workspaces, membros e papéis</H3>
              <P>
                Um workspace é <em>quem</em> tem acesso. Criá-lo é imediato e não envolve ninguém
                do Banzami.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Papel</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Pode</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Owner (Proprietário)', 'Tudo, incluindo convidar, mudar papéis, arquivar e apagar. O último owner não pode sair — não há workspace sem dono.'],
                      ['Admin', 'Gerir membros, projetos e chaves. Não altera nem remove um Owner ou outro Admin, e não nomeia Admins.'],
                      ['Developer', 'Criar e gerir projetos, chaves e webhooks. Não gere membros.'],
                      ['Finance (Financeiro)', 'Ver saldos, transações e liquidações. Não emite chaves.'],
                      ['Viewer (Observador)', 'Ler. Nada mais.'],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: INK, fontWeight: 700 }}>{r[0]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Convidar</strong> gera um link que a Consola copia para si. Quem o aceita entra com o seu próprio email e o seu próprio código — o convite nomeia o papel, não a pessoa.</LI>
                <LI><strong>Sair</strong> de um workspace é sempre possível, excepto para o último Owner: um workspace nunca fica sem dono.</LI>
                <LI><strong>Transferir a propriedade</strong> faz-se em dois passos: um Owner dá o papel de Owner a outro membro e, depois, sai ou muda o seu próprio papel. Não há um botão que entregue o workspace de uma vez, e por isso não há um momento sem dono.</LI>
                <LI><strong>Arquivar</strong> um workspace é recusado enquanto tiver projetos ativos, e a recusa diz quantos. Arquive-os primeiro.</LI>
                <LI><strong>Apagar</strong> só é possível se o workspace estiver realmente vazio. Um workspace com história arquiva-se; um que nunca teve nada desaparece.</LI>
              </UL>

              <H3 id="atividade">Atividade do workspace</H3>
              <P>
                Em <Code>Configurações · Atividade</Code>, o registo administrativo do workspace:
                quem mudou o quê, a quem e quando. Convites, entradas e saídas, mudanças de papel
                e remoções, e as alterações ao próprio workspace, aos seus projetos e às suas
                chaves. Uma mudança de papel mostra <strong>os dois lados</strong> da transição —
                de que papel para que papel — porque é normalmente essa a pergunta.
              </P>
              <UL>
                <LI><strong>É deste workspace e de mais nenhum.</strong> O registo é filtrado pelo workspace de que já é membro; não há forma de pedir o de outro.</LI>
                <LI><strong>Proprietários e Administradores.</strong> Ver quem tem acesso e quem o concedeu é uma questão de gestão, e são esses os papéis que também o podem alterar.</LI>
                <LI><strong>Não é o histórico de segurança de ninguém.</strong> Sessões pessoais, códigos de entrada e definições de conta não estão aqui — pertencem a <Code>/conta</Code>, e só à própria pessoa.</LI>
                <LI><strong>Não mostra segredos.</strong> Uma chave criada aparece como acontecimento; o seu valor, o seu prefixo e os segredos de webhook não aparecem em lado nenhum.</LI>
                <LI><strong>Permanente.</strong> Não se edita nem se apaga a partir da Consola, e sobrevive ao que descreve: um projeto eliminado continua a aparecer aqui.</LI>
              </UL>
              <Callout>
                <strong>Atividade não é Registos.</strong> Atividade responde a «quem tem autoridade
                aqui, e quem lha deu» — é administração do workspace. <Code>Registos</Code> responde
                a «o que é que a minha aplicação pediu à API» — é tráfego de integração de um
                projeto. São páginas diferentes porque são perguntas diferentes.
              </Callout>

              <H3 id="projeto">Projetos</H3>
              <P>
                O projeto é a unidade de integração: uma aplicação, um conjunto de chaves, os seus
                webhooks e os seus registos. Uma aplicação, um projeto.
              </P>
              <UL>
                <LI><strong>O Project ID não muda.</strong> Renomear altera a etiqueta e mais nada — o id que escreveu na sua configuração continua válido.</LI>
                <LI><strong>Apagar</strong> é possível enquanto o projeto não tiver história nenhuma: nenhuma chave alguma vez emitida, nenhum pedido registado, nenhuma ligação financeira. A Consola diz o que está no caminho.</LI>
                <LI><strong>Arquivar</strong> é o que se faz a um projeto que <em>teve</em> história. Arquivar revoga as chaves ativas e diz quantas — e a partir daí uma chamada com qualquer uma delas responde <Code>401</Code>.</LI>
                <LI>Um projeto arquivado sai do seletor e volta atrás de «Mostrar arquivados», marcado como arquivado.</LI>
              </UL>

              <H3 id="financeiro">Configuração financeira</H3>
              <P>
                É aqui que um projeto ganha um titular financeiro. Sem isto, tudo funciona —
                chaves, webhooks, integração — <strong>excepto receber dinheiro</strong>. É uma
                distinção deliberada: pode construir e testar a integração inteira antes de haver
                uma entidade legal verificada por trás dela.
              </P>
              <P>Há dois caminhos, e são genuinamente diferentes:</P>
              <UL>
                <LI><strong>Business novo.</strong> Submete uma candidatura — entidade, representante, documentos — e o Banzami verifica-a. É uma decisão humana, e demora o que demora.</LI>
                <LI><strong>Business existente.</strong> Se a entidade já está verificada no Banzami, o dono dela emite-lhe um <strong>código de consentimento</strong>. Cola-o, e o projeto liga-se a esse Business sem repetir a verificação. O código é de uso único: ligar consome-o.</LI>
              </UL>
              <P>
                O estado é legível por API em <Code>GET /v1/financial-setup</Code>, para que a sua
                aplicação saiba o que mostrar enquanto não está pronta.
              </P>
              <Callout tone="warn">
                A taxa não é escolhida por si. O Banzami atribui o preço ao Business; nenhum campo
                do seu pedido a seleciona, e nenhum caminho da Consola a altera.
              </Callout>

              <H3 id="chaves">Chaves de API</H3>
              <UL>
                <LI>O <strong>nome</strong> é seu: distingue a chave na lista e na Atividade do workspace, e não muda o que ela pode fazer.</LI>
                <LI>Os <strong>scopes</strong> escolhem-se na criação e não mudam. Uma chave só de leitura nunca poderá escrever.</LI>
                <LI>O segredo aparece <strong>uma única vez</strong>, no diálogo de criação, com um botão para copiar. Depois disso a lista mostra o prefixo e uma máscara.</LI>
                <LI><strong>Rodar</strong> cria a sucessora e revoga a anterior no mesmo passo: a nova vale logo, e a antiga deixa de valer nesse instante. Para trocar sem falhas no seu servidor, crie antes uma chave nova, ponha-a em uso e só depois revogue a antiga.</LI>
                <LI><strong>Revogar</strong> é imediato: a chamada seguinte com essa chave responde <Code>401</Code>.</LI>
                <LI>A lista mostra a <strong>última utilização</strong>, que é como se descobre qual já ninguém usa.</LI>
              </UL>
              <P>
                Onde guardar a chave e o que nunca fazer com ela está em{' '}
                <a href="/docs/trust" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Segurança</a>.
              </P>

              <H3 id="webhooks-console">Webhooks</H3>
              <UL>
                <LI><strong>Registar</strong> um endpoint HTTPS devolve o segredo de assinatura uma única vez.</LI>
                <LI><strong>Eventos</strong> lista o que o seu projeto emitiu; abrir um evento mostra as suas entregas, com estado e código de resposta.</LI>
                <LI><strong>Reentregar</strong> repete a mesma entrega — é a mesma entrega outra vez, não uma nova.</LI>
                <LI><strong>Rodar o segredo</strong> emite um novo, revelado uma vez; o endpoint mantém-se.</LI>
                <LI><strong>Desativar</strong> deixa de pôr eventos novos na fila deste endpoint, sem o apagar nem à sua história. Os eventos emitidos enquanto está desativado não lhe são entregues depois; <strong>reativar</strong> volta a recebê-los a partir desse momento, e os que perdeu continuam em Eventos.</LI>
                <LI>Uma entrega que falha é <strong>tentada outra vez</strong>, até 5 vezes, com espera crescente. O contrato completo e o que fazer quando não chega estão em{' '}
                  <a href="/docs/guides#reentrega" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Contrato de reentrega</a> e{' '}
                  <a href="/docs/guides#resolucao" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Resolução de problemas</a>.</LI>
              </UL>

              <H3 id="registos">Saldos, transações e registos</H3>
              <UL>
                <LI><strong>Saldos</strong> mostra as contas do titular a que o projeto está ligado, e o que há em cada uma.</LI>
                <LI><strong>Transações</strong> mostra o movimento real do projeto — não uma amostra, não um exemplo.</LI>
                <LI><strong>Registos</strong> lista os pedidos que a sua chave fez à API, com <Code>request_id</Code>. É o primeiro sítio a abrir quando algo responde o que não esperava. Para quem mudou o quê no workspace, é a <a href="#atividade" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Atividade</a> — outra pergunta, outra página.</LI>
              </UL>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Nenhuma página da Consola apresenta dados ilustrativos. Se uma lista está vazia, é
                porque não há nada — não porque o ecrã ainda não foi ligado.
              </P>
            </Section>
    </>
  );
}

export function PtGuides({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="guias">
              <H2>Guias</H2>
              <PageLede>Guias práticos de integração — cobranças, transferências, reembolsos e webhooks. O enquadramento é <strong>SDK-first</strong>; onde surge curl/HTTP, é material de referência do protocolo.</PageLede>
              <NextSteps label="Relacionado:" links={[{ href: '/docs/reference', text: 'Referência API' }, { href: '/docs/testing', text: 'Testar no Sandbox' }, { href: '/docs/sdk', text: 'SDKs' }]} />
              <P>Guias por tarefa para as superfícies verificadas no Sandbox. Onde surge HTTP/curl, é material de referência do protocolo ou de diagnóstico — o Banzami é SDK-first.</P>
<H3 id="contas-segregadas">Onde o dinheiro cai: configuração financeira e contas <Badge tone="ok" /></H3>
              <P>
                Duas perguntas diferentes, respondidas em sítios diferentes — e é a distinção
                que torna a plataforma segura de usar:
              </P>
              <UL>
                <LI><strong>Quem</strong> é o dono do dinheiro? — responde a <strong>configuração financeira do projeto</strong>. É estabelecido pelo operador, é imutável, e a sua aplicação nunca o indica num pedido.</LI>
                <LI><strong>Qual</strong> conta desse dono recebe? — responde a <strong>wallet account</strong>. Essa a sua aplicação escolhe, entre as suas.</LI>
              </UL>
              <P>
                Uma plataforma de donativos precisa exactamente disto: cada campanha acumula
                na sua própria conta, sem se misturar com as outras, e é dessa conta que se
                liquida no fecho.
              </P>
              <SegregatedAccountsDiagram l={{
                title: 'Contas segregadas: um dono financeiro, uma conta por campanha',
                project: 'O seu projeto',
                owner: 'dono financeiro',
                ownerNote: 'vem da configuração financeira — nunca do seu pedido',
                accounts: ['Campanha A', 'Campanha B', 'Campanha C'],
                accountNote: 'uma wallet account cada',
              }} />
              <P>
                Na prática, com a sua chave de developer:
              </P>
              <UL>
                <LI>Abre uma conta por campanha com <Code>createWalletAccount</Code> — indica o propósito e a sua referência, <strong>nunca</strong> uma wallet ou um merchant.</LI>
                <LI>Cria o pagamento com <Code>createPaymentSession</Code>, passando o <Code>walletAccountId</Code> dessa campanha.</LI>
                <LI>Se omitir o <Code>walletAccountId</Code>, o pagamento cai na conta por omissão do projeto — suficiente para quem não precisa de segregar.</LI>
              </UL>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                O servidor verifica sempre que a conta indicada é sua. Uma conta de outro dono
                responde <Code>404</Code> — não <Code>403</Code> — para que ninguém possa
                descobrir contas alheias pelo código de estado. E indicar
                <Code>merchant_id</Code> ou <Code>wallet_id</Code> é recusado com{' '}
                <Code>400 PAYEE_NOT_ALLOWED</Code>: escolher uma conta é selecção, escolher um
                dono seria autoridade.
              </P>

              <H3 id="cobranca">Criar cobrança <Badge tone="ok" /></H3>
              <P>
                Uma cobrança nasce de um <strong>link de pagamento</strong> ou de uma <strong>sessão de pagamento</strong>: cria a
                intenção, apresenta o link/QR ao pagador e acompanha a confirmação (por polling e/ou webhook). No modelo Banzami,
                o operador executa o pagamento e mantém a verdade financeira — a sua aplicação apenas cria a jornada e reage ao estado.
              </P>
              <UL>
                <LI><strong>Testável no Sandbox:</strong> criar sessões/links, apresentar QR, confirmar pagamento e emitir comprovativo. O QR da sessão codifica o URL da página de pagamento (<Code>pay.banzami.com/pay/{'{slug}'}</Code>): qualquer câmara de telemóvel abre a página de pagamento.</LI>
                <LI><strong>Reservado à Produção:</strong> movimentação de dinheiro real — <em>Produção em preparação</em>.</LI>
              </UL>

              <H3 id="transferencias">Transferências <Badge tone="ok" /></H3>
              <P>
                Movimente valor entre duas contas do seu próprio projeto. O pedido indica a conta de
                origem, a conta de destino, o montante em unidades menores (AOA) e uma{' '}
                <GlossaryTerm id="idempotencia">idempotency key</GlossaryTerm>. A transferência é confirmada de forma
                síncrona no Sandbox, com débito e crédito atómicos no ledger — o total do titular não muda,
                apenas a sua distribuição entre contas.
              </P>
              <P>
                Repetir a mesma idempotency key devolve a transferência original, sem mover fundos duas vezes;
                reutilizá-la com um pedido diferente responde <Code>409</Code>, em vez de repetir em silêncio.
                Validado de ponta a ponta no Sandbox. Nunca há dinheiro real — <em>Produção em preparação</em>.
              </P>
              <Callout tone="warn">
                <strong>O que Transferências é, e o que não é.</strong> Move valor entre duas
                contas do <strong>mesmo titular</strong> que a configuração financeira do seu projeto fixa —
                por exemplo, da Campanha A para a Campanha B da mesma organização. Nada
                atravessa a fronteira do titular: não é payout, não é liquidação de aplicação
                (ADR-029), não é transferência P2P entre consumidores. Indicar uma conta que
                não é sua responde <Code>404</Code>, indistinguível de uma que não existe.
              </Callout>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Credencial: chave de projeto com o scope <Code>transfers:write</Code>, em{' '}
                <Code>POST /v1/wallet-account-transfers</Code>. O
                titular vem da configuração financeira — não existe campo no pedido que o possa indicar. Ver a
                matriz de{' '}
                <a href="/docs/reference#credenciais" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>credenciais</a>.
              </P>

              <H3 id="reembolsos">Reembolsos <Badge tone="ok" /></H3>
              <P>
                Reembolsos Banzami permitem devolver, total ou parcialmente, o valor de um pagamento elegível confirmado no Sandbox.
                Cada pedido identifica a origem do pagamento, respeita o valor já capturado e é processado de forma idempotente.
              </P>
              <UL>
                <LI><Code>ACQUIRING_PAYMENT</Code> — pagamento realizado por um trilho externo.</LI>
                <LI><Code>WALLET_PAYMENT</Code> — pagamento nativo entre carteiras Banzami.</LI>
                <LI>A moeda é confirmada contra a origem original.</LI>
                <LI>Reembolsos parciais são permitidos até ao limite acumulado do pagamento.</LI>
                <LI>Repetir a mesma <Code>idempotency_key</Code> não devolve valor duas vezes.</LI>
                <LI>A Produção permanece <em>Produção em preparação</em>.</LI>
              </UL>

              <P>
                <strong>Campos do pedido:</strong> <Code>source_type</Code> (<Code>ACQUIRING_PAYMENT</Code> ou
                {' '}<Code>WALLET_PAYMENT</Code>), <Code>source_id</Code>, <Code>amount_minor</Code>, <Code>currency</Code>
                {' '}e <Code>idempotency_key</Code>.
              </P>

              <Callout>
                <strong>Percurso verificado em Sandbox.</strong> O reembolso foi validado ponta a ponta através do gateway público
                (<Code>POST /v1/refunds</Code>): origens acquiring e de carteira, reembolsos totais e parciais, limite acumulado por
                origem, validação da moeda contra a origem, repetição idempotente e conflito de <Code>idempotency_key</Code>,
                autorização do pedido e correção do estado do comprovativo. Nunca há dinheiro real — <em>Produção em preparação</em>.
              </Callout>

              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Referência técnica: a origem do pagamento é tipada conforme BANZA ADR-017. Credencial: chave de projeto
                com o scope <Code>refunds:write</Code>, em <Code>POST /v1/refunds</Code>. O reembolso debita a
                conta que <strong>recebeu</strong> o pagamento — não o saldo geral do titular — e um pagamento de outro
                projeto responde <Code>404</Code>. Ver a matriz de{' '}
                <a href="/docs/reference#credenciais" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>credenciais</a>.
              </P>
              <H3 id="comprovativos">Comprovativos e verificação pública</H3>
              <P>
                Cada pagamento confirmado tem um <strong>comprovativo</strong>: um documento com uma{' '}
                <strong>referência de prova pública</strong> e um QR. Quem tiver essa referência pode confirmar,
                sem conta nem chave, que o pagamento existe e em que estado está. O comprovativo em PDF é emitido
                ao Business que recebeu, na app Banzami Business — uma chave de projeto não descarrega comprovativos.
              </P>
              <P><strong>A referência.</strong> O formato actual chama-se <Code>SECURE_V1</Code>:</P>
              <CodeBlock label="formato SECURE_V1" onCopy={copy} raw={`BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX

# 24 símbolos em seis grupos de quatro, depois de BZM-.
# Alfabeto: 0-9 e A-Z sem I, L, O e U — nenhuma letra se confunde com um dígito.
# 120 bits: não se adivinha nem se enumera.`} />
              <UL>
                <LI><strong>É uma capacidade ao portador.</strong> Quem tem a referência vê o montante, os @banza das duas partes e a descrição. Partilhe-a como partilharia o próprio comprovativo.</LI>
                <LI><strong>É exacta.</strong> Não há normalização: letras minúsculas, espaços ou um hífen a mais dão <Code>404</Code>, tal como uma referência que não existe. Copie-a, não a reescreva.</LI>
                <LI>Referências antigas de oito símbolos (<Code>BZM-XXXX-XXXX</Code>) continuam verificáveis; as novas são sempre <Code>SECURE_V1</Code>.</LI>
              </UL>
              <P><strong>Verificar.</strong> O QR do comprovativo abre <Code>https://banzami.com/r/&#123;referência&#125;</Code>, a página pública de verificação. A mesma verificação existe como API pública, sem autenticação:</P>
              <CodeBlock label="curl · verificar um comprovativo" onCopy={copy} raw={`curl https://sandbox-api.banzami.com/v1/public/proofs/BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`} />
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>HTTP</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Resposta</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>Significa</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['200', 'status do comprovativo + montante, partes, data', 'Verificado. Leia status: CONFIRMED, PENDING, REVERSED, CANCELLED, FAILED ou EXPIRED.'],
                      ['404', 'exists: false, status NOT_FOUND', 'Não existe — ou a referência foi alterada. As duas respostas são iguais de propósito.'],
                      ['503', 'exists: false, status UNAVAILABLE', 'A verificação está temporariamente indisponível. Tente mais tarde; não conclua que é falso.'],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: INK, fontWeight: 700 }}><Code>{r[0]}</Code></td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[1]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UL>
                <LI><strong>Reembolsado ou revertido</strong>, o comprovativo não desaparece: passa a <Code>REVERSED</Code>. A prova de que o pagamento existiu continua, e diz que foi desfeito.</LI>
                <LI>
                  <strong>Não confunda com a referência curta da app.</strong> A app Banzami mostra uma referência de
                  oito caracteres em cada transferência (por exemplo <Code>5AD6BEA0</Code>): é o início do id da
                  transferência, serve para a pessoa a reconhecer na lista, e <strong>não se verifica</strong> em{' '}
                  <Code>/r/</Code>. Só a referência <Code>BZM-…</Code> do comprovativo é uma prova pública.
                </LI>
              </UL>
            </Section>
<Section id="webhooks">
              <H2>Webhooks <Badge tone="ok" /></H2>
              <P>
                Use webhooks para confirmar eventos no seu servidor sem depender apenas do browser ou de polling. O Banzami entrega
                cada evento assinado; o seu endpoint verifica a assinatura e reage de forma idempotente.
              </P>
              <Callout>
                <strong>Jornada completa verificada em Sandbox.</strong> A entrega ponta a ponta foi confirmada contra o endpoint DOA
                implementado: uma <Code>payment_session.paid</Code> real emitida pelo operador foi entregue pelo outbox, o header canónico
                <Code>banza-signature</Code> foi aceite, a doação foi confirmada <strong>uma única vez</strong> e o comprovativo foi
                registado. No teste controlado, não foi enviado email externo; nos fluxos normais com contacto por email, o DOA
                entrega o recibo ao doador. A reentrega do mesmo evento foi <strong>deduplicada</strong> (sem efeito duplicado).
                Nunca há dinheiro real — <em>Produção em preparação</em>.
              </Callout>
              <Callout>
                <strong>Âmbito honesto.</strong> A entrega outbound é real e foi verificada de ponta a ponta: o Banzami emite{' '}
                <Code>payment_session.paid</Code> porque dinheiro se moveu, a sua outbox entrega sobre a internet pública ao
                endpoint HTTPS registado, e o DOA aceita-o. Esta secção dizia que a entrega para um sink externo permanecia
                simulada — era verdade quando foi escrita e deixou de o ser. O que continua a não existir é <strong>Produção</strong>:
                isto é o Sandbox, e nunca há dinheiro real.
              </Callout>
              <H3 id="como-funciona">Como funciona</H3>
              <UL>
                <LI>O Banzami envia um <Code>POST</Code> para o seu endpoint com o corpo do evento em JSON.</LI>
                <LI>A assinatura vai no header <GlossaryTerm id="banza-signature" code>banza-signature</GlossaryTerm>, no formato <Code>t=&lt;unix&gt;,v1=&lt;hmac_sha256_hex&gt;</Code>.</LI>
                <LI>A assinatura é <GlossaryTerm id="hmac-sha256">HMAC-SHA256</GlossaryTerm> sobre <Code>&quot;{'{'}t{'}'}.{'{'}corpo{'}'}&quot;</Code>, com uma janela de repetição de <strong>5 minutos</strong>.</LI>
                <LI>Processe de forma <strong>idempotente</strong> e responda <Code>2xx</Code> rapidamente; a entrega é <GlossaryTerm id="at-least-once" code>at-least-once</GlossaryTerm>, sem garantia de ordem, com <GlossaryTerm id="replay">reentrega</GlossaryTerm> em caso de falha.</LI>
              </UL>
              <Callout tone="warn">
                <strong>Verifique a assinatura antes de analisar o evento.</strong> Leia o corpo em bruto,
                confirme-o contra o <Code>banza-signature</Code>, e só depois trate o JSON como algo que
                veio do Banzami. Qualquer pessoa na internet pública pode fazer POST ao seu endpoint; até a
                assinatura bater certo, o corpo é a afirmação de um desconhecido sobre o seu dinheiro.
                Reserializar o JSON antes de verificar muda os bytes e a assinatura deixa de bater certo — leia-o
                uma vez, como texto.
              </Callout>
              <CodeBlock label="ts · verificar e tratar um evento" raw={SAMPLE_WEBHOOK} onCopy={copy} />
              <CodeBlock label="json · envelope do evento (implementado no Sandbox)" raw={SAMPLE_WEBHOOK_ENVELOPE} onCopy={copy} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                O envelope acima é a forma implementada no Sandbox: <Code>id</Code> (deduplique por ele), <Code>type</Code> (um dos
                eventos do catálogo verificado abaixo), <Code>created_at</Code> e <Code>data</Code> com o objeto do evento.
              </P>
              <H3 id="reentrega">Contrato de reentrega</H3>
              <UL>
                <LI>Entrega <GlossaryTerm id="at-least-once" code>at-least-once</GlossaryTerm>, sem garantia de ordem — trate cada evento de forma <strong>idempotente</strong> (deduplique pelo id do evento).</LI>
                <LI>Assinatura no header <Code>banza-signature</Code> com tolerância de timestamp (<GlossaryTerm id="replay">replay</GlossaryTerm>) de <strong>5 minutos</strong>.</LI>
                <LI>Implementado no Sandbox: até <strong>5 tentativas</strong> por entrega — a primeira e, depois de cada falha, novas tentativas ao fim de{' '}
                  <Code>1&nbsp;min</Code> → <Code>5&nbsp;min</Code> → <Code>30&nbsp;min</Code> → <Code>2&nbsp;h</Code>. À quinta falha a entrega fica <Code>FAILED</Code>; pode reentregá-la.</LI>
                <LI>Qualquer resposta <Code>2xx</Code> do seu endpoint conta como entregue; responda rapidamente e processe de forma assíncrona.</LI>
                <LI><em>Nota:</em> este é o contrato implementado e verificado no Sandbox; o comportamento de Produção não é reivindicado (Produção em preparação).</LI>
              </UL>
              <H3 id="gerir-endpoint">Gerir o endpoint com a sua chave de projeto <Badge tone="ok" /></H3>
              <P>
                O endpoint que recebe os <strong>seus</strong> eventos gere-se com a
                <strong> chave do projeto</strong> — não é preciso (nem possível) usar uma
                credencial de merchant. O dono vem da configuração financeira do projeto; nenhum destes
                pedidos aceita um <Code>merchant_id</Code>, porque não existe campo para isso.
              </P>
              <CodeBlock label="ts · registar e rodar o segredo" raw={SAMPLE_WEBHOOK_MANAGE} onCopy={copy} />
              <UL>
                <LI>O <Code>secret</Code> é devolvido <strong>uma única vez</strong>, no registo e na rotação. Nenhuma leitura posterior o traz — guarde-o de imediato.</LI>
                <LI><Code>webhooks:read</Code> vê endpoints, eventos e entregas. <Code>webhooks:write</Code> regista, desactiva, reenvia e roda o segredo. Um scope de leitura nunca autoriza uma escrita.</LI>
                <LI>Um endpoint de outro projeto responde <Code>404</Code> — nunca <Code>403</Code> — para que um id não sirva para descobrir integrações alheias.</LI>
              </UL>
              <Callout tone="warn">
                <strong>A rotação é imediata, não sobreposta.</strong> A assinatura é verificada
                contra <em>um</em> segredo. Actualize primeiro o seu receptor e só depois rode —
                ou rode num momento em que uma janela curta de entregas recusadas seja aceitável.
                Como a entrega é <Code>at-least-once</Code> com retries, uma entrega recusada
                nessa janela <strong>não</strong> é um evento perdido: volta a ser tentada.
              </Callout>

              <H3 id="eventos">Eventos</H3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 14px', maxWidth: 660 }}>
                {EVENTS.map((e) => (
                  <span key={e} style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: '#9A1B22', background: '#FFF1F0', border: '1px solid #F7DAD7', borderRadius: 8, padding: '4px 9px' }}>{e}</span>
                ))}
              </div>
              <P>
                A confirmação de pagamento e a liquidação são eventos <strong>distintos</strong>, com efeitos de negócio distintos:
                <Code>payment_session.paid</Code> confirma a doação; <Code>application_settlement.completed</Code> conclui a liquidação da
                campanha. É assim que o <strong>DOA</strong> valida webhooks assinados (<Code>banza-signature</Code>) e reage a cada evento
                de forma idempotente.
              </P>
            
              <H3 id="resolucao">Resolução de problemas</H3>
              <P>
                Os treze problemas que aparecem a sério, e o que fazer com cada um. Em todos,
                guarde o <Code>request_id</Code> da resposta antes de fazer mais nada.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>O que vê</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>O que costuma ser</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>O que fazer</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['401 UNAUTHORIZED', 'A chave falta, foi revogada ou rodada, ou não é uma chave Sandbox.', 'Veja a chave em Chaves de API: se diz Revogada, use a sucessora. Se a criou há segundos, confirme que copiou o segredo inteiro.'],
                      ['403 INSUFFICIENT_SCOPE', 'Falta o scope. Os scopes fixam-se na criação e não mudam.', 'Compare os scopes da chave com os que a rota exige na referência. Se faltar um, crie uma chave nova — a existente nunca o ganhará.'],
                      ['403 PAYMENTS_UNAVAILABLE', 'O projeto não tem configuração financeira concluída.', 'GET /v1/financial-setup diz o estado. Complete a Configuração financeira; até lá o projeto pode tudo menos receber.'],
                      ['404 num recurso que existe', 'Existe, mas é de outro projeto.', 'É deliberado: um 403 aqui deixaria enumerar os recursos alheios. Confirme que está a usar a chave do projeto que criou o recurso.'],
                      ['409 IDEMPOTENCY_KEY_REUSED', 'A mesma Idempotency-Key com um corpo diferente.', 'Uma chave de idempotência pertence a um pedido. Se o corpo mudou, é outro pedido: use outra chave.'],
                      ['400 MISSING_FIELD · INVALID_AMOUNT', 'Um campo em falta ou com o tipo errado.', 'A mensagem nomeia o campo. Montantes são inteiros em unidades menores — 250 Kz são 25000, não 250.'],
                      ['429 RATE_LIMITED', 'Demasiados pedidos, ou demasiados códigos pedidos.', 'Abrande e repita com backoff. Repetir imediatamente prolonga a janela em vez de a encurtar.'],
                      ['Um pagamento fica pendente', 'O pagador ainda não concluiu.', 'Um pagamento pendente é um estado normal, não um erro. Espere pelo webhook; não confirme nada a partir de um tempo-limite.'],
                      ['O webhook não chega', 'O endpoint não é HTTPS público, ou responde lento.', 'Veja as entregas do evento na Consola: mostram o código devolvido pelo seu servidor. Um 2xx lento é tratado como falha.'],
                      ['A assinatura não bate certo', 'O corpo foi reserializado antes de verificar.', 'Verifique sobre o corpo EM BRUTO. Ler o JSON e voltar a serializá-lo muda os bytes, e a assinatura é sobre os bytes.'],
                      ['Um reembolso é recusado', 'O montante excede o que resta, a conta que recebeu já não tem saldo, ou o pagamento não é reembolsável.', 'A mensagem e o código dizem qual (REFUND_EXCEEDS_CAPTURED, REFUND_NOT_FUNDABLE, INVALID_PAYMENT_STATUS). Nada foi devolvido: corrija e repita com uma chave de idempotência nova.'],
                      ['O comprovativo não se verifica', '404: a referência não existe ou foi alterada. 503: a verificação está indisponível.', 'Copie a referência BZM-… sem a reescrever — não há normalização. Um 503 repete-se mais tarde e não quer dizer que o comprovativo é falso.'],
                      ['Uma liquidação não avança', 'A conta não tem saldo, ou o beneficiário não é elegível.', 'GET /v1/financial-setup mostra o que bloqueia. O bruto é lido da conta: uma conta vazia não tem nada para liquidar.'],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: INK, fontWeight: 700, whiteSpace: 'nowrap' }}>{r[0]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[1]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout tone="warn">
                Quando pedir ajuda, envie o <Code>request_id</Code>, o carimbo temporal, o ambiente
                e a operação. <strong>Nunca envie a chave, o segredo do webhook, um código OTP ou um
                token de sessão</strong> — nada do que precisamos para ajudar é um segredo.
              </Callout>
              </Section>
    </>
  );
}

export function PtDoa({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="doa">
              <H2>Implementação de referência — DOA</H2>
              <PageLede>Uma aplicação real, a correr, que integra o Banzami exactamente pelos contratos públicos desta documentação.</PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/console', text: 'A Consola' }, { href: '/docs/guides', text: 'Guias' }, { href: '/docs/reference', text: 'Referência API' }]} />

              <H3 id="doa-o-que-e">O que o DOA é, e porque está aqui</H3>
              <P>
                O <a href="https://www.doadoa.app" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>DOA</a>{' '}
                é uma plataforma de vaquinhas angolana. Alguém cria uma campanha, partilha um link
                ou um QR, e quem quiser doa em Kwanzas. É uma aplicação a sério, com doadores a
                sério, a correr no Sandbox do Banzami.
              </P>
              <Callout>
                <strong>O DOA não é um inquilino especial.</strong> Não tem endpoints próprios, nem
                scopes próprios, nem um caminho de código que o nomeie. Faz exactamente o que
                qualquer integração faz, com os mesmos contratos que estão nesta documentação —
                que é precisamente o que o torna útil como exemplo. Se algo aqui só funcionasse
                para o DOA, não estaria documentado.
              </Callout>

              <H3 id="doa-fronteira">A fronteira: o que é seu, e o que é do Banzami</H3>
              <P>
                Esta é a decisão mais importante de qualquer integração, e a mais fácil de errar
                na direcção cara: reimplementar dinheiro.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>O DOA é dono de</th>
                    <th style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7' }}>O Banzami é dono de</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['Campanhas: criar, editar, encerrar', 'O dinheiro: saldos, contas, o livro-razão'],
                      ['A experiência do doador', 'A execução do pagamento'],
                      ['O estado da campanha (ativa, encerrada, liquidada)', 'O preço e a taxa'],
                      ['Quem pode gerir o quê, do lado do DOA', 'Os recibos e a sua verificação pública'],
                      ['A lógica de negócio da aplicação', 'A liquidação para o beneficiário'],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: INK, fontWeight: 600 }}>{r[0]}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{r[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <SegregatedAccountsDiagram l={{
                title: 'Contas segregadas: um dono financeiro, uma conta por campanha',
                project: 'O seu projeto',
                owner: 'dono financeiro',
                ownerNote: 'vem da configuração financeira — nunca do seu pedido',
                accounts: ['Campanha A', 'Campanha B', 'Campanha C'],
                accountNote: 'uma wallet account cada',
              }} />
              <P>
                O DOA nunca guarda um saldo seu. Quando precisa de saber quanto uma campanha
                recebeu, pergunta ao Banzami — porque a alternativa é ter dois números que um dia
                divergem, e nesse dia um deles está errado sem que ninguém saiba qual.
              </P>

              <H3 id="doa-preparar">Preparar o projeto</H3>
              <P>
                Tudo o que o DOA faz começa como qualquer outra integração — uma conta de developer, um
                workspace e um projeto. O DOA não recebeu nenhum destes passos de forma diferente.
              </P>
              <ol style={{ margin: '0 0 14px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Entre na <a href="/docs/console" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Consola</a>, crie um <strong>workspace</strong> e, dentro dele, um <strong>projeto</strong> para a aplicação.</LI>
                <LI>
                  Faça a <strong>configuração financeira</strong>. O DOA recebe doações para beneficiários,
                  por isso precisa de um Business. Há dois caminhos: <strong>candidatar um Business novo</strong>,
                  que o Banzami revê antes de o projeto poder receber; ou <strong>ligar um Business que já
                  existe</strong> com o código de consentimento que o seu dono gera na app Banzami Business.
                  Ver <a href="/docs/get-started#configuracao-financeira" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Configuração financeira</a>.
                </LI>
                <LI>
                  Crie uma <strong>chave secreta</strong> com os scopes que este padrão usa, e só esses:{' '}
                  <Code>identity:read</Code>, <Code>wallet_accounts:create</Code>, <Code>wallet_accounts:read</Code>,{' '}
                  <Code>payment_sessions:write</Code>, <Code>payment_sessions:read</Code>,{' '}
                  <Code>webhooks:write</Code>, <Code>webhooks:read</Code> e{' '}
                  <Code>application_settlements:write</Code>. A liquidação tem um scope próprio: poder
                  receber pagamentos nunca dá, por arrasto, poder pagar dinheiro para fora.
                </LI>
                <LI>Instale o SDK no servidor: <Code>npm install @banzami/sdk</Code>.</LI>
                <LI>
                  Configure o servidor com <Code>BANZAMI_API_KEY</Code> (a chave <Code>bz_test_sk_</Code>) e{' '}
                  <Code>BANZAMI_WEBHOOK_SECRET</Code> (o segredo do endpoint, que aparece uma vez quando o regista). Se o
                  perfil de preço da sua empresa aplicar uma taxa às liquidações, também{' '}
                  <Code>BANZAMI_FEE_DESTINATION</Code>: o @banza da conta da sua empresa que a recebe. Nenhum merchant_id,
                  nenhum wallet_id.
                </LI>
                <LI>
                  Antes de deixar activar uma campanha, pergunte se o projeto já pode receber:{' '}
                  <Code>getFinancialSetup()</Code>. É assim que o DOA deixa criar campanhas e não as deixa
                  activar enquanto a configuração financeira não está concluída.
                </LI>
              </ol>

              <H3 id="doa-fluxo">O percurso completo</H3>
              <DonationFlowDiagram title="Do doador à liquidação: quem faz o quê, e com que chamada" steps={[
                { actor: 'Doador', what: 'escolhe a campanha e indica o montante', how: 'lógica de negócio do DOA' },
                { actor: 'DOA', what: 'pede uma sessão de pagamento', how: 'POST /v1/payment-sessions' },
                { actor: 'Banzami', what: 'devolve link e QR', how: 'GET /v1/payment-sessions/{id}/link · /qr' },
                { actor: 'Doador', what: 'paga na superfície do Banzami' },
                { actor: 'Banzami', what: 'move o dinheiro e regista a verdade financeira' },
                { actor: 'webhook', what: 'payment_session.paid — assinado, at-least-once', how: 'o DOA verifica a assinatura e processa idempotentemente' },
                { actor: 'DOA', what: 'marca a doação confirmada', how: 'estado do DOA' },
                { actor: 'DOA', what: 'fecha a campanha e pede a liquidação', how: 'POST /v1/application-settlements' },
                { actor: 'webhook', what: 'application_settlement.completed — bruto, taxa e líquido' },
              ]} />
              <P>
                O doador paga numa página do Banzami, não do DOA. A sessão devolve um link para{' '}
                <Code>pay.banzami.com/pay/…</Code> e um QR que codifica esse mesmo endereço; o DOA mostra
                um ou outro e não constrói nenhum pedido financeiro. Quando o doador volta à página do DOA,
                isso não prova nada — a confirmação chega pelo webhook, ou lendo a sessão no servidor.
              </P>

              <H3 id="doa-contas">Uma conta por campanha</H3>
              <P>
                Cada campanha do DOA tem a sua própria conta segregada sob a carteira do DOA. É
                por isso que o saldo de uma campanha é uma pergunta com resposta, e não uma soma
                que a aplicação tem de manter.
              </P>
              <CodeBlock label="conta por campanha" onCopy={copy} raw={`// Ao activar a campanha, o DOA abre a conta que a vai receber.
const conta = await banzami.createWalletAccount({
  purpose:       'CAMPAIGN',
  referenceType: 'CAMPANHA',
  referenceId:   campanha.id,      // a SUA referência, não a nossa
  label:         campanha.titulo,
});

// Guarde o id. É por ele que a liquidação sabe de onde tirar o dinheiro.
await db.campanhas.update(campanha.id, { banzami_wallet_account_id: conta.id });`} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                <Code>reference_type</Code> e <Code>reference_id</Code> são seus: o Banzami guarda-os
                e devolve-os, e nunca os interpreta. É assim que se liga a sua tabela à nossa sem
                que nenhuma das duas precise de conhecer a outra.
              </P>

              <H3 id="doa-webhook">O webhook, como o DOA o processa</H3>
              <CodeBlock label="webhook" onCopy={copy} raw={`export async function POST(req) {
  // 1. O corpo EM BRUTO. Voltar a serializar o JSON muda os bytes,
  //    e a assinatura deixa de bater certo.
  const raw = await req.text();

  // 2. Verificar ANTES de olhar para o conteúdo. constructEvent faz as duas
  //    coisas pela ordem certa: verifica a assinatura e só então devolve o
  //    evento. Não faça JSON.parse(raw) à parte — isso é ler antes de verificar.
  //    (o cliente foi criado com { apiKey, webhookSecret })
  let evento;
  try {
    evento = banzami.webhooks.constructEvent(raw, req.headers.get('banza-signature') ?? '');
  } catch {
    return new Response('assinatura inválida', { status: 400 });
  }

  // 3. Idempotente pelo id do evento. A entrega é at-least-once:
  //    este mesmo evento VAI chegar outra vez, mais cedo ou mais tarde.
  if (await db.eventos.existe(evento.id)) return new Response('ok');
  await db.eventos.registar(evento.id);

  // 4. Só agora o efeito de negócio.
  if (evento.type === 'payment_session.paid') {
    // reference_id é a referência que o DOA deu ao criar a sessão.
    await confirmarDoacao(evento.data.reference_id);
  }

  // 5. 2xx depressa. O trabalho demorado vai para uma fila, não para aqui.
  return new Response('ok');
}`} />
              <Callout tone="warn">
                Os passos 1 e 3 são os que se esquecem. Sem o corpo em bruto a assinatura falha
                por uma razão que parece um bug do Banzami; sem a deduplicação por id de evento,
                uma reentrega normal duplica a doação.
              </Callout>

              <H3 id="doa-comprovativo">O comprovativo do doador</H3>
              <P>
                Quando o doador paga, o Banzami emite o <strong>comprovativo</strong> do pagamento — não o DOA. O doador
                recebe-o na app Banzami, com uma referência pública <Code>BZM-…</Code> e um QR que abre{' '}
                <Code>https://banzami.com/r/&#123;referência&#125;</Code>. O recibo da doação que o DOA envia é outra coisa: é
                do DOA, diz que campanha recebeu, e pode citar essa referência.
              </P>
              <P>
                Qualquer pessoa confirma o comprovativo, sem conta e sem chave, com{' '}
                <Code>GET /v1/public/proofs/&#123;referência&#125;</Code>: <Code>200</Code> com o estado e o montante, ou{' '}
                <Code>404</Code> se não existe ou foi alterada. Quem tem a referência vê o montante e os @banza das partes —
                partilhe-a como partilharia o próprio comprovativo. Ver{' '}
                <a href="/docs/guides#comprovativos" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Comprovativos e verificação pública</a>.
              </P>

              <H3 id="doa-liquidacao">A liquidação, e quem decide o quê</H3>
              <P>
                Quando uma campanha encerra, o DOA pede a liquidação da conta dessa campanha. O
                pedido não leva montante nem taxa — e não é uma omissão por conveniência: é o
                desenho.
              </P>
              <CodeBlock label="liquidação" onCopy={copy} raw={`const liquidacao = await banzami.createBusinessApplicationSettlement({
  sourceAccountId:      campanha.banzami_wallet_account_id,
  beneficiaryBanzaName: campanha.destino_banza,     // o @banza de quem recebe
  // Para onde vai a taxa, quando o seu perfil de preço aplica uma. Tem de ser uma
  // conta da SUA empresa, de tipo APPLICATION ou PLATFORM. Sem ela, uma
  // liquidação com taxa é recusada com 422 FEE_DESTINATION_REQUIRED.
  feeDestinationBanzaName: process.env.BANZAMI_FEE_DESTINATION,
  referenceType:        'CAMPANHA',
  referenceId:          campanha.id,                // a sua referência, devolvida no webhook
  // Uma liquidação move dinheiro: a chave de idempotência é obrigatória e
  // tem de sobreviver a um timeout. Guarde-a antes de fazer o pedido.
  idempotencyKey:       'idem_liquidacao_' + campanha.id,
});

// O que volta já é o resultado, calculado pelo Banzami:
// {
//   gross_amount_minor:     100000,   // lido do saldo da conta, não enviado por si
//   application_fee_minor:    2000,   // preço atribuído ao Business (200 bps)
//   net_amount_minor:        98000,   // o que vai para o beneficiário
//   currency: "AOA", status: "COMPLETED"
// }
// -100000 + 2000 + 98000 = 0`} />
              <P>
                E as três parcelas somam zero contra o movimento, que é a propriedade que torna
                isto auditável: <Code>-100000 + 2000 + 98000 = 0</Code>. O montante bruto é o saldo
                da conta no momento do pedido; a taxa é a do perfil de preço que o Banzami atribuiu à sua
                empresa, e não um campo que possa enviar.
              </P>
              <Callout>
                <strong>Pagamento não é liquidação.</strong> Um pagamento confirmado põe dinheiro
                na conta da campanha. A liquidação é um segundo acto, pedido por si, que tira o
                dinheiro de lá. O DOA pede-a depois de a campanha encerrar — não acontece sozinha.
              </Callout>

              <H3 id="doa-credenciais">Rodar e revogar credenciais</H3>
              <UL>
                <LI><strong>Rodar a chave.</strong> Crie uma chave nova com os mesmos scopes, ponha-a no servidor, confirme que <Code>GET /v1/me</Code> responde, e só então revogue a antiga. A revogação é imediata: a chamada seguinte com a chave antiga responde <Code>401</Code>.</LI>
                <LI><strong>Rodar o segredo do webhook.</strong> <Code>rotateWebhookEndpointSecret</Code> devolve um segredo novo, uma vez. A troca é imediata, não sobreposta: actualize <Code>BANZAMI_WEBHOOK_SECRET</Code> no servidor antes de rodar, ou as entregas seguintes falham a verificação.</LI>
                <LI><strong>Suspeita de fuga.</strong> Revogue primeiro e investigue depois. Uma chave revogada não se reactiva; cria-se outra.</LI>
              </UL>

              <H3 id="doa-problemas">Quando algo não corre como esperado</H3>
              <UL>
                <LI><Code>403 PAYMENTS_UNAVAILABLE</Code> ao criar a sessão — o projeto ainda não tem configuração financeira concluída. Veja o estado na Consola ou com <Code>getFinancialSetup()</Code>. Repetir não ajuda.</LI>
                <LI><Code>403 INSUFFICIENT_SCOPE</Code> — a chave não tem o scope da operação; a mensagem diz qual. Crie uma chave com esse scope. Os scopes não se acrescentam a uma chave existente.</LI>
                <LI><strong>O webhook não chega.</strong> Veja as entregas do endpoint na Consola: o código de resposta do seu servidor e a hora da tentativa. Um endpoint que responde fora de <Code>2xx</Code> recebe a entrega outra vez.</LI>
                <LI><strong>A assinatura não verifica.</strong> Quase sempre é o corpo: foi lido como JSON e voltou a ser serializado. Verifique sobre o corpo em bruto, com o segredo actual do endpoint.</LI>
                <LI><strong>O mesmo evento duas vezes.</strong> É o comportamento esperado — a entrega é at-least-once. Trate pelo <Code>id</Code> do evento e ignore o que já processou.</LI>
                <LI><strong>A liquidação é recusada.</strong> A conta de origem tem de ser uma conta sua com saldo, e o beneficiário um <Code>@banza</Code> existente. Repita com a <strong>mesma</strong> chave de idempotência: uma liquidação que chegou a acontecer não acontece duas vezes.</LI>
                <LI><strong>Ao pedir ajuda</strong>, envie o <Code>request_id</Code> da resposta, a hora e a operação. Nunca envie a chave, o segredo do webhook nem um código de entrada. Ver <a href="/docs/trust#suporte" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Suporte</a>.</LI>
              </UL>

              <H3 id="doa-licoes">O que o DOA aprendeu pelo caminho</H3>
              <UL>
                <LI><strong>Nunca duplicar um saldo.</strong> O DOA mostra o que o Banzami diz. Dois números que deviam ser iguais acabam por não ser, e depois alguém tem de decidir qual é o verdadeiro.</LI>
                <LI><strong>Guardar o <Code>request_id</Code> de tudo.</strong> É a primeira coisa que o suporte pede e a última que alguém pensa em registar.</LI>
                <LI><strong>Uma conta por campanha, desde o início.</strong> Separar valor depois de estar misturado é muito mais difícil do que nunca o misturar.</LI>
                <LI><strong>O estado da campanha é do DOA; o estado do dinheiro é do Banzami.</strong> Uma campanha encerrada com uma liquidação pendente é um estado normal, e a aplicação tem de o saber mostrar.</LI>
                <LI><strong>A prontidão financeira é uma condição, não um erro.</strong> Antes de a Configuração financeira estar completa, o DOA deixa criar campanhas e não deixa activá-las — em vez de deixar tudo e falhar no pagamento.</LI>
              </UL>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Os exemplos acima são mínimos e estão saneados: identificadores fictícios, nenhuma
                chave, nenhum segredo e nenhum id interno. O que se quer ensinar é o padrão
                recomendado, não a história de como o DOA lá chegou.
              </P>
            </Section>
    </>
  );
}

export function PtReference({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="api-reference">
              <H2>API Reference</H2>
              <PageLede>Camada de <strong>referência do protocolo</strong> (API/OpenAPI). <strong>Não é o caminho de implementação recomendado</strong> — o Banzami é SDK-first; use esta referência para diagnóstico, auditoria e integradores avançados.</PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/artifacts', text: 'Artefactos' }, { href: '/docs/guides', text: 'Guias' }, { href: '/docs/sdk', text: 'SDKs' }]} />
              <P>A referência separa-se em duas áreas: o que gere na <strong>Console</strong> e o que a sua aplicação chama na <strong>camada de integração</strong>.</P>
              <P>
                A sua aplicação autentica-se enviando a chave Sandbox <Code>bz_test_</Code> directamente no header{' '}
                <Code>Authorization: Bearer …</Code> e chama a camada de integração em <Code>sandbox-api.banzami.com</Code>.
                As chaves <Code>bz_live_</Code> são <strong>recusadas fail-closed</strong> — não há emissão de chaves de Produção.
              </P>

              <H3 id="gestao-consola">Gestão pela Console</H3>
              <P>
                Workspaces, projetos, membros e <strong>chaves</strong> são geridos no portal Banzami Developers — pela interface,
                com sessão e permissões por papel. Não é uma API pública para chamar diretamente, por isso não expomos aqui os
                seus endpoints internos. A Visão geral, os Webhooks e os Registos mostram os dados reais do projeto —
                pedidos, latências, erros e eventos emitidos, correlacionáveis por <Code>request_id</Code>.
              </P>

              <H3 id="credenciais">Credenciais e capacidades</H3>
              <P>
                Nem todas as capacidades documentadas são chamáveis com a mesma credencial hoje. Esta matriz diz a verdade
                por credencial — para que “Disponível em Sandbox” seja sempre verdade <em>para si</em>, não apenas para a plataforma:
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Capacidade</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Credencial</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Consola — entrar, workspaces, projetos, membros, chaves', 'Sessão OTP (email + código)', 'Operacional em Sandbox'],
                      ['Consola — Transações, Webhooks, Registos e Atividade do workspace', 'Sessão OTP (email + código)', 'Dados reais do projeto e do workspace'],
                      ['GET /v1/me (identidade da chave)', 'Chave developer bz_test_ (scope identity:read)', 'Disponível em Sandbox'],
                      ['Sessões de pagamento', 'Chave developer (payment_sessions:write / :read, projeto com configuração financeira concluída)', 'Disponível em Sandbox'],
                      ['Payment links', 'Chave developer (payment_links:write / :read, projeto com configuração financeira concluída)', 'Disponível em Sandbox'],
                      ['Registo de endpoints de webhooks (POST /v1/webhooks/endpoints)', 'Chave de projeto (webhooks:write); leitura com webhooks:read', 'Disponível em Sandbox — o segredo é devolvido uma única vez'],
                      ['Entrega outbound de webhooks', '—', 'Disponível em Sandbox — entregas reais, assinadas, para o seu endpoint HTTPS'],
                      ['Reembolsos (POST /v1/refunds)', 'Chave de projeto (refunds:write)', 'Disponível em Sandbox — o reembolso debita a conta que recebeu o pagamento'],
                      ['Transferências (POST /v1/wallet-account-transfers)', 'Chave de projeto (transfers:write)', 'Disponível em Sandbox — entre contas do mesmo titular do projeto'],
                      ['Financial LIVE / trilhos bancários / fornecedores externos', '—', 'Indisponível · fail-closed'],
                    ] as [string, string, string][]).map(([cap, cred, st]) => (
                      <tr key={cap}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontWeight: 700, color: INK }}>{cap}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{cred}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{st}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H3 id="idempotencia">Idempotência <Badge tone="ok" /></H3>
              <P>
                Envie o header <Code>Idempotency-Key</Code> em qualquer operação de escrita para poder <strong>repetir com
                segurança</strong> um pedido que falhou por rede/timeout, sem risco de duplicar o efeito. O comportamento no
                Sandbox: a resposta original (2xx ou 4xx) é reproduzida para a mesma chave durante <strong>24 horas</strong>,
                por credencial, método e caminho; respostas <Code>5xx</Code> nunca são reproduzidas (o pedido pode ser repetido);
                dois pedidos <strong>simultâneos</strong> com a mesma chave recebem <Code>409 IDEMPOTENCY_CONFLICT</Code> até o
                primeiro terminar — nesse caso, aguarde e repita com a <em>mesma</em> chave. A mesma chave com um corpo
                diferente recebe <Code>409 IDEMPOTENCY_KEY_REUSED</Code>: é outro pedido e precisa de outra chave.
              </P>
              <CodeBlock label="curl · repetição segura com Idempotency-Key" raw={SAMPLE_IDEM_RETRY} onCopy={copy} />

              <H3 id="autenticacao">Autenticação e gestão de chaves <Badge tone="ok" /></H3>
              <UL>
                <LI><strong>Bearer direto:</strong> envie a chave Sandbox no header <Code>Authorization: Bearer bz_test_sk_…</Code> (ou <Code>X-API-Key</Code>). Chaves <Code>bz_live_</Code> são <strong>recusadas fail-closed</strong> — não existe emissão de chaves de Produção.</LI>
                <LI><strong>Separação de ambientes:</strong> chaves <Code>bz_test_</Code> pertencem ao Sandbox; a futura Produção terá chaves próprias, emitidas apenas após a habilitação da plataforma (<em>Produção em preparação</em>).</LI>
                <LI><strong>Segredo só no servidor:</strong> a <Code>bz_test_sk_</Code> nunca vai a browser, app móvel, repositório, logs ou analytics; a <Code>bz_test_pk_</Code> é a única que pode ir no cliente.</LI>
                <LI><strong>Rotação:</strong> rode chaves periodicamente e sempre que houver suspeita de exposição; após rotação, a chave anterior deixa de ser aceite de imediato.</LI>
                <LI><strong>Revogação (comportamento verificado):</strong> uma chave revogada recebe <Code>401 UNAUTHORIZED</Code> em qualquer chamada — verificado no E2E do Sandbox.</LI>
              </UL>

              <H3 id="limites">Limites de pedidos</H3>
              <P>
                Há limites por endereço IP e por chave. Quem os excede recebe <Code>429 RATE_LIMITED</Code> com o
                cabeçalho <Code>Retry-After</Code>, em segundos: espere esse tempo e repita com a mesma chave de
                idempotência. Os valores dos limites não fazem parte do contrato e podem mudar; o comportamento — 429,
                Retry-After, nada executado — faz.
              </P>
              <H3 id="datas">Datas e horas</H3>
              <P>
                Todas as datas na API são UTC, em RFC 3339 (<Code>2026-07-11T11:45:00Z</Code>). Guarde-as assim e
                converta só para mostrar. A Consola mostra-as na hora local do seu browser, e a página pública de
                verificação de comprovativos na hora de Luanda — a hora do acontecimento é sempre a UTC da API.
              </P>
              <H3 id="identificadores">Identificadores a guardar</H3>
              <UL>
                <LI><strong>Project ID</strong> — o seu projeto; não muda quando o nome muda.</LI>
                <LI><strong>Os ids dos recursos</strong> que cria — <Code>session_id</Code>, o id da conta, do reembolso, do endpoint — para os consultar depois.</LI>
                <LI><strong>O seu <Code>reference_id</Code></strong> — o Banzami guarda-o e devolve-o, nos recursos e nos eventos; é assim que liga um pagamento à sua encomenda.</LI>
                <LI><strong>O <Code>id</Code> de cada evento</strong> — para deduplicar entregas repetidas.</LI>
                <LI><strong>A referência <Code>BZM-…</Code> do comprovativo</strong>, quando a tiver — é ela que se verifica publicamente.</LI>
                <LI><strong>O <Code>request_id</Code></strong> de cada resposta que correu mal — é o que o suporte pede.</LI>
              </UL>
              <P>
                Um id não é autoridade. Conhecer o id de um recurso de outro projeto não dá acesso a ele — responde{' '}
                <Code>404</Code> — e nenhum pedido seu leva o id do Business ou da carteira: esses vêm da configuração
                financeira.
              </P>

              <H3 id="referencia-recursos">Referência por recurso</H3>
              <P>
                Referência endpoint a endpoint da superfície pública verificada no Sandbox — método, credencial, headers, corpo do
                pedido, resposta e erros comuns. Apenas recursos com evidência real; nada aqui reivindica Produção.
              </P>
              <ResourceReference lang="pt" onCopy={copy} />

              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Nota sobre credenciais: reembolsos e transferências fazem-se com uma chave de projeto com
                {' '}<Code>refunds:write</Code> e <Code>transfers:write</Code>, em <Code>/v1/refunds</Code> e
                {' '}<Code>/v1/wallet-account-transfers</Code>. Ambos foram verificados ponta a ponta contra o Sandbox publicado, incluindo
                as recusas: uma chave de leitura não escreve, e o pagamento ou a conta de outro projeto respondem <Code>404</Code>.
                Apenas Sandbox — nunca apresente nenhum dos dois como disponível em Produção.
              </P>

              </Section>
<Section id="errors">
              <H2>Errors</H2>
              <P>
                Todas as respostas de erro da camada de integração usam o <strong>mesmo envelope JSON</strong>: um código
                estável, uma mensagem legível e um <Code>request_id</Code> para correlacionar com o suporte. Trate erros pelo
                <Code>code</Code>, nunca pela mensagem.
              </P>
              <CodeBlock label="json · envelope canónico de erro" raw={SAMPLE_ERROR} onCopy={copy} />
              <P>
                Esse <Code>request_id</Code> é pesquisável. Em <strong>Console → Registos → Pedidos à API</strong> cole-o
                para encontrar o pedido exacto: método, caminho, estado, latência e data. Os registos são do seu projeto e
                só do seu projeto, e são guardados durante <strong>30 dias</strong>. O que nunca é guardado: cabeçalho{' '}
                <Code>Authorization</Code>, chaves de API, segredos de webhook, cookies, OTP ou corpo do pedido.
              </P>
              <H3 id="catalogo-de-erros">Catálogo de erros</H3>
              <P>
                Todos os códigos que uma chave de projeto pode receber, e só esses. A lista é gerada a partir do código do
                gateway e verificada contra ele: um código novo que não esteja aqui, ou um código aqui que já não exista,
                falha a verificação. Descreve o <strong>Sandbox</strong>; o comportamento de Financial LIVE não é
                reivindicado.
              </P>
              <ErrorCatalogue lang="pt" />
              <H3 id="erros-consola">Console (acesso e chaves)</H3>
              <UL>
                <LI><Code>INVALID_EMAIL</Code> / <Code>INVALID_CODE</Code> — corrija o email ou peça um novo código OTP.</LI>
                <LI><Code>RATE_LIMITED</Code> — demasiados pedidos; aguarde antes de repetir.</LI>
                <LI><Code>UNAUTHENTICATED</Code> — sessão expirada; inicie sessão novamente.</LI>
                <LI><Code>FORBIDDEN</Code> — sem permissão para a ação (papel ou verificação de origem/CSRF).</LI>
                <LI><Code>CONFLICT</Code> / <Code>LAST_OWNER</Code> — conflito de estado; inclui a proteção do último Owner.</LI>
                <LI><Code>INVITE_INVALID</Code> — convite expirado, revogado ou já usado; peça um novo.</LI>
                <LI><Code>VALIDATION</Code> — dados inválidos; corrija os campos.</LI>
              </UL>
              <H3 id="erros-integracao">Integração</H3>
              <UL>
                <LI><Code>401 UNAUTHORIZED</Code> — a chave falta, foi revogada ou não é Sandbox. A chave <Code>bz_test_sk_</Code> vai directamente em <Code>Authorization: Bearer</Code>; não há token a trocar.</LI>
                <LI>Após uma <strong>rotação</strong>, use a nova chave; a anterior deixa de ser aceite.</LI>
                <LI>Não repita uma operação que move valor sem <strong>chave de idempotência</strong>.</LI>
              </UL>
            </Section>
    </>
  );
}

export function PtTesting({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="testing">
              <H2>Testar no Sandbox</H2>
              <PageLede>Como validar a integração no Sandbox, e o que o Sandbox garante. <strong>Nunca há dinheiro real.</strong></PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/guides', text: 'Guias' }, { href: '/docs/trust', text: 'Segurança' }]} />
              <P><strong>O que o Sandbox é:</strong> um ambiente completo de integração com contas, sessões, links, QR e webhooks de teste — os fluxos comportam-se como os reais, mas <strong>nunca há dinheiro real</strong>.</P>
              <P><strong>O que o Sandbox não é:</strong> não há trilhos live, não há fornecedores externos ativados, não há emissão de chaves de Produção. Todas as credenciais de teste destes exemplos são placeholders.</P>
              <UL>
                <LI><strong>1. Primeira chamada:</strong> <Code>GET /v1/me</Code> com a sua chave — sucesso é <Code>200</Code> com <Code>environment: SANDBOX</Code>; falha típica é <Code>401 UNAUTHORIZED</Code> (chave errada/revogada).</LI>
                <LI><strong>2. Criar uma sessão:</strong> <Code>POST /v1/payment-sessions</Code> — sucesso é <Code>201</Code> com <Code>status: ACTIVE</Code> e as interfaces link/QR.</LI>
                <LI><strong>3. Testar idempotência:</strong> repita o mesmo POST com a mesma <Code>Idempotency-Key</Code> — deve receber a resposta original, sem efeito duplicado; envie duas em simultâneo e uma recebe <Code>409 IDEMPOTENCY_CONFLICT</Code>.</LI>
                <LI><strong>4. Testar erros:</strong> envie <Code>amount_minor: 0</Code> para ver <Code>400 BAD_REQUEST</Code> (omitir o montante não é um erro: cria uma sessão de montante aberto); use uma chave inválida para ver <Code>401</Code>; guarde sempre o <Code>request_id</Code> da resposta.</LI>
                <LI><strong>5. Interpretar resultados:</strong> qualquer resposta com o envelope de erro (ver <a href="/docs/reference#errors" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>) é acionável pelo <Code>code</Code>.</LI>
              </UL>
              <Callout tone="warn">
                Utilitários internos de fundos/simulação do Sandbox existem mas são <strong>internos — não públicos</strong>; não
                fazem parte da superfície documentada.
              </Callout>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                A entrega de webhooks é real, não simulada: o Banzami entrega sobre a internet
                pública ao endpoint HTTPS que registou, assinada, com reentrega em caso de falha
                — ver <a href="/docs/guides#webhooks" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Webhooks</a>.
                Esta página dizia que a entrega outbound permanecia simulada; deixou de ser
                verdade quando a aplicação de referência passou a receber eventos reais.
              </P>
            </Section>
    </>
  );
}

export function PtTrust({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="trust">
              <H2>Segurança</H2>
              <PageLede>Onde as credenciais vivem, o que nunca sai do seu servidor, e o que o Sandbox garante.</PageLede>
              <NextSteps label="Relacionado:" links={[{ href: '/docs/testing', text: 'Testar no Sandbox' }, { href: '/docs/reference#autenticacao', text: 'Autenticação' }, { href: '/docs/guides#webhooks', text: 'Webhooks' }]} />

              <H3 id="chaves">A chave secreta é do servidor, e só dele</H3>
              <P>
                Uma chave <Code>bz_test_sk_…</Code> autoriza tudo o que o seu Projeto pode fazer.
                Quem a tiver pode criar cobranças, mover dinheiro entre as suas contas e pedir
                reembolsos. Por isso vive no servidor e em mais lado nenhum.
              </P>
              <UL>
                <LI><strong>Nunca no browser.</strong> Nem em JavaScript, nem em <Code>localStorage</Code>, nem numa variável <Code>NEXT_PUBLIC_*</Code> — tudo isso é código que o utilizador descarrega e pode ler.</LI>
                <LI><strong>Nunca numa aplicação móvel.</strong> Um binário distribuído é legível; uma chave dentro dele é uma chave publicada.</LI>
                <LI><strong>Nunca no repositório.</strong> Nem num commit, nem num ficheiro de configuração, nem num <Code>.env</Code> versionado. O histórico do git não esquece.</LI>
                <LI><strong>Nunca numa captura de ecrã</strong>, num ticket, num chat ou num email.</LI>
              </UL>
              <P>
                O sítio certo é uma variável de ambiente do processo servidor, lida no arranque,
                fornecida pelo gestor de segredos da sua plataforma.
              </P>

              <H3 id="reveal-once">Revelada uma vez</H3>
              <P>
                Quando cria uma chave na Consola, o valor completo aparece <strong>uma única vez</strong>,
                nesse diálogo. Depois disso a Consola mostra apenas o prefixo e uma máscara: o
                valor não é recuperável a partir do ecrã, do código-fonte da página, da rede ou
                do armazenamento do browser. Se a perder, revogue-a e crie outra — é mais rápido
                do que procurar, e deixa um registo de porquê.
              </P>

              <H3 id="menor-privilegio">Peça só os scopes de que precisa</H3>
              <P>
                Os scopes são escolhidos na criação da chave e não mudam depois. Uma chave que só
                lê nunca poderá escrever, mesmo que o código que a usa tenha um bug — e é isso que
                torna o menor privilégio útil e não apenas arrumado.
              </P>
              <UL>
                <LI>Uma chave por sistema que integra, não uma chave para tudo.</LI>
                <LI>Se a aplicação só consulta o estado de pagamentos, não peça <Code>:write</Code>.</LI>
                <LI>Uma chave comprometida revoga-se sozinha, sem parar os outros sistemas.</LI>
              </UL>

              <H3 id="rotacao">Rotação e revogação</H3>
              <P>
                Rodar uma chave na Consola cria a sucessora e revoga a anterior no mesmo passo. A
                anterior deixa de autenticar imediatamente: uma chamada com ela responde{' '}
                <Code>401</Code>, e a falha é da chave, não do pedido. Para trocar sem falhas no seu
                servidor, crie primeiro uma chave nova com os mesmos scopes, ponha-a em uso, e só depois
                revogue a antiga.
              </P>
              <UL>
                <LI><strong>Rode</strong> quando alguém que teve acesso sai, quando muda de fornecedor de alojamento, ou periodicamente se a sua política o exigir.</LI>
                <LI><strong>Revogue imediatamente</strong> se a chave apareceu algures onde não devia estar — um log, um ecrã partilhado, um repositório público. Revogar é gratuito; assumir que ninguém reparou não é.</LI>
                <LI>A lista de chaves mostra a última utilização, que é como se descobre qual já ninguém usa.</LI>
              </UL>

              <H3 id="segredo-webhook">O segredo do webhook</H3>
              <P>
                O segredo de assinatura é revelado uma vez, tal como a chave, e guarda-se da mesma
                maneira. É com ele que verifica que um <Code>POST</Code> ao seu endpoint veio do
                Banzami e não de alguém que descobriu o URL.
              </P>
              <UL>
                <LI>Verifique a assinatura <strong>antes</strong> de fazer o que quer que seja com o corpo do evento.</LI>
                <LI>Verifique sobre o <strong>corpo em bruto</strong>, exactamente como chegou — reserializar o JSON muda os bytes e a assinatura deixa de bater certo.</LI>
                <LI>Use o verificador do SDK quando existir: a comparação é feita em tempo constante e a janela de repetição já lá está.</LI>
                <LI>Rode o segredo pela Consola se suspeitar dele; o endpoint continua o mesmo.</LI>
              </UL>

              <H3 id="sandbox-garante">O que o Sandbox garante</H3>
              <P>
                O Sandbox é um ambiente completo: contas, cobranças, links, QR, webhooks, reembolsos
                e liquidações comportam-se como se comportariam com dinheiro real, e a entrega de
                webhooks para o seu endpoint é entrega a sério, sobre a internet pública.
              </P>
              <UL>
                <LI><strong>Nunca há dinheiro real.</strong> Os saldos são Kwanzas fictícios; nenhum valor sai de nenhum banco.</LI>
                <LI><strong>Não existe ambiente financeiro Live.</strong> Não é que esteja desligado à espera de um pedido: não existe, e as chaves <Code>bz_live_…</Code> não são emitidas por ninguém.</LI>
                <LI><strong>Os dados são reais o suficiente para doer.</strong> Trate os dados de teste como trataria os de um cliente: não ponha lá dados pessoais de gente verdadeira.</LI>
                <LI><strong>O que a sua chave alcança é o documento OpenAPI, e mais nada.</strong> Não há rotas escondidas para chaves de projeto à espera de serem descobertas: uma verificação no CI compara as rotas que aceitam a sua chave com o documento. As rotas de comerciantes, consumidores e operadores existem, mas recusam a sua chave com <Code>401</Code> ou <Code>403</Code>.</LI>
              </UL>
              <Callout tone="warn">
                Se um SDK, um exemplo ou uma página lhe pedir uma chave <Code>bz_live_…</Code>,
                está a olhar para documentação desactualizada ou para algo que não é nosso. Não
                existem chaves Live.
              </Callout>

              <H3 id="suporte">O que enviar ao suporte — e o que nunca enviar</H3>
              <P>Para investigarmos um pedido precisamos disto, e só disto:</P>
              <UL>
                <LI>O <Code>request_id</Code> da resposta.</LI>
                <LI>O carimbo temporal, com fuso.</LI>
                <LI>O ambiente (<Code>SANDBOX</Code>) e a operação que tentou.</LI>
                <LI>A versão do SDK, se usou um.</LI>
                <LI>O corpo do pedido <strong>sem credenciais</strong>, se for relevante.</LI>
              </UL>
              <Callout tone="warn">
                Nunca envie uma chave de API, um segredo de webhook, um código OTP ou um token de
                sessão — em nenhum canal, a ninguém, incluindo a nós. Nada do que precisamos para
                ajudar é um segredo, e um segredo enviado é um segredo a rodar.
              </Callout>
            </Section>
    </>
  );
}
export function PtArtifacts({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="artefactos-page">
              <H2>Artefactos</H2>
              <PageLede>Artefactos públicos do <strong>Sandbox</strong> — OpenAPI, Postman, matriz de disponibilidade, manifests e exemplos. Não há contrato de Produção porque não há Produção.</PageLede>
              <NextSteps label="Relacionado:" links={[{ href: '/docs/reference', text: 'Referência API' }, { href: '/docs/trust', text: 'Segurança' }, { href: '/docs/changelog', text: 'Changelog' }]} />
<H3 id="artefactos">Artefactos técnicos de referência</H3>
              <P>
                A mesma superfície documentada existe em formato <strong>machine-readable</strong> — <strong>artefactos de
                referência do protocolo</strong>, publicados como ficheiros estáticos. <strong>Não são a recomendação principal
                de integração</strong> (o Banzami é SDK-first), descrevem apenas o âmbito Sandbox atual,
                <strong> não são contratos de Produção</strong>, não são trilhos live, não são aprovação regulatória e não
                substituem os SDKs:
              </P>
              <UL>
                <LI><strong>OpenAPI</strong> (referência do protocolo) — <a href="/developers/openapi/banzami-sandbox.openapi.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/openapi/banzami-sandbox.openapi.json</a> — só os endpoints verificados.</LI>
                <LI><strong>Coleção Postman</strong> (referência do protocolo) — <a href="/developers/postman/banzami-sandbox.postman_collection.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/postman/banzami-sandbox.postman_collection.json</a>.</LI>
                <LI><strong>Exemplos curl</strong> (diagnóstico / referência do protocolo) — <a href="/developers/examples/curl/get-me.sh" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>get-me.sh</a> · <a href="/developers/examples/curl/create-payment-session.sh" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>create-payment-session.sh</a>; fixtures completas em <Code>docs/developer/examples/</Code>.</LI>
                <LI><strong>Matriz de disponibilidade</strong> — <a href="/developers/availability/banzami-developers-availability.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/availability/banzami-developers-availability.json</a> (fonte machine-readable dos estados, verificada por testes).</LI>
                <LI><strong>Manifests</strong> — <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>manifest.json</a> · <a href="/developers/artifacts/sdk-first-manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-first-manifest.json</a> (modelo SDK-first machine-readable; @banzami/sdk e banzami_client publicados, os restantes não).</LI>
              </UL>

                            <P style={{ fontSize: 13, color: '#a89a9e' }}>
                O <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>manifesto de artefactos</a> indexa
                todos os artefactos públicos — OpenAPI, Postman, a matriz de disponibilidade e os
                exemplos. Descrevem o Sandbox, que é o único ambiente que existe.
              </P>
</Section>
    </>
  );
}

export function PtChangelog({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="changelog">
              <H2>Changelog</H2>
              <PageLede>Registo de mudanças de documentação, contrato de API e Sandbox. Não há histórico de lançamentos de produto.</PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/artifacts', text: 'Artefactos' }, { href: '/docs/trust', text: 'Segurança' }]} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Entradas datadas por categoria: <Code>[Docs]</Code> (só documentação), <Code>[API]</Code> (contrato da API),{' '}
                <Code>[Sandbox]</Code> (plataforma Sandbox). Mudanças incompatíveis serão marcadas <Code>[Breaking]</Code>.
                Não há releases de Produção — <em>Produção em preparação</em>.
              </P>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {([
                  ['13 Set 2026', 'Docs', 'Catálogo de erros gerado a partir do gateway, rota a rota, nas duas línguas; tutorial DOA completo, com o destino da taxa na liquidação e o comprovativo do doador; ilustrações em SVG.'],
                  ['13 Set 2026', 'API', 'GET /v1/public/proofs/{ref} publicado na referência e no OpenAPI.'],
                  ['12 Set 2026', 'Sandbox', '@banzami/sdk 0.13.0 publicado em npm; createApplicationSettlement retirado a favor de createBusinessApplicationSettlement.'],
                  ['11 Set 2026', 'API', 'POST /v1/payment-links/{id}/mark-used retirado: responde 410 ROUTE_RETIRED.'],
                  ['10 Set 2026', 'Sandbox', 'Configuração financeira por candidatura revista ou por código de consentimento; a configuração num clique foi retirada.'],
                  ['11 Jul 2026', 'Docs', 'Referência por recurso (PT/EN), guia Testar no Sandbox, autenticação e gestão de chaves, envelope de webhooks e exemplos de repetição idempotente.'],
                  ['11 Jul 2026', 'Docs', 'Exemplos curl com pedido e resposta, matriz credencial↔capacidade, envelope de erros, idempotência em código e contrato de reentrega de webhooks.'],
                  ['Julho 2026', 'Sandbox', 'Consola Sandbox disponível: entrada por email + OTP, workspaces, projetos e chaves de teste.'],
                  ['Julho 2026', 'Sandbox', 'Chaves de teste com rotação e revogação; papéis e convites de equipa.'],
                  ['Julho 2026', 'Docs', 'Documentação pública de developers.'],
                  ['Julho 2026', 'Sandbox', 'DOA publicado como integração de referência (Sandbox).'],
                ] as [string, string, string][]).map(([when, cat, what], i) => (
                  <li key={i} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ flex: 'none', width: 92, fontSize: 12, fontWeight: 800, color: '#a89a9e', fontFamily: mono, paddingTop: 2 }}>{when}</span>
                    <span style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: '#9A1B22', fontFamily: mono, paddingTop: 3 }}>[{cat}]</span>
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: '#5a4a4e', fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{what}</span>
                  </li>
                ))}
              </ul>
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
              <H2>Conceitos</H2>
              <PageLede>Definições dos termos usados nesta documentação, no contexto do Banzami.</PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/get-started', text: 'Começar' }, { href: '/docs/reference', text: 'Referência API' }]} />
              <P>Definições rápidas dos termos usados nesta documentação, no contexto do Banzami.</P>
              <dl style={{ margin: 0, maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {GLOSSARY.map((e) => (
                  <div key={e.id} id={`glossario-${e.id}`} style={{ scrollMarginTop: 80 }}>
                    <dt style={{ margin: 0 }}>
                      {e.code ? (
                        <code style={{ fontFamily: mono, fontSize: 13, background: '#FFF1F0', color: '#9A1B22', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{e.term}</code>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>{e.term}</span>
                      )}
                    </dt>
                    <dd style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#5a4a4e', fontWeight: 500 }}>{e.def}</dd>
                  </div>
                ))}
              </dl>
            </div>
</Section>
    </>
  );
}

