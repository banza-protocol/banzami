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
import { MiniFlow } from '@/components/developers/MiniFlow';

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
  { n: '1', title: 'Criar chave sandbox', desc: 'Gere uma chave bz_sandbox_… para o ambiente de teste.' },
  { n: '2', title: 'Instalar SDK', desc: 'Adicione o SDK oficial @banzami/sdk ao seu projeto.' },
  { n: '3', title: 'Criar pagamento', desc: 'Inicie um pagamento com idempotência por defeito.' },
  { n: '4', title: 'Receber eventos', desc: 'Receba webhooks assinados quando o estado muda.' },
];

/* ---------- API endpoints ---------- */
const ENDPOINTS: { method: 'POST' | 'GET'; path: string; desc: string }[] = [
  { method: 'POST', path: '/v1/payments', desc: 'Criar um pagamento.' },
  { method: 'GET', path: '/v1/payments/{id}', desc: 'Consultar o estado de um pagamento.' },
  { method: 'POST', path: '/v1/refunds', desc: 'Reembolsar um pagamento confirmado.' },
  { method: 'GET', path: '/v1/wallets/{id}/balance', desc: 'Consultar o saldo de uma carteira.' },
  { method: 'POST', path: '/v1/webhooks/endpoints', desc: 'Registar um endpoint de webhook.' },
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
    name: 'iOS',
    install: 'pod "Banzami"',
    desc: 'SDK cliente para apps iOS — pagamentos por QR e @banza nativos.',
    snippet: (
      <>
        <K>let</K> client = <F>BanzamiClient</F>(environment: <S>.sandbox</S>)
      </>
    ),
  },
  {
    name: 'Android',
    install: 'implementation "com.banzami:sdk"',
    desc: 'SDK cliente para apps Android — checkout e confirmação de pagamento.',
    snippet: (
      <>
        <K>val</K> client = <F>BanzamiClient</F>(Environment.<S>SANDBOX</S>)
      </>
    ),
  },
  {
    name: 'REST API',
    install: 'https://api.banzami.com/v1',
    desc: 'Para ambientes sem SDK oficial — a mesma API REST, idempotente e versionada.',
    snippet: (
      <>
        <K>POST</K> /v1/payments
        {'\n'}
        Authorization: Bearer <S>bz_sandbox_xxx</S>
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
const WEBHOOK_EVENTS = [
  'payment.created',
  'payment.pending_confirmation',
  'payment.confirmed',
  'payment.failed',
  'payment.refunded',
  'wallet.credit',
  'wallet.debit',
];

/* ---------- Security cards ---------- */
const SECURITY: { title: string; desc: ReactNode }[] = [
  { title: 'Bearer keys', desc: 'Autenticação por chave secreta em cada pedido, sempre no servidor.' },
  {
    title: 'Sandbox keys',
    desc: (
      <>
        Chaves <span className="bz-mono text-[12px]">bz_sandbox_…</span> isoladas do ambiente real.
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
  desc: string;
  flow: [string, string, string];
  snippet: ReactNode;
}[] = [
  {
    title: 'Online Checkout',
    desc: 'Crie um pagamento no checkout e confirme pelo webhook payment.confirmed.',
    flow: ['Criar pagamento', 'Mostrar QR', 'Confirmar'],
    snippet: (
      <>
        <K>const</K> payment = <K>await</K> client.payments.<F>create</F>({'{\n'}
        {'  '}amount: <F>2500</F>, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'  '}recipient: <S>&quot;@cantina-alex&quot;</S>,{'\n'}
        {'}, { idempotencyKey: order.id });'}
      </>
    ),
  },
  {
    title: 'Merchant QR',
    desc: 'Gere um QR de pagamento para o cliente ler e confirmar na app.',
    flow: ['Gerar QR', 'Cliente lê', 'Webhook'],
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
    title: 'Wallet Transfer',
    desc: 'Transfira entre carteiras usando um @banza como destinatário.',
    flow: ['@banza', 'Confirmar', 'Recibo'],
    snippet: (
      <>
        <K>const</K> transfer = <K>await</K> client.transfers.<F>create</F>({'{\n'}
        {'  '}to: <S>&quot;@maria&quot;</S>, amount: <F>5000</F>, currency: <S>&quot;AOA&quot;</S>,{'\n'}
        {'}, { idempotencyKey: ref });'}
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
              <CodeBlock title="quickstart.ts" lang="sandbox">
                npm install @banzami/sdk{'\n\n'}
                <K>import</K> {'{ BanzamiClient } '}
                <K>from</K> <S>&quot;@banzami/sdk&quot;</S>;{'\n\n'}
                <K>const</K> client = <K>new</K> <F>BanzamiClient</F>({'{\n'}
                {'  '}apiKey: process.env.<F>BANZAMI_API_KEY</F>,{'\n'}
                {'  '}environment: <S>&quot;sandbox&quot;</S>,{'\n'}
                {'});'}
              </CodeBlock>
            </Reveal>
          </div>
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal>
              <CodeBlock title="request" lang="POST /v1/payments">
                <K>POST</K> /v1/payments{'\n'}
                Authorization: Bearer <S>bz_sandbox_xxx</S>
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

      {/* ===================== 6 · SDKS ===================== */}
      <section id="sdks" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
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

      {/* ===================== 7 · SANDBOX ===================== */}
      <section id="sandbox" className="px-6 py-[clamp(64px,9vw,104px)]">
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
      <section id="webhooks" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <Reveal>
              <CodeBlock title="payload.json" lang="payment.confirmed">
                {'{\n'}
                {'  '}<F>&quot;type&quot;</F>: <S>&quot;payment.confirmed&quot;</S>,{'\n'}
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

      {/* ===================== 9 · SECURITY ===================== */}
      <section id="security" className="px-6 py-[clamp(64px,9vw,104px)]">
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
      <section id="errors" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
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

      {/* ===================== 11 · EXAMPLES ===================== */}
      <section id="examples" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            eyebrow="EXEMPLOS"
            title="Integrações completas, ponta a ponta"
            lead="Três casos reais — checkout, QR de comerciante e transferência entre carteiras."
            className="mb-10 max-w-[680px]"
          />
          <div className="flex flex-col gap-6">
            {EXAMPLES.map((ex, i) => (
              <Reveal
                key={ex.title}
                delay={(i % 2) * 50}
                className="grid grid-cols-1 gap-6 rounded-card border border-border-soft bg-white p-[clamp(22px,3vw,34px)] shadow-[0_20px_50px_-38px_rgba(181,16,31,.32)] lg:grid-cols-[0.85fr_1.15fr] lg:items-center"
              >
                <div>
                  <h3 className="m-0 text-[20px] font-black text-ink">{ex.title}</h3>
                  <p className="m-0 mt-3 text-[14.5px] font-semibold leading-[1.55] text-ink-secondary">
                    {ex.desc}
                  </p>
                  <div className="mt-5">
                    <MiniFlow steps={ex.flow} />
                  </div>
                </div>
                <CodeBlock title={`${ex.title.toLowerCase().replace(/ /g, '-')}.ts`} lang="sandbox">
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

      {/* ===================== 13 · FINAL CTA ===================== */}
      <DeveloperCTA />
      <Footer />
    </main>
  );
}
