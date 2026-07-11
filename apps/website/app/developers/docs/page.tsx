'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrandTile } from '@/components/developers/portal/icons';
import { GlossaryTerm } from './GlossaryTerm';
import { GLOSSARY } from './glossary';
import { BADGES, BANZAMI_URL, Badge, Callout, Code, CodeBlock, H2, H3, INK, LI, MUT, P, RED, Section, UL, backLinkStyle, mono, type Tone } from './ui';
import { ResourceReference } from './reference';

// Public Developer Documentation (developers.banzami.com/docs).
//
// Built on the Banzami Developers handoff §11 visual system (210px docs sidebar,
// 2×2 cards, dark code blocks, blush help card, badges) — expanded into full,
// navigable, deep-linkable content. PUBLIC + STATIC: no auth guard, no session,
// no developer-api fetch. Every claim is grounded in verified code + live
// Sandbox behaviour; unavailable/validating capabilities are labelled honestly.

// -- Sidebar sections (the seven designed items) --------------------------------
const SECTIONS: { id: string; label: string }[] = [
  { id: 'introducao', label: 'Introdução' },
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'api-reference', label: 'API Reference' },
  { id: 'sdks', label: 'SDKs' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'errors', label: 'Errors' },
  { id: 'changelog', label: 'Changelog' },
];

