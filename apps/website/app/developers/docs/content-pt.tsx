'use client';

// PT documentation content, split by area (P3A information architecture).
// Every block below was MOVED VERBATIM from the previous single-page
// documentation — same components, same styles, same claim-safety wording.
// Cross-area anchors were remapped to their new routes; nothing was reworded
// except navigation glue. See content-map.ts for the migration map.

import type { ReactNode } from 'react';
import { GlossaryTerm } from './GlossaryTerm';
import { GLOSSARY } from './glossary';
import { BADGES, Badge, Callout, Code, CodeBlock, H2, H3, INK, LI, MUT, NextSteps, P, PageLede, RED, Section, UL, mono, type Tone } from './ui';
import { ResourceReference } from './reference';

export type CopyFn = (text: string, label: string) => void;

// -- Intro capability cards (real links to sub-anchors) -------------------------
const CARDS: { title: string; desc: string; href: string; tone: Tone; badgeTone: Tone; badgeText: string; icon: ReactNode }[] = [
  {
    title: 'Criar cobrança',
    desc: 'Links de pagamento, sessões e QR.',
    href: '/docs/guides#cobranca',
    tone: 'ok',
    badgeTone: 'ok',
    badgeText: 'Disponível em Sandbox',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 8h13l-3-3M20 16H7l3 3" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Transferências',
    // Precise on purpose. The capability moves money between accounts of the
    // SAME project-bound owner and cannot leave it; "entre contas" alone invites
    // a reader to expect arbitrary external transfer.
    desc: 'Movimente valor entre contas do seu projeto.',
    href: '/docs/guides#transferencias',
    tone: 'ok',
    badgeTone: 'ok',
    badgeText: 'Disponível em Sandbox',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 12h13l-3-3M20 12H7" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Webhooks',
    desc: 'Eventos assinados no seu servidor.',
    href: '/docs/guides#webhooks',
    tone: 'ok',
    badgeTone: 'ok',
    badgeText: 'Disponível em Sandbox',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="7" r="2.6" stroke={RED} strokeWidth="1.8" />
        <circle cx="6" cy="17" r="2.2" stroke={RED} strokeWidth="1.8" />
        <circle cx="18" cy="17" r="2.2" stroke={RED} strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    title: 'Reembolsos',
    desc: 'Devolva pagamentos processados.',
    href: '/docs/guides#reembolsos',
    tone: 'ok',
    badgeTone: 'ok',
    badgeText: 'Disponível em Sandbox',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M20 11a8 8 0 10-1 5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M20 5v5h-5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// -- SDK maturity matrix (verified: complete source, none published) ------------
const SDKS: { name: string; lang: string; state: string; tone: Tone; consume: string }[] = [
  { name: '@banzami/sdk', lang: 'TypeScript / Node', state: 'Publicado — servidor, chave secreta', tone: 'ok', consume: 'npm install @banzami/sdk' },
  { name: 'banzami-python', lang: 'Python', state: 'Completo (código-fonte)', tone: 'ok', consume: 'código-fonte / local' },
  { name: 'banzami/sdk', lang: 'PHP (+ Laravel)', state: 'Completo (código-fonte)', tone: 'ok', consume: 'código-fonte / local' },
  // banzami_client is the PUBLIC client SDK; banzami_flutter is Banzami's own
  // application framework and is not published (Banzami ADR-053). Listing the
  // internal one as an integration SDK would send a developer to a package that
  // is not theirs to use.
  { name: 'banzami_client', lang: 'Dart / Flutter (cliente)', state: 'Publicado — cliente público, chave publicável', tone: 'ok', consume: 'dart pub add banzami_client' },
  { name: '@banzami/checkout', lang: 'JavaScript (browser)', state: 'Completo (código-fonte)', tone: 'ok', consume: 'embed / local' },
  { name: 'banzami-go', lang: 'Go', state: 'Parcial — webhooks + payment links', tone: 'val', consume: 'código-fonte / local' },
];

// -- Real operator webhook events (verified emitted names) ----------------------
// Public catalogue — only events whose emission + contract are verified in the
// current Sandbox. Others (payment.completed, transfer.completed, wallet.credit,
// …) are intentionally NOT listed until independently verified.
const EVENTS: string[] = [
  'payment_session.paid',
  'payment_link.paid',
  'application_settlement.completed',
  'application_settlement.cancelled',
  'application_settlement.failed',
];

// -- Code samples (grounded in DOA's verified SDK usage) ------------------------
const SAMPLE_SESSION = `import { BanzamiClient } from '@banzami/sdk';

// A chave secreta bz_test_sk_ vive apenas no servidor.
const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY });

// 1. Criar uma sessão de pagamento.
//    Não indique a conta de destino: com uma chave da Consola, o destinatário
//    vem do binding do projeto. Enviá-la é recusado pela API.
const session = await banzami.createPaymentSession({
  purpose: 'ORDER',
  referenceType: 'PEDIDO',
  referenceId: 'pedido_123',
  amountMinor: 25000,      // 250,00 Kz (menor unidade)
  currency: 'AOA',
  description: 'Pedido #123',
});

// 2. Apresentar o link ou o QR ao pagador
const link = banzami.paymentSessionInterface(session, 'PAYMENT_LINK');
// link.value  ->  https://pay.banzami.com/pay/{slug}`;

// curl-first — a primeira chamada bem-sucedida não exige nenhum SDK.
// Chaves e identificadores são SEMPRE placeholders; tudo é Sandbox-only.
const SAMPLE_CURL_ME = `# Verificar a sua chave de teste (placeholder) contra a API Sandbox
curl https://sandbox-api.banzami.com/v1/me \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX"

# Resposta (200)
{
  "environment": "SANDBOX",
  "project": "meu-projeto",
  "scopes": ["identity:read"],
  "key_status": "ACTIVE"
}`;

const SAMPLE_CURL_SESSION = `# Criar uma sessão de pagamento no Sandbox (valores placeholder).
# Com uma chave developer NÃO se envia wallet_account_id: o destinatário vem
# do binding do projeto e a API recusa um destinatário indicado pelo cliente.
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
    { "type": "DYNAMIC_QR", "value": "<payload>", "format": "QR_PAYLOAD",
      "qr_url": "https://pay.banzami.com/…", "expires_at": "2026-07-11T12:00:00Z" }
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
  "code": "VALIDATION_ERROR",
  "message": "amount_minor must be a positive integer",
  "request_id": "4f3c1b9a2e7d5086c1af03be7d2915ce"
}`;

const SAMPLE_KEYS = `bz_test_pk_XXXXXXXXXXXXXXXX   # publicável — pode ir no cliente
bz_test_sk_XXXXXXXXXXXXXXXX   # secreta — apenas no servidor, revelada uma única vez`;

const SAMPLE_WEBHOOK = `import { BanzamiClient } from '@banzami/sdk';
const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY });

// No seu endpoint de webhook (servidor)
const sig = req.headers['banza-signature'];          // header de assinatura
const event = banzami.webhooks.constructEvent(rawBody, sig);

switch (event.type) {
  case 'payment_session.paid':             /* confirmar a doação (idempotente) */ break;
  case 'application_settlement.completed': /* registar a liquidação */            break;
}

// Responda 2xx rapidamente; a entrega é at-least-once, sem garantia de ordem.`;

const SAMPLE_WEBHOOK_MANAGE = `import { BanzamiClient } from '@banzami/sdk';
const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY });

// Registar o endpoint. Sem merchant, sem wallet: o dono vem do binding do projeto.
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


// -- Simple, faithful flow diagram (verified DOA flow) --------------------------
function FlowDiagram() {
  const steps = ['Utilizador', 'App DOA', 'Banzami', 'Link / QR / Sessão', 'Confirmação', 'Webhook / Comprovativo', 'Liquidação'];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {steps.map((s, i) => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#6a5a5e', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 9, padding: '5px 10px' }}>{s}</span>
          {i < steps.length - 1 ? <span aria-hidden="true" style={{ color: RED, fontWeight: 900 }}>→</span> : null}
        </span>
      ))}
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
                  <Badge tone="prep">Sandbox / Pré-visualização</Badge>
                </div>
                <UL>
                  <LI>Esta é documentação <strong>Sandbox / Pré-visualização</strong>. A capacidade Sandbox está limitada a fluxos de teste controlados.</LI>
                  <LI><strong>Produção e trilhos de dinheiro real não estão disponíveis.</strong> Pay/checkout públicos, trilhos live e fornecedores externos não estão disponíveis.</LI>
                  <LI>A Consola é <strong>operacional em Sandbox</strong>. A Visão geral, os Webhooks e os Registos derivam do tráfego real do seu projeto — nenhuma página da Consola apresenta dados ilustrativos. O âmbito testado é o fluxo API/SDK no Sandbox e a gestão de workspaces, projetos, membros e chaves.</LI>
                </UL>
              </div>

              {/* Interactive capability cards */}
              <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '18px 0 26px' }}>
                {CARDS.map((c) => (
                  <a
                    key={c.title}
                    href={c.href}
                    className="bz-doccard"
                    style={{ position: 'relative', display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 18, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}
                  >
                    <span style={{ position: 'absolute', top: 13, right: 13 }}><Badge tone={c.badgeTone}>{c.badgeText}</Badge></span>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, color: RED }}>
                      {c.icon}
                    </span>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: INK }}>{c.title}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600 }}>{c.desc}</p>
                  </a>
                ))}
              </div>

              <H3>Três camadas</H3>
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
                  <FlowDiagram />
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
              <P>Do primeiro acesso à validação de uma jornada de pagamento, no Sandbox:</P>
              <ol style={{ margin: '0 0 16px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Entre na Consola em <Code>developers.banzami.com/login</Code> com email e código (OTP).</LI>
                <LI>Crie ou escolha um <strong>workspace</strong>.</LI>
                <LI>Crie um <strong>projeto Sandbox</strong>.</LI>
                <LI>Crie uma <strong>chave de teste</strong>.</LI>
                <LI>Guarde a chave <strong>secreta</strong> quando ela aparece — é mostrada uma única vez.</LI>
                <LI><strong>Verifique a chave</strong> contra a API Sandbox com <Code>curl</Code>: <Code>GET /v1/me</Code> devolve o ambiente, projeto, scopes e estado da chave. Esta é a sua primeira chamada bem-sucedida — <strong>não precisa de nenhum SDK</strong>.</LI>
                <LI>Instale o SDK — <Code>npm install @banzami/sdk</Code> — e crie o cliente com a sua chave e <Code>environment: &apos;sandbox&apos;</Code>. Este é o caminho de implementação; o <Code>curl</Code> acima serviu para confirmar a chave.</LI>
                <LI>Crie uma <GlossaryTerm id="sessao-pagamento">sessão de pagamento</GlossaryTerm> e apresente o link/QR.</LI>
                <LI>Acompanhe a confirmação e emita o comprovativo.</LI>
                <LI>Valide webhooks assinados quando aplicável.</LI>
              </ol>
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
                Os SDKs para Python, PHP, Dart e Go ainda <strong>não estão publicados</strong> em
                PyPI, Packagist ou pub.dev — ver{' '}
                <a href="/docs/sdk" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>SDKs</a>.
              </P>

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
              <NextSteps label="A seguir:" links={[{ href: '/docs/guides', text: 'Guias' }, { href: '/docs/testing', text: 'Testar no Sandbox' }, { href: '/docs/trust', text: 'Confiança e prontidão' }]} />
<H3 id="sdk-first">Modelo de integração SDK-first</H3>
              <P>
                A filosofia de integração da Banzami é <strong>SDK-first</strong>. Os SDKs Banzami devem ser o caminho
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
                <a href="/developers/examples/sdk-preview/typescript-payment-session.example.ts" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>TypeScript</a>
                {' '}·{' '}
                <a href="/developers/examples/sdk-preview/python-payment-session.example.py" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Python</a>
                {' '}·{' '}
                <a href="/developers/examples/sdk-preview/php-payment-session.example.php" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>PHP</a>.
              </P>
              <Callout>
                Os exemplos SDK-style são exemplos de ergonomia prevista. Não são instruções de instalação nem prova de
                publicação pública dos pacotes.
              </Callout>

              <H3 id="onboarding-preview">Onboarding do preview SDK</H3>
              <P>
                O preview SDK da Banzami é controlado. Não é um registo público self-service, não publica pacotes em
                registries públicos e não ativa trilhos de Produção.
              </P>
              <P>
                O objetivo do onboarding é permitir que parceiros aprovados validem a integração SDK-first em Sandbox, com
                limites claros, artefactos técnicos verificáveis, feedback estruturado e revisão antes de qualquer avanço
                regulatório ou operacional.
              </P>

              <H3 id="jornada-sandbox">Jornada de integração em Sandbox</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      {['Etapa', 'Objetivo', 'Parceiro', 'Banzami', 'Resultado', 'Não inclui'].map((h) => (
                        <th key={h} style={{ padding: '8px 8px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['1. Elegibilidade', 'Confirmar que o caso de uso cabe no âmbito Sandbox/Preview.', 'Descrever o caso de uso.', 'Avaliar o enquadramento.', 'Decisão de elegibilidade.', 'Acesso a SDKs ou credenciais.'],
                      ['2. Aprovação para preview', 'Formalizar o acesso controlado.', 'Aceitar os limites do preview.', 'Aprovar e definir o âmbito.', 'Aprovação registada.', 'Aprovação de Produção.'],
                      ['3. Preparação técnica', 'Preparar ambiente e equipa.', 'Workspace/projeto Sandbox, chave de teste.', 'Documentação atualizada.', 'Primeira chamada de identidade validada.', 'Dados reais ou de clientes.'],
                      ['4. Acesso controlado ao SDK', 'Disponibilizar o SDK em pré-visualização.', 'Usar apenas o canal aprovado.', 'Fornecer acesso controlado onde aprovado.', 'SDK disponível ao projeto.', 'Publicação pública de pacotes.'],
                      ['5. Integração Sandbox', 'Implementar o fluxo SDK-first.', 'Sessões, idempotência, erros, webhooks.', 'Manter o Sandbox e os limites.', 'Integração funcional em Sandbox.', 'Dinheiro real ou clientes públicos.'],
                      ['6. Validação técnica', 'Percorrer o checklist de validação.', 'Executar e registar evidência (request_id).', 'Critérios e checklist claros.', 'Checklist preenchido.', 'Ativação de trilhos live.'],
                      ['7. Feedback e correções', 'Reportar problemas e corrigir.', 'Relatórios estruturados.', 'Rever o feedback.', 'Issues resolvidas ou registadas.', 'Compromissos de SLA.'],
                      ['8. Revisão de prontidão', 'Rever a evidência contra os critérios.', 'Submeter a evidência.', 'Rever e comunicar o resultado.', 'Parecer de prontidão.', 'Aprovação de Produção ou regulatória.'],
                    ] as string[][]).map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, i) => (
                          <td key={i} style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: i === 0 ? INK : '#5a4a4e', fontWeight: i === 0 ? 700 : 500 }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout tone="warn">
                A aprovação de preview não significa aprovação de Produção. A validação em Sandbox não significa ativação de
                trilhos live. O acesso ao preview SDK não significa publicação pública do SDK. A prontidão técnica não
                significa autorização regulatória.
              </Callout>

              <H3 id="resp-parceiro">Responsabilidades do parceiro no preview</H3>
              <UL>
                <LI>Proteger credenciais e artefactos de preview; nunca expor chaves secretas em browsers/apps móveis.</LI>
                <LI>Usar apenas ambientes Sandbox aprovados; manter dados de teste não sensíveis.</LI>
                <LI>Reportar bugs com <Code>request_id</Code> e timestamp.</LI>
                <LI>Não processar dinheiro real; não fazer onboarding de clientes públicos.</LI>
                <LI>Não promover o acesso de preview como disponibilidade live; não reivindicar aprovação/admissão do BNA com base no preview.</LI>
                <LI>Validar idempotência, tratamento de erros e webhooks; respeitar os limites de disponibilidade/capacidade.</LI>
              </UL>

              <H3 id="resp-banzami">Responsabilidades da Banzami no preview</H3>
              <UL>
                <LI>Fornecer acesso controlado onde aprovado; manter a documentação Sandbox/Preview e os artefactos de referência do protocolo.</LI>
                <LI>Documentar limitações conhecidas; manter o estado dos SDKs honesto; atualizar as matrizes de disponibilidade.</LI>
                <LI>Rever o feedback de integração; manter os testes de claim-safety; evitar overclaims de produção/live.</LI>
                <LI>Disponibilizar critérios de prontidão claros. Sem promessas de SLA, suporte 24/7 ou go-live de Produção.</LI>
              </UL>

              <H3 id="reportar-preview">Como reportar problemas no preview</H3>
              <P>Reporte através do canal de suporte de preview aprovado durante o onboarding. Cada report deve incluir:</P>
              <UL>
                <LI>Ambiente (<Code>Sandbox/Preview</Code>), família SDK e versão de preview, se aplicável.</LI>
                <LI><Code>request_id</Code>, timestamp, endpoint ou método SDK, e <Code>Idempotency-Key</Code> se relevante.</LI>
                <LI>Resultado esperado vs observado; excerto sanitizado de pedido/resposta (placeholders apenas).</LI>
                <LI>Passos de reprodução e severidade.</LI>
              </UL>

              <H3 id="checklist-sandbox">Checklist de validação Sandbox</H3>
              <UL>
                <LI>Identidade/autenticação, criação e consulta de sessões, payment link e payload QR (quando aplicável) validados.</LI>
                <LI>Retry de idempotência testado; pedidos duplicados/concorrentes compreendidos.</LI>
                <LI>Erros de validação e <Code>unauthorized/forbidden</Code> testados; <Code>request_id</Code> capturado nos logs.</LI>
                <LI>Verificação de assinatura de webhooks revista; limitação outbound compreendida; limitação de reembolsos/transferências compreendida.</LI>
                <LI>SDK não usado a partir de registry público; nenhum dinheiro real; nenhum cliente público; nenhum claim de produção/live.</LI>
              </UL>

              <H3 id="prontidao">Critérios de revisão de prontidão</H3>
              <UL>
                <LI>Evidência Sandbox recolhida; logging de <Code>request_id</Code> presente.</LI>
                <LI>Estratégias de idempotência, erros e webhooks documentadas; gestão de secrets revista, sem exposição no cliente.</LI>
                <LI>Sem dependência de capacidades não suportadas, sem pressuposto de dinheiro real, sem claim de produção/live, sem pressuposto de aprovação regulatória; limitações conhecidas aceites.</LI>
              </UL>
              <Callout tone="warn">
                A revisão de prontidão não é aprovação de Produção, não é autorização regulatória e não é ativação de trilhos live.
              </Callout>

              <P>
                Artefactos de onboarding:{' '}
                <a href="/developers/onboarding/sdk-preview-onboarding.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>onboarding</a>
                {' '}·{' '}
                <a href="/developers/onboarding/sandbox-validation-checklist.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>checklist de validação</a>
                {' '}·{' '}
                <a href="/developers/onboarding/partner-responsibilities.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>responsabilidades do parceiro</a>
                {' '}·{' '}
                <a href="/developers/onboarding/preview-issue-report-template.md" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>template de report</a>
                {' '}·{' '}
                <a href="/developers/onboarding/readiness-review-checklist.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>revisão de prontidão</a>.
                {' '}Estes artefactos apoiam o onboarding de preview em Sandbox. Não são contratos de Produção, não ativam
                trilhos live e não representam aprovação regulatória.
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
<H3 id="contas-segregadas">Onde o dinheiro cai: binding e contas <Badge tone="ok" /></H3>
              <P>
                Duas perguntas diferentes, respondidas em sítios diferentes — e é a distinção
                que torna a plataforma segura de usar:
              </P>
              <UL>
                <LI><strong>Quem</strong> é o dono do dinheiro? — responde o <strong>binding do projeto</strong>. É estabelecido pelo operador, é imutável, e a sua aplicação nunca o indica num pedido.</LI>
                <LI><strong>Qual</strong> conta desse dono recebe? — responde a <strong>wallet account</strong>. Essa a sua aplicação escolhe, entre as suas.</LI>
              </UL>
              <P>
                Uma plataforma de donativos precisa exactamente disto: cada campanha acumula
                na sua própria conta, sem se misturar com as outras, e é dessa conta que se
                liquida no fecho.
              </P>
              <pre style={{ margin: '0 0 16px', padding: '14px 16px', borderRadius: 12, border: '1px solid #F2E2E0', background: '#FFF9F8', fontSize: 12.5, lineHeight: 1.6, overflowX: 'auto', color: INK }}>{`O seu projeto
   └── dono financeiro (vem do binding — nunca do seu pedido)
         ├── Campanha A     ← wallet account
         ├── Campanha B     ← wallet account
         └── Campanha C     ← wallet account`}</pre>
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
                <LI><strong>Testável no Sandbox:</strong> criar sessões/links, apresentar QR, confirmar pagamento e emitir comprovativo.</LI>
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
                contas do <strong>mesmo titular</strong> que o binding do seu projeto fixa —
                por exemplo, da Campanha A para a Campanha B da mesma organização. Nada
                atravessa a fronteira do titular: não é payout, não é liquidação de aplicação
                (ADR-029), não é transferência P2P entre consumidores. Indicar uma conta que
                não é sua responde <Code>404</Code>, indistinguível de uma que não existe.
              </Callout>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Credencial: chave de projeto com o scope <Code>transfers:write</Code>. O
                titular vem do binding — não existe campo no pedido que o possa indicar. Ver a
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
              <Callout tone="warn">
                <strong>Âmbito honesto.</strong> No conjunto E2E público da plataforma (Phase 0), a entrega outbound para um
                sink HTTPS público externo foi <strong>simulada</strong> — a emissão, a assinatura HMAC e o contrato de retry
                foram verificados; a jornada DOA acima é o percurso de entrega verificado. <strong>Não reivindicamos a entrega
                de webhooks como disponibilidade pública de Produção.</strong>
              </Callout>
              <H3>Como funciona</H3>
              <UL>
                <LI>O Banzami envia um <Code>POST</Code> para o seu endpoint com o corpo do evento em JSON.</LI>
                <LI>A assinatura vai no header <GlossaryTerm id="banza-signature" code>banza-signature</GlossaryTerm>, no formato <Code>t=&lt;unix&gt;,v1=&lt;hmac_sha256_hex&gt;</Code>.</LI>
                <LI>A assinatura é <GlossaryTerm id="hmac-sha256">HMAC-SHA256</GlossaryTerm> sobre <Code>&quot;{'{'}t{'}'}.{'{'}corpo{'}'}&quot;</Code>, com uma janela de repetição de <strong>5 minutos</strong>.</LI>
                <LI>Processe de forma <strong>idempotente</strong> e responda <Code>2xx</Code> rapidamente; a entrega é <GlossaryTerm id="at-least-once" code>at-least-once</GlossaryTerm>, sem garantia de ordem, com <GlossaryTerm id="replay">reentrega</GlossaryTerm> em caso de falha.</LI>
              </UL>
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
                <LI>Implementado no Sandbox: até <strong>5 tentativas</strong> por entrega, com backoff crescente de{' '}
                  <Code>1&nbsp;min</Code> → <Code>5&nbsp;min</Code> → <Code>30&nbsp;min</Code> → <Code>2&nbsp;h</Code> → <Code>8&nbsp;h</Code> após cada falha.</LI>
                <LI>Qualquer resposta <Code>2xx</Code> do seu endpoint conta como entregue; responda rapidamente e processe de forma assíncrona.</LI>
                <LI><em>Nota:</em> este é o contrato implementado e verificado no Sandbox; o comportamento de Produção não é reivindicado (Produção em preparação).</LI>
              </UL>
              <H3 id="gerir-endpoint">Gerir o endpoint com a sua chave de projeto <Badge tone="ok" /></H3>
              <P>
                O endpoint que recebe os <strong>seus</strong> eventos gere-se com a
                <strong> chave do projeto</strong> — não é preciso (nem possível) usar uma
                credencial de merchant. O dono vem do binding do projeto; nenhum destes
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

              <H3>Eventos</H3>
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
            </Section>
    </>
  );
}

export function PtReference({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="api-reference">
              <H2>API Reference</H2>
              <PageLede>Camada de <strong>referência do protocolo</strong> (API/OpenAPI). <strong>Não é o caminho de implementação recomendado</strong> — a Banzami é SDK-first; use esta referência para diagnóstico, auditoria e integradores avançados.</PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/artifacts', text: 'Artefactos' }, { href: '/docs/guides', text: 'Guias' }, { href: '/docs/sdk', text: 'SDKs' }]} />
              <P>A referência separa-se em duas áreas: o que gere na <strong>Console</strong> e o que a sua aplicação chama na <strong>camada de integração</strong>.</P>

              <H3>Gestão pela Console</H3>
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
                      ['Console — entrar, workspaces, projetos, membros, chaves', 'Sessão OTP (email + código)', 'Disponível em Sandbox controlado'],
                      ['Consola — Webhooks e Actividade', 'Sessão OTP (email + código)', 'Dados reais do projeto'],
                      ['Consola — dashboard', '—', 'Demo / pré-visualização — não operacional'],
                      ['GET /v1/me (identidade da chave)', 'Chave developer bz_test_ (scope identity:read)', 'Disponível em Sandbox controlado'],
                      ['Sessões de pagamento', 'Chave developer (scope payment_sessions, projeto com binding ativo) ou credencial de merchant', 'Disponível em Sandbox controlado'],
                      ['Payment links', 'Chave developer (scope payment_links, projeto com binding ativo) ou credencial de merchant', 'Disponível em Sandbox controlado'],
                      ['Registo de endpoints de webhooks (POST /v1/webhooks)', 'Chave de projeto (webhooks:write); leitura com webhooks:read', 'Disponível em Sandbox — o segredo é devolvido uma única vez'],
                      ['Entrega outbound de webhooks', '—', 'Verificada em Sandbox — assinatura confirmada de forma independente e entrega aceite por um recetor público'],
                      ['Reembolsos (POST /v1/refunds)', 'Chave de projeto (refunds:write) ou credencial de merchant', 'Disponível em Sandbox — o reembolso debita a conta que recebeu o pagamento'],
                      ['Transferências (POST /v1/wallet-account-transfers)', 'Chave de projeto (transfers:write)', 'Disponível em Sandbox — entre contas do mesmo titular do projeto'],
                      ['Produção / trilhos live / fornecedores externos', '—', 'Não disponível · Não aprovado'],
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

              <H3>Integração Banzami</H3>
              <P>
                A sua aplicação autentica-se enviando a <GlossaryTerm id="api-key">API key</GlossaryTerm> Sandbox <Code>bz_test_</Code> diretamente
                no header <Code>Authorization: Bearer …</Code> e chama a camada de integração em <Code>sandbox-api.banzami.com</Code>.
                O fluxo principal é <strong>sessão de pagamento</strong> (link e QR), tal como usado pelo DOA.
              </P>
              <CodeBlock label="curl · criar sessão de pagamento (pedido + resposta)" raw={SAMPLE_CURL_SESSION} onCopy={copy} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Erros comuns deste endpoint: <Code>401 UNAUTHORIZED</Code> (chave inválida), <Code>403 FORBIDDEN</Code> (scope
                insuficiente ou projeto sem binding), <Code>400 MISSING_FIELD / INVALID_BODY</Code>, <Code>409 CONFLICT</Code>
                (Idempotency-Key em curso). Ver <a href="/docs/reference#errors" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>.
              </P>
              <CodeBlock label="ts · criar sessão de pagamento (@banzami/sdk)" raw={SAMPLE_SESSION} onCopy={copy} />

              <H3 id="idempotencia">Idempotência <Badge tone="ok" /></H3>
              <P>
                Envie o header <Code>Idempotency-Key</Code> em qualquer operação de escrita para poder <strong>repetir com
                segurança</strong> um pedido que falhou por rede/timeout, sem risco de duplicar o efeito. O comportamento no
                Sandbox: a resposta original (2xx ou 4xx) é reproduzida para a mesma chave durante <strong>24 horas</strong>,
                por credencial, método e caminho; respostas <Code>5xx</Code> nunca são reproduzidas (o pedido pode ser repetido);
                dois pedidos <strong>simultâneos</strong> com a mesma chave recebem <Code>409 CONFLICT</Code> até o primeiro
                terminar — nesse caso, aguarde e repita com a <em>mesma</em> chave.
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

              <H3 id="referencia-recursos">Referência por recurso</H3>
              <P>
                Referência endpoint a endpoint da superfície pública verificada no Sandbox — método, credencial, headers, corpo do
                pedido, resposta e erros comuns. Apenas recursos com evidência real; nada aqui reivindica Produção.
              </P>
              <ResourceReference lang="pt" onCopy={copy} />

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
              <H3>Códigos por status HTTP (observados no Sandbox)</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480, fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Status</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Códigos típicos</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>O que fazer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['400', 'INVALID_BODY · MISSING_FIELD · VALIDATION_ERROR · INVALID_PARAM · INVALID_AMOUNT', 'Corrija o pedido; não repita sem alterar.'],
                      ['401', 'UNAUTHORIZED', 'Chave em falta/inválida/revogada — verifique a chave bz_test_.'],
                      ['403', 'FORBIDDEN', 'Scope insuficiente ou projeto sem binding ativo.'],
                      ['404', 'NOT_FOUND', 'Recurso inexistente ou fora do seu âmbito.'],
                      ['409', 'CONFLICT', 'Idempotency-Key em curso ou conflito de estado — aguarde e repita com a mesma chave.'],
                      ['429', 'RATE_LIMITED', 'Abrande e repita com backoff.'],
                      ['5xx', 'INTERNAL_ERROR · UPSTREAM_ERROR · UNAVAILABLE', 'Transitório — repita com a mesma Idempotency-Key.'],
                    ] as [string, string, string][]).map(([st, codes, act]) => (
                      <tr key={st}>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontWeight: 700, color: INK }}>{st}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontSize: 12, color: '#9A1B22' }}>{codes}</td>
                        <td style={{ padding: '9px 10px', borderBottom: '1px solid #F5E9E7', color: '#5a4a4e' }}>{act}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Esta tabela descreve o comportamento observado no <strong>Sandbox</strong>; o comportamento exato de Produção
                não é reivindicado (Produção em preparação).
              </P>
              <H3>Console (acesso e chaves)</H3>
              <UL>
                <LI><Code>INVALID_EMAIL</Code> / <Code>INVALID_CODE</Code> — corrija o email ou peça um novo código OTP.</LI>
                <LI><Code>RATE_LIMITED</Code> — demasiados pedidos; aguarde antes de repetir.</LI>
                <LI><Code>UNAUTHENTICATED</Code> — sessão expirada; inicie sessão novamente.</LI>
                <LI><Code>FORBIDDEN</Code> — sem permissão para a ação (papel ou verificação de origem/CSRF).</LI>
                <LI><Code>CONFLICT</Code> / <Code>LAST_OWNER</Code> — conflito de estado; inclui a proteção do último Owner.</LI>
                <LI><Code>INVITE_INVALID</Code> — convite expirado, revogado ou já usado; peça um novo.</LI>
                <LI><Code>VALIDATION</Code> — dados inválidos; corrija os campos.</LI>
              </UL>
              <H3>Integração</H3>
              <UL>
                <LI><Code>401</Code> — sem token ou chave inválida; troque a sua chave <Code>bz_test_</Code> por um token válido.</LI>
                <LI>Após uma <strong>rotação</strong>, use a nova chave; a anterior deixa de ser aceite.</LI>
                <LI>Não repita uma operação sensível sem proteção de <strong>idempotência</strong>.</LI>
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
              <PageLede>Como validar a integração no Sandbox e os seus limites. <strong>Nunca há dinheiro real</strong> e <strong>não é permitido onboarding de clientes públicos</strong> no preview.</PageLede>
              <NextSteps label="A seguir:" links={[{ href: '/docs/trust', text: 'Confiança e prontidão' }, { href: '/docs/guides', text: 'Guias' }]} />
              <P><strong>O que o Sandbox é:</strong> um ambiente completo de integração com contas, sessões, links, QR e webhooks de teste — os fluxos comportam-se como os reais, mas <strong>nunca há dinheiro real</strong>.</P>
              <P><strong>O que o Sandbox não é:</strong> não há trilhos live, não há fornecedores externos ativados, não há emissão de chaves de Produção. Todas as credenciais de teste destes exemplos são placeholders.</P>
              <UL>
                <LI><strong>1. Primeira chamada:</strong> <Code>GET /v1/me</Code> com a sua chave — sucesso é <Code>200</Code> com <Code>environment: SANDBOX</Code>; falha típica é <Code>401 UNAUTHORIZED</Code> (chave errada/revogada).</LI>
                <LI><strong>2. Criar uma sessão:</strong> <Code>POST /v1/payment-sessions</Code> — sucesso é <Code>201</Code> com <Code>status: ACTIVE</Code> e as interfaces link/QR.</LI>
                <LI><strong>3. Testar idempotência:</strong> repita o mesmo POST com a mesma <Code>Idempotency-Key</Code> — deve receber a resposta original, sem efeito duplicado; envie duas em simultâneo e uma recebe <Code>409 CONFLICT</Code>.</LI>
                <LI><strong>4. Testar erros:</strong> omita <Code>amount_minor</Code> para ver <Code>400 MISSING_FIELD</Code>; use uma chave inválida para ver <Code>401</Code>; guarde sempre o <Code>request_id</Code> da resposta.</LI>
                <LI><strong>5. Interpretar resultados:</strong> qualquer resposta com o envelope de erro (ver <a href="/docs/reference#errors" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>) é acionável pelo <Code>code</Code>.</LI>
              </UL>
              <Callout tone="warn">
                Utilitários internos de fundos/simulação do Sandbox existem mas são <strong>internos — não públicos</strong>; não fazem
                parte da superfície documentada. A entrega outbound de webhooks para sinks externos permanece <strong>simulada</strong> no
                conjunto E2E público — ver <a href="/docs/guides#webhooks" style={{ color: '#B8770A', fontWeight: 800, textDecoration: 'none' }}>Webhooks</a>.
              </Callout>
            </Section>
    </>
  );
}

export function PtTrust({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="trust">
              <H2>Confiança e prontidão</H2>
              <PageLede>Prontidão, evidências, riscos e portões de decisão para parceiros aprovados. <strong>Não representa aprovação de Produção nem autorização regulatória.</strong></PageLede>
              <NextSteps label="Relacionado:" links={[{ href: '/docs/artifacts', text: 'Artefactos' }, { href: '/docs/testing', text: 'Testar no Sandbox' }, { href: '/docs/changelog', text: 'Changelog' }]} />
<H3 id="confianca">Confiança técnica e prontidão</H3>
              <P>
                Esta secção resume o estado técnico da documentação Developers da Banzami para parceiros aprovados. O objetivo
                é separar claramente o que está disponível em Sandbox/Preview, o que está simulado, o que está pendente, o que
                não está disponível e o que não deve ser interpretado como aprovação de Produção, ativação de trilhos live ou
                autorização regulatória.
              </P>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                <strong>Vocabulário de estados.</strong> <Code>available_controlled_sandbox</Code> — verificado no Sandbox
                implantado, com evidência; <Code>documented_preview</Code> — documentado, ainda não verificado ponta a ponta;
                {' '}<Code>pending_e2e</Code> — implementado, à espera de verificação no ambiente implantado;
                {' '}<Code>simulated</Code> — exercitado apenas contra um duplo de teste; <Code>not_public</Code> — existe, mas
                não é acessível publicamente; <Code>not_available</Code> — não existe hoje; <Code>not_approved</Code> — depende
                de uma decisão que ainda não foi tomada. Um estado só muda quando a evidência muda.
              </P>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Capacidade</th>
                      <th style={{ padding: '8px 10px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Modelo de integração SDK-first', 'documented_preview'],
                      ['SDKs publicados (npm, pub.dev)', 'available_controlled_sandbox'],
                      ['SDKs Python e PHP (código-fonte)', 'not_public'],
                      ['HTTP/OpenAPI (referência do protocolo)', 'documented_preview'],
                      ['Rotas da API Sandbox', 'available_controlled_sandbox'],
                      ['Sessões de pagamento', 'available_controlled_sandbox'],
                      ['Payment links', 'available_controlled_sandbox'],
                      ['Payload QR', 'available_controlled_sandbox'],
                      ['Assinatura/referência de webhooks', 'available_controlled_sandbox'],
                      ['Entrega outbound de webhooks', 'available_controlled_sandbox'],
                      ['Reembolsos (chave de projeto)', 'available_controlled_sandbox'],
                      ['Transferências (chave de projeto)', 'available_controlled_sandbox'],
                      ['Developer Console (Sandbox, dados reais)', 'available_controlled_sandbox'],
                      ['Registo self-service por email + OTP', 'available_controlled_sandbox'],
                      ['Trilhos de Produção/live', 'not_available'],
                      ['Pay/checkout/trilhos live', 'not_approved'],
                      ['Trilhos de fornecedores externos', 'not_approved'],
                    ] as [string, string][]).map(([cap, st]) => (
                      <tr key={cap}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #F5E9E7', fontWeight: 700, color: INK }}>{cap}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #F5E9E7', fontFamily: mono, fontSize: 12, color: '#9A1B22' }}>{st}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H3 id="evidencias">Mapa de evidências Sandbox</H3>
              <P>Artefactos públicos e de repositório que suportam esta documentação:</P>
              <UL>
                <LI>OpenAPI e coleção Postman Sandbox; matriz de disponibilidade; manifesto SDK-first; contrato de SDK.</LI>
                <LI>Artefactos de onboarding; exemplos e fixtures (curl, pedidos/respostas, envelopes de erro e webhook).</LI>
                <LI>Testes de claim-safety da documentação — suites P0/P1/P2A/P2B/P2C/P2D.</LI>
              </UL>
              <Callout tone="warn">
                Documentação suportada por evidência não significa disponibilidade de produção live. Artefactos de repositório
                não significam autorização regulatória. Passar os testes de documentação não ativa trilhos de pagamento.
              </Callout>

              <H3 id="riscos">Matriz de riscos e limitações</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      {['Risco / limitação', 'Estado', 'Implicação para o parceiro', 'Tratamento esperado'].map((h) => (
                        <th key={h} style={{ padding: '8px 8px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Pacotes Python e PHP ainda não publicados', 'not_public', 'Consumir por código-fonte; npm e pub.dev já estão disponíveis.', 'Publicação por fazer; instalação limpa provada antes de cada anúncio.'],
                      ['HTTP/OpenAPI é referência, não caminho recomendado', 'documented_preview', 'HTTP direto só para diagnóstico/auditoria.', 'SDK-first; artefactos marcados protocol_reference.'],
                      ['Entrega outbound verificada apenas em Sandbox', 'available_controlled_sandbox', 'Verificada contra um recetor público; a Produção não está coberta.', 'Assinatura confirmada de forma independente, rejeição de adulteração, retries e isolamento de falhas.'],
                      ['Reembolsos/transferências apenas em Sandbox', 'available_controlled_sandbox', 'Disponíveis a chaves de projeto em Sandbox; nunca em trilhos live.', 'E2E no ambiente implantado, incluindo as recusas: chave de leitura e recursos de outro projeto.'],
                      ['Console e registos cobrem apenas Sandbox', 'available_controlled_sandbox', 'A telemetria mostra tráfego real de Sandbox; a Produção não está coberta.', 'Correlação por request_id provada contra o ambiente implantado.'],
                      ['Trilhos de Produção/live indisponíveis', 'not_available', 'Nenhum dinheiro real; nenhuma chave live.', 'bz_live_ recusado fail-closed.'],
                      ['Trilhos de fornecedores externos inativos', 'not_approved', 'Não assumir integrações externas.', 'Decisão de governance separada.'],
                      ['Stage C não implementado/não aprovado', 'not_approved', 'Rotas públicas adicionais não existem ainda.', 'Portões de decisão e aprovações explícitas.'],
                      ['Aprovação regulatória não reivindicada', 'not_approved', 'Não basear claims regulatórios no preview.', 'Wording e testes de claim-safety.'],
                      ['Pagamentos com dinheiro real indisponíveis', 'not_available', 'Apenas fluxos de teste controlados.', 'Sandbox-only em toda a documentação.'],
                      ['Onboarding de clientes públicos proibido no preview', 'not_approved', 'Não expor o preview a clientes finais.', 'Responsabilidades do parceiro; revisão de prontidão.'],
                    ] as string[][]).map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, i) => (
                          <td key={i} style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: i === 0 ? INK : i === 1 ? '#9A1B22' : '#5a4a4e', fontWeight: i === 0 ? 700 : 500, fontFamily: i === 1 ? mono : undefined, fontSize: i === 1 ? 11.5 : undefined }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <H3 id="pacote-prontidao">Pacote de prontidão para parceiros aprovados</H3>
              <P>
                O pacote reúne: onboarding do preview SDK, checklist de validação Sandbox, responsabilidades do parceiro,
                template de report, checklist de revisão de prontidão, contrato de SDK, matriz de disponibilidade e as
                referências do protocolo (OpenAPI e Postman).
              </P>
              <Callout tone="warn">
                O pacote de prontidão é apenas Sandbox/Preview. Não é aprovação de Produção, não é autorização regulatória,
                não ativa trilhos live e não concede acesso público a pacotes SDK.
              </Callout>

              <H3 id="portoes">Portões de decisão antes de qualquer avanço</H3>
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0 0 14px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                      {['Portão', 'Propósito', 'Evidência exigida', 'Condição de passagem', 'Não autoriza'].map((h) => (
                        <th key={h} style={{ padding: '8px 8px', fontWeight: 800, borderBottom: '1px solid #F2E2E0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['1. Honestidade da documentação', 'Documentação reflete evidência.', 'Suites de testes de claims a passar.', 'Todos os testes verdes.', 'Publicação de pacotes ou live.'],
                      ['2. Acesso ao preview SDK', 'Acesso controlado aprovado.', 'Aprovação de preview registada.', 'Acesso concedido ao projeto.', 'Publicação pública do SDK.'],
                      ['3. Validação Sandbox', 'Integração validada em Sandbox.', 'Checklist com evidência.', 'Checklist completo.', 'Ativação de trilhos live.'],
                      ['4. Segurança/gestão de secrets', 'Gestão de credenciais revista.', 'Revisão de secrets documentada.', 'Sem exposição no cliente.', 'Certificação de produção.'],
                      ['5. Erros/idempotência', 'Tratamento correto confirmado.', 'Estratégias documentadas e testadas.', 'Retries seguros demonstrados.', 'Garantias de produção.'],
                      ['6. Desenho de webhooks', 'Verificação e deduplicação revistas.', 'Desenho documentado.', 'Assinatura + idempotência revistas.', 'Entrega pública garantida.'],
                      ['7. Aceitação de limitações', 'Limites documentados aceites.', 'Limitações reconhecidas por escrito.', 'Aceitação registada.', 'Levantamento das limitações.'],
                      ['8. Revisão de prontidão operacional', 'Evidência completa revista.', 'Pacote de prontidão submetido.', 'Parecer de prontidão emitido.', 'Aprovação de Produção.'],
                      ['9. Revisão regulatória/legal', 'Enquadramento antes de fase supervisionada.', 'Revisão regulatória/legal própria.', 'Fora do âmbito desta documentação.', 'Autorização regulatória.'],
                      ['10. Aprovação explícita para fase live/Produção', 'Decisão explícita e separada.', 'Aprovação formal registada.', 'Decisão futura, não incluída aqui.', 'Nada nesta documentação a concede.'],
                    ] as string[][]).map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, i) => (
                          <td key={i} style={{ padding: '8px 8px', borderBottom: '1px solid #F5E9E7', color: i === 0 ? INK : '#5a4a4e', fontWeight: i === 0 ? 700 : 500 }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Callout tone="warn">
                Nenhum portão nesta documentação autoriza trilhos live, pagamentos com dinheiro real, lançamento público,
                emissão de chaves de Produção ou aprovação regulatória.
              </Callout>

              <H3 id="postura-seguranca">Resumo de postura de segurança do preview</H3>
              <UL>
                <LI>Chaves secretas nunca em browsers/apps móveis; artefactos de preview com placeholders apenas; dados de teste não sensíveis.</LI>
                <LI><Code>request_id</Code> capturado para debugging; idempotência em operações mutantes; assinaturas de webhooks verificadas antes de confiar em eventos.</LI>
                <LI>Parceiro protege credenciais e artefactos; limites de disponibilidade respeitados; pacotes SDK não públicos; trilhos live não ativos.</LI>
              </UL>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Este resumo cobre apenas o âmbito Sandbox/Preview suportado pela documentação — sem claims de certificação,
                auditoria externa ou uptime.
              </P>

              <P>
                Artefactos de confiança/prontidão:{' '}
                <a href="/developers/trust/developer-trust-summary.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>resumo</a>
                {' '}·{' '}
                <a href="/developers/trust/sandbox-evidence-map.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>mapa de evidências</a>
                {' '}·{' '}
                <a href="/developers/trust/risk-limitations-matrix.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>matriz de riscos</a>
                {' '}·{' '}
                <a href="/developers/trust/partner-readiness-package.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>pacote de prontidão</a>
                {' '}·{' '}
                <a href="/developers/trust/decision-gates.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>portões de decisão</a>
                {' '}·{' '}
                <a href="/developers/trust/preview-security-posture.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>postura de segurança</a>
                {' '}·{' '}
                <a href="/developers/trust/trust-readiness-summary.md" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>resumo (MD)</a>.
                {' '}Estes artefactos apoiam a avaliação técnica de parceiros aprovados em Sandbox/Preview. Não são contratos
                de Produção, não ativam trilhos live, não autorizam dinheiro real e não representam aprovação regulatória.
              </P>
            </Section>
    </>
  );
}

export function PtArtifacts({ copy }: { copy: CopyFn }) {
  return (
    <>
<Section id="artefactos-page">
              <H2>Artefactos</H2>
              <PageLede>Artefactos públicos de <strong>referência Sandbox/Preview</strong> — OpenAPI, Postman, matriz de disponibilidade, manifests e exemplos. Não são contratos de Produção.</PageLede>
              <NextSteps label="Relacionado:" links={[{ href: '/docs/reference', text: 'Referência API' }, { href: '/docs/trust', text: 'Confiança e prontidão' }, { href: '/docs/changelog', text: 'Changelog' }]} />
<H3 id="artefactos">Artefactos técnicos de referência</H3>
              <P>
                A mesma superfície documentada existe em formato <strong>machine-readable</strong> — <strong>artefactos de
                referência do protocolo</strong>, publicados como ficheiros estáticos. <strong>Não são a recomendação principal
                de integração</strong> (a Banzami é SDK-first), descrevem apenas o âmbito Sandbox/Pré-visualização atual,
                <strong> não são contratos de Produção</strong>, não são trilhos live, não são aprovação regulatória e não
                substituem os SDKs:
              </P>
              <UL>
                <LI><strong>OpenAPI</strong> (referência do protocolo) — <a href="/developers/openapi/banzami-sandbox.openapi.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/openapi/banzami-sandbox.openapi.json</a> — só os endpoints verificados.</LI>
                <LI><strong>Coleção Postman</strong> (referência do protocolo) — <a href="/developers/postman/banzami-sandbox.postman_collection.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/postman/banzami-sandbox.postman_collection.json</a>.</LI>
                <LI><strong>Exemplos curl</strong> (diagnóstico / referência do protocolo) — <a href="/developers/examples/curl/get-me.sh" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>get-me.sh</a> · <a href="/developers/examples/curl/create-payment-session.sh" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>create-payment-session.sh</a>; fixtures completas em <Code>docs/developer/examples/</Code>.</LI>
                <LI><strong>Matriz de disponibilidade</strong> — <a href="/developers/availability/banzami-developers-availability.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>/developers/availability/banzami-developers-availability.json</a> (fonte machine-readable dos estados, verificada por testes).</LI>
                <LI><strong>Manifests</strong> — <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>manifest.json</a> · <a href="/developers/artifacts/sdk-first-manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>sdk-first-manifest.json</a> (modelo SDK-first machine-readable; nenhum pacote SDK publicado).</LI>
              </UL>

                            <P style={{ fontSize: 13, color: '#a89a9e' }}>
                O <a href="/developers/artifacts/manifest.json" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>manifesto de artefactos</a> indexa
                todos os artefactos públicos — incluindo os de <a href="/docs/sdk" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>onboarding do preview SDK</a> e
                os de <a href="/docs/trust" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>confiança/prontidão</a> — todos Sandbox/Preview, nenhum contrato de Produção.
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
              <NextSteps label="A seguir:" links={[{ href: '/docs/artifacts', text: 'Artefactos' }, { href: '/docs/trust', text: 'Confiança e prontidão' }]} />
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Entradas datadas por categoria: <Code>[Docs]</Code> (só documentação), <Code>[API]</Code> (contrato da API),{' '}
                <Code>[Sandbox]</Code> (plataforma Sandbox). Mudanças incompatíveis serão marcadas <Code>[Breaking]</Code>.
                Não há releases de Produção — <em>Produção em preparação</em>.
              </P>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {([
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
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: '#5a4a4e', fontWeight: 500 }}>{what}</span>
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