// -- Intro capability cards (real links to sub-anchors) -------------------------
const CARDS: { title: string; desc: string; href: string; tone: Tone; icon: ReactNode }[] = [
  {
    title: 'Criar cobrança',
    desc: 'Links de pagamento, sessões e QR.',
    href: '#cobranca',
    tone: 'val',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 8h13l-3-3M20 16H7l3 3" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Transferências',
    desc: 'Movimente valor entre contas.',
    href: '#transferencias',
    tone: 'ok',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 12h13l-3-3M20 12H7" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Webhooks',
    desc: 'Eventos assinados no seu servidor.',
    href: '#webhooks',
    tone: 'val',
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
    href: '#reembolsos',
    tone: 'val',
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
  { name: '@banzami/sdk', lang: 'TypeScript / Node', state: 'Completo (código-fonte)', tone: 'ok', consume: 'vendored / caminho local' },
  { name: 'banzami-python', lang: 'Python', state: 'Completo (código-fonte)', tone: 'ok', consume: 'código-fonte / local' },
  { name: 'banzami/sdk', lang: 'PHP (+ Laravel)', state: 'Completo (código-fonte)', tone: 'ok', consume: 'código-fonte / local' },
  { name: 'banzami_flutter', lang: 'Dart / Flutter', state: 'Completo (usado na app móvel)', tone: 'ok', consume: 'código-fonte / local' },
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

// 1. Criar uma sessão de pagamento na conta do projeto
const session = await banzami.createPaymentSession({
  walletAccountId: 'wacc_exemplo',
  purpose: 'PAGAMENTO',
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

const SAMPLE_CURL_SESSION = `# Criar uma sessão de pagamento no Sandbox (valores placeholder)
curl -X POST https://sandbox-api.banzami.com/v1/business/payment-sessions \\
  -H "Authorization: Bearer bz_test_sk_XXXXXXXXXXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: idem_pedido_123" \\
  -d '{
    "wallet_account_id": "wacc_exemplo",
    "purpose": "PAGAMENTO",
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
  "purpose": "PAGAMENTO",
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
curl -X POST https://sandbox-api.banzami.com/v1/business/payment-sessions \
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
  "request_id": "req_XXXXXXXX"
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

export default function DocsPage() {
  const [active, setActive] = useState('introducao');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefersReduced = () =>
    typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const copy = useCallback((text: string, label: string) => {
    const onOk = () => {
      setToast(label);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 1600);
    };
    navigator?.clipboard?.writeText(text)?.then(onOk, () => {});
  }, []);

  // Scroll-spy: sync the active sidebar item with the section in view.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-72px 0px -68% 0px', threshold: 0 },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    // The Conceitos appendix sits outside SECTIONS but must still drive scroll-spy
    // (highlight the sidebar item when the section is in view, via #conceitos or
    // the legacy #glossario anchor which lands on the same section).
    const conceitosEl = document.getElementById('conceitos');
    if (conceitosEl) obs.observe(conceitosEl);
    // Deep link on load: honour an existing #hash.
    const h = window.location.hash.replace('#', '');
    if (h) {
      const el = document.getElementById(h);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'auto', block: 'start' }));
    }
    return () => obs.disconnect();
  }, []);

  const go = useCallback((id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
    history.pushState(null, '', `#${id}`); // deep link + back/forward
    setActive(id);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#FFF9F8', display: 'flex', flexDirection: 'column' }}>
      {/* Minimal public header — back to the site + enter the Console */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 28px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <a href={BANZAMI_URL} aria-label="Voltar ao Banzami" className="bz-toplink" style={backLinkStyle}>
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>←</span>
            Voltar ao Banzami
          </a>
          <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <BrandTile size={32} radius={10} />
            <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: '-.02em', color: INK }}>
              Banzami <span style={{ color: RED }}>Developers</span>
            </span>
          </span>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <a href="/docs/en" className="bz-toplink" aria-label="Read the documentation in English" style={backLinkStyle}>
            EN
          </a>
          <a href="/login" className="bz-toplink" aria-label="Entrar na Consola" style={{ ...backLinkStyle, color: RED, fontWeight: 800 }}>
            Entrar na Consola
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>→</span>
          </a>
        </span>
      </header>

      <main style={{ flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '10px 26px 72px' }}>
        <div className="bz-docsgrid" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 26, alignItems: 'start' }}>
          {/* Sidebar — sticky beside the article on desktop; normal-flow above the
              content on narrow screens (never overlaps, see .bz-docsnav in globals.css). */}
          <aside className="bz-docsnav">
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: '#a89a9e' }}>DOCUMENTAÇÃO</p>
            <nav aria-label="Secções da documentação" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {SECTIONS.map((s) => {
                const on = active === s.id;
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={go(s.id)}
                    aria-current={on ? 'true' : undefined}
                    className="bz-toplink"
                    style={{ padding: '8px 12px', borderRadius: 10, background: on ? '#FFF1F0' : 'transparent', color: on ? RED : '#6a5a5e', fontSize: 13.5, fontWeight: on ? 800 : 700, textDecoration: 'none' }}
                  >
                    {s.label}
                  </a>
                );
              })}
            </nav>
            {/* Secondary appendix link — deliberately outside the seven-item nav.
                Canonical anchor is #conceitos; #glossario stays a working legacy anchor. */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F2E2E0' }}>
              <a
                href="#conceitos"
                onClick={go('conceitos')}
                aria-current={active === 'conceitos' ? 'true' : undefined}
                className="bz-toplink"
                style={{ display: 'block', padding: '8px 12px', borderRadius: 10, background: active === 'conceitos' ? '#FFF1F0' : 'transparent', color: active === 'conceitos' ? RED : '#8a7a7e', fontSize: 12.5, fontWeight: active === 'conceitos' ? 800 : 700, textDecoration: 'none' }}
              >
                Conceitos
              </a>
            </div>
          </aside>

          <article style={{ minWidth: 0 }}>
            {/* ------------------------------------------------ INTRODUÇÃO */}
            <Section id="introducao">
              <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Introdução</h1>
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
                  <LI>As páginas <strong>visuais</strong> da Consola (dashboard, webhooks, logs) são <strong>pré-visualizações demo, não operacionais</strong>, salvo indicação explícita em contrário. O âmbito testado é o fluxo API/SDK no Sandbox e a gestão de workspaces, projetos, membros e chaves.</LI>
                </UL>
              </div>

              {/* Interactive capability cards */}
              <div className="bz-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '18px 0 26px' }}>
                {CARDS.map((c) => (
                  <a
                    key={c.title}
                    href={c.href}
                    onClick={go(c.href.slice(1))}
                    className="bz-doccard"
                    style={{ position: 'relative', display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #F2E2E0', borderRadius: 16, padding: 18, boxShadow: '0 14px 40px -34px rgba(181,16,31,.35)' }}
                  >
                    <span style={{ position: 'absolute', top: 13, right: 13 }}><Badge tone={c.tone}>{BADGES[c.tone].label}</Badge></span>
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
                <LI><strong>Banzami Developers Console</strong> — o portal onde entra por email e <GlossaryTerm id="otp">OTP</GlossaryTerm>, cria workspaces, projetos Sandbox e <strong>chaves de teste</strong>, gere membros e papéis. A Console não é uma API pública para terceiros chamarem diretamente. As restantes páginas visuais da Consola (dashboard, webhooks, logs) são <strong>pré-visualizações demo com dados ilustrativos — não operacionais</strong>; não é possível gerir chaves, webhooks ou logs de forma operacional através dessas páginas.</LI>
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

            {/* ------------------------------------------------ QUICKSTART */}
            <Section id="quickstart">
              <H2>Quickstart</H2>
              <P>Do primeiro acesso à validação de uma jornada de pagamento, no Sandbox:</P>
              <ol style={{ margin: '0 0 16px', padding: '0 0 0 20px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <LI>Entre na Consola em <Code>developers.banzami.com/login</Code> com email e código (OTP).</LI>
                <LI>Crie ou escolha um <strong>workspace</strong>.</LI>
                <LI>Crie um <strong>projeto Sandbox</strong>.</LI>
                <LI>Crie uma <strong>chave de teste</strong>.</LI>
                <LI>Guarde a chave <strong>secreta</strong> quando ela aparece — é mostrada uma única vez.</LI>
                <LI><strong>Verifique a chave</strong> contra a API Sandbox com <Code>curl</Code>: <Code>GET /v1/me</Code> devolve o ambiente, projeto, scopes e estado da chave. Esta é a sua primeira chamada bem-sucedida — <strong>não precisa de nenhum SDK</strong>.</LI>
                <LI>Continue por HTTP direto (curl) ou, opcionalmente, com um SDK interno aprovado — os SDKs ainda não estão publicados em registos públicos.</LI>
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
                Os SDKs ainda <strong>não estão publicados</strong> em npm, PyPI, Packagist ou pub.dev — use os exemplos HTTP
                diretos (curl) por agora, salvo se trabalhar a partir de um pacote SDK interno aprovado — ver{' '}
                <a href="#sdks" onClick={go('sdks')} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>SDKs</a>.
                Não corra <Code>npm install @banzami/sdk</Code> — esse pacote ainda não está publicado.
              </P>

              <H3 id="testar-sandbox">Testar no Sandbox</H3>
              <P><strong>O que o Sandbox é:</strong> um ambiente completo de integração com contas, sessões, links, QR e webhooks de teste — os fluxos comportam-se como os reais, mas <strong>nunca há dinheiro real</strong>.</P>
              <P><strong>O que o Sandbox não é:</strong> não há trilhos live, não há fornecedores externos ativados, não há emissão de chaves de Produção. Todas as credenciais de teste destes exemplos são placeholders.</P>
              <UL>
                <LI><strong>1. Primeira chamada:</strong> <Code>GET /v1/me</Code> com a sua chave — sucesso é <Code>200</Code> com <Code>environment: SANDBOX</Code>; falha típica é <Code>401 UNAUTHORIZED</Code> (chave errada/revogada).</LI>
                <LI><strong>2. Criar uma sessão:</strong> <Code>POST /v1/business/payment-sessions</Code> — sucesso é <Code>201</Code> com <Code>status: ACTIVE</Code> e as interfaces link/QR.</LI>
                <LI><strong>3. Testar idempotência:</strong> repita o mesmo POST com a mesma <Code>Idempotency-Key</Code> — deve receber a resposta original, sem efeito duplicado; envie duas em simultâneo e uma recebe <Code>409 CONFLICT</Code>.</LI>
                <LI><strong>4. Testar erros:</strong> omita <Code>amount_minor</Code> para ver <Code>400 MISSING_FIELD</Code>; use uma chave inválida para ver <Code>401</Code>; guarde sempre o <Code>request_id</Code> da resposta.</LI>
                <LI><strong>5. Interpretar resultados:</strong> qualquer resposta com o envelope de erro (ver <a href="#errors" onClick={go('errors')} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>) é acionável pelo <Code>code</Code>.</LI>
              </UL>
              <Callout tone="warn">
                Utilitários internos de fundos/simulação do Sandbox existem mas são <strong>internos — não públicos</strong>; não fazem
                parte da superfície documentada. A entrega outbound de webhooks para sinks externos permanece <strong>simulada</strong> no
                conjunto E2E público — ver <a href="#webhooks" onClick={go('webhooks')} style={{ color: '#B8770A', fontWeight: 800, textDecoration: 'none' }}>Webhooks</a>.
              </Callout>
            </Section>

            {/* ------------------------------------------------ API REFERENCE */}
            <Section id="api-reference">
              <H2>API Reference</H2>
              <P>A referência separa-se em duas áreas: o que gere na <strong>Console</strong> e o que a sua aplicação chama na <strong>camada de integração</strong>.</P>

              <H3>Gestão pela Console</H3>
              <P>
                Workspaces, projetos, membros e <strong>chaves</strong> são geridos no portal Banzami Developers — pela interface,
                com sessão e permissões por papel. Não é uma API pública para chamar diretamente, por isso não expomos aqui os
                seus endpoints internos. As restantes páginas visuais da Consola (dashboard, webhooks, logs) são
                <strong> pré-visualizações demo, não operacionais</strong>.
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
                      ['Páginas visuais da Consola (dashboard, webhooks, logs)', '—', 'Demo / pré-visualização — não operacional'],
                      ['GET /v1/me (identidade da chave)', 'Chave developer bz_test_ (scope identity:read)', 'Disponível em Sandbox controlado'],
                      ['Sessões de pagamento', 'Chave developer (scope payment_sessions, projeto com binding ativo) ou credencial de merchant', 'Disponível em Sandbox controlado'],
                      ['Payment links', 'Chave developer (scope payment_links, projeto com binding ativo) ou credencial de merchant', 'Disponível em Sandbox controlado'],
                      ['Registo de endpoints de webhooks (API)', 'Credencial de merchant', 'Documentado, não público'],
                      ['Entrega outbound de webhooks', '—', 'Simulado no E2E público; jornada DOA verificada'],
                      ['Reembolsos (POST /v1/refunds)', 'Credencial de merchant (verificado). Scope developer refunds:write', 'Pendente E2E para chave developer — pedido com chave developer é recusado (403)'],
                      ['Transferências', 'Utilizador autenticado (verificado). Scopes developer transfers:*', 'Pendente E2E para chave developer'],
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
                (Idempotency-Key em curso). Ver <a href="#errors" onClick={go('errors')} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>Errors</a>.
              </P>
              <CodeBlock label="ts · criar sessão de pagamento (SDK interno, opcional)" raw={SAMPLE_SESSION} onCopy={copy} />

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

              <H3 id="artefactos">Artefactos técnicos</H3>
              <P>
                A mesma superfície documentada existe em formato <strong>machine-readable</strong> — artefactos de repositório,
                para revisão e futura publicação (não são downloads alojados). Descrevem apenas o âmbito Sandbox/Pré-visualização
                atual e <strong>não são contratos de Produção</strong>:
              </P>
              <UL>
                <LI><strong>OpenAPI</strong> — <Code>docs/developer/openapi/banzami-sandbox.openapi.json</Code> (só os endpoints verificados; reembolsos/transferências ausentes por estarem Pendente E2E para chaves developer).</LI>
                <LI><strong>Exemplos curl + fixtures</strong> — <Code>docs/developer/examples/</Code> (pedidos, respostas, envelopes de erro e de webhook, com placeholders óbvios).</LI>
                <LI><strong>Coleção Postman</strong> — <Code>docs/developer/postman/banzami-sandbox.postman_collection.json</Code> (mesmo conjunto de endpoints, variáveis placeholder).</LI>
                <LI><strong>Matriz de disponibilidade</strong> — <Code>docs/developer/availability/banzami-developers-availability.json</Code> (a fonte machine-readable dos estados desta documentação, verificada por testes).</LI>
              </UL>

              <H3 id="cobranca">Criar cobrança <Badge tone="val" /></H3>
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
                Movimente valor entre contas Banzami. Um utilizador autenticado envia para o <GlossaryTerm id="banza-handle" code>@banza</GlossaryTerm> do destinatário,
                com o montante em unidades menores (AOA) e uma <GlossaryTerm id="idempotencia">idempotency key</GlossaryTerm>. A transferência é confirmada de forma síncrona no
                Sandbox, ficando <strong>COMPLETED</strong>, com débito e crédito atómicos no ledger e um comprovativo oficial disponível.
              </P>
              <P>
                Repetir a mesma idempotency key devolve a transferência original, sem mover fundos duas vezes. Validado de ponta a
                ponta no Sandbox. Nunca há dinheiro real — <em>Produção em preparação</em>.
              </P>
              <P style={{ fontSize: 13, color: '#a89a9e' }}>
                Nota de credencial: o percurso verificado usa um utilizador autenticado. Os scopes de chave developer
                (<Code>transfers:*</Code>) estão <strong>Pendente E2E</strong> — ver a matriz de{' '}
                <a href="#credenciais" onClick={go('credenciais')} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>credenciais</a>.
              </P>

              <H3 id="reembolsos">Reembolsos <Badge tone="val" /></H3>
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
                Referência técnica: a origem do pagamento é tipada conforme BANZA ADR-030. Nota de credencial: o percurso
                verificado usa a credencial de merchant; o scope de chave developer (<Code>refunds:write</Code>) está{' '}
                <strong>Pendente E2E</strong> — um pedido de reembolso com chave developer é recusado (403). Ver a matriz de{' '}
                <a href="#credenciais" onClick={go('credenciais')} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>credenciais</a>.
              </P>
            </Section>

            {/* ------------------------------------------------ SDKS */}
            <Section id="sdks">
              <H2>SDKs</H2>
              <P>
                Os SDKs tratam automaticamente de autenticação, idempotência, retries e verificação de assinatura de webhooks.
                Hoje são consumidos como <strong>código-fonte</strong> (por exemplo, vendored na aplicação, como faz o DOA);
                ainda não estão publicados em npm, PyPI, Packagist ou pub.dev.
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
            </Section>

            {/* ------------------------------------------------ WEBHOOKS */}
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

            {/* ------------------------------------------------ ERRORS */}
            <Section id="errors">
              <H2>Errors</H2>
              <P>
                Todas as respostas de erro da camada de integração usam o <strong>mesmo envelope JSON</strong>: um código
                estável, uma mensagem legível e um <Code>request_id</Code> para correlacionar com o suporte. Trate erros pelo
                <Code>code</Code>, nunca pela mensagem.
              </P>
              <CodeBlock label="json · envelope canónico de erro" raw={SAMPLE_ERROR} onCopy={copy} />
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

            {/* ------------------------------------------------ CHANGELOG */}
            <Section id="changelog">
              <H2>Changelog</H2>
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

            {/* ------------------------------------------------ CONCEITOS */}
            {/* Secondary appendix (NOT one of the seven primary sidebar items).
                Canonical anchor is #conceitos. The legacy #glossario anchor below
                is preserved so previously-shared /docs#glossario links keep working
                (both land on this same section). */}
            <section id="conceitos" style={{ scrollMarginTop: 72, marginBottom: 40 }}>
              <span id="glossario" aria-hidden="true" style={{ display: 'block', height: 0, scrollMarginTop: 72 }} />
              <H2>Conceitos</H2>
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
            </section>

            {/* Blush help card */}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, background: '#FFF1F0', border: '1px solid #F7DAD7', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 900, color: INK }}>Precisa de ajuda?</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#a08a8c', fontWeight: 600 }}>A nossa equipa de suporte está disponível.</p>
              </div>
              <a href="/suporte" className="bz-cta" style={{ padding: '11px 18px', border: 'none', borderRadius: 12, background: 'linear-gradient(160deg,#B5101F,#7C1016)', color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', textDecoration: 'none', boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)' }}>
                Abrir suporte
              </a>
            </div>
          </article>
        </div>
      </main>

      {/* Copy toast (accessible) */}
      <div aria-live="polite" style={{ position: 'fixed', left: 0, right: 0, bottom: 26, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 60 }}>
        {toast ? (
          <span style={{ background: '#2a2024', color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 12, boxShadow: '0 16px 40px -18px rgba(0,0,0,.5)' }}>{toast}</span>
        ) : null}
      </div>
    </div>
  );
}

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
