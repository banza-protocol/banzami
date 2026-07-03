'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrandTile } from '@/components/developers/portal/icons';

// Public Developer Documentation (developers.banzami.com/docs).
//
// Built on the Banzami Developers handoff §11 visual system (210px docs sidebar,
// 2×2 cards, dark code blocks, blush help card, badges) — expanded into full,
// navigable, deep-linkable content. PUBLIC + STATIC: no auth guard, no session,
// no developer-api fetch. Every claim is grounded in verified code + live
// Sandbox behaviour; unavailable/validating capabilities are labelled honestly.

const RED = '#B5101F';
const INK = '#2a2024';
const MUT = '#8a7a7e';
const mono = "'JetBrains Mono', ui-monospace, monospace";
const BANZAMI_URL = 'https://banzami.com';

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

// -- Status vocabulary (fixed) --------------------------------------------------
type Tone = 'ok' | 'val' | 'soon' | 'prep';
const BADGES: Record<Tone, { label: string; bg: string; bd: string; fg: string; dot: string }> = {
  ok: { label: 'Disponível em Sandbox', bg: '#EAF7F0', bd: '#CFE9DA', fg: '#1F8A5B', dot: '#1F8A5B' },
  val: { label: 'Em validação contínua no Sandbox', bg: '#FDF3E2', bd: '#F7E4CB', fg: '#B8770A', dot: '#E0930F' },
  soon: { label: 'Brevemente', bg: '#F3EDEC', bd: '#EBDBD9', fg: '#6a5a5e', dot: '#a89a9e' },
  prep: { label: 'Produção em preparação', bg: '#FFF1F0', bd: '#F7DAD7', fg: '#9A1B22', dot: '#B5101F' },
};

function Badge({ tone, children }: { tone: Tone; children?: ReactNode }) {
  const b = BADGES[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 30, background: b.bg, border: `1px solid ${b.bd}`, fontSize: 11, fontWeight: 800, letterSpacing: '.01em', color: b.fg, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: b.dot }} />
      {children ?? b.label}
    </span>
  );
}

// -- Intro capability cards (real links to sub-anchors) -------------------------
const CARDS: { title: string; desc: string; href: string; tone: Tone; icon: ReactNode }[] = [
  {
    title: 'Criar cobrança',
    desc: 'Links de pagamento, sessões e QR.',
    href: '#cobranca',
    tone: 'ok',
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
    tone: 'val',
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

const SAMPLE_HTTP = `POST https://sandbox-api.banzami.com/v1/business/payment-sessions
Authorization: Bearer <token emitido a partir da sua chave bz_test_>
Content-Type: application/json`;

const SAMPLE_KEYS = `bz_test_pk_XXXXXXXXXXXXXXXX   # publicável — pode ir no cliente
bz_test_sk_XXXXXXXXXXXXXXXX   # secreta — apenas no servidor, revelada uma única vez`;

const SAMPLE_WEBHOOK = `import { BanzamiClient } from '@banzami/sdk';
const banzami = new BanzamiClient({ apiKey: process.env.BANZAMI_API_KEY });

// No seu endpoint de webhook (servidor)
const sig = req.headers['banza-signature'];          // header de assinatura
const event = banzami.webhooks.constructEvent(rawBody, sig);

switch (event.type) {
  case 'payment_link.paid':               /* marcar como pago (idempotente) */ break;
  case 'application_settlement.executed': /* registar a liquidação */         break;
}

// Responda 2xx rapidamente; falhas são reentregues com recuo exponencial.`;

// -- Small presentational helpers ----------------------------------------------
const P = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.65, color: '#5a4a4e', fontWeight: 500, maxWidth: 660, ...style }}>{children}</p>
);
const UL = ({ children }: { children: ReactNode }) => (
  <ul style={{ margin: '0 0 14px', padding: '0 0 0 18px', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</ul>
);
const LI = ({ children }: { children: ReactNode }) => (
  <li style={{ fontSize: 14, lineHeight: 1.6, color: '#5a4a4e', fontWeight: 500 }}>{children}</li>
);
const Code = ({ children }: { children: ReactNode }) => (
  <code style={{ fontFamily: mono, fontSize: 13, background: '#FFF1F0', color: '#9A1B22', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{children}</code>
);
const H2 = ({ children }: { children: ReactNode }) => (
  <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>{children}</h2>
);
const H3 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h3 id={id} style={{ scrollMarginTop: 80, margin: '26px 0 8px', fontSize: 16.5, fontWeight: 900, color: INK }}>{children}</h3>
);

function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 72, marginBottom: 46 }}>
      {children}
    </section>
  );
}

function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const c = tone === 'warn' ? { bg: '#FDF3E2', bd: '#F7E4CB', fg: '#B8770A' } : { bg: '#FFF1F0', bd: '#F7DAD7', fg: '#9A1B22' };
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 14, padding: '14px 16px', margin: '0 0 16px', maxWidth: 660 }}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: c.fg, fontWeight: 700 }}>{children}</p>
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
  color: '#7a6a6e', textDecoration: 'none', padding: '3px 9px', borderRadius: 8,
};

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
        <a href="/login" className="bz-toplink" aria-label="Entrar na Consola" style={{ ...backLinkStyle, color: RED, fontWeight: 800 }}>
          Entrar na Consola
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>→</span>
        </a>
      </header>

      <main style={{ flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '10px 26px 72px' }}>
        <div className="bz-docsgrid" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 26, alignItems: 'start' }}>
          {/* Sidebar (sticky) — seven items, active state synced to scroll */}
          <aside style={{ position: 'sticky', top: 20 }}>
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
          </aside>

          <article style={{ minWidth: 0 }}>
            {/* ------------------------------------------------ INTRODUÇÃO */}
            <Section id="introducao">
              <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Introdução</h1>
              <P style={{ fontSize: 15.5, color: MUT, fontWeight: 600 }}>
                Comece a integrar Banzami em poucos minutos. Todas as chamadas usam o ambiente Sandbox por defeito.
                Construa e valide a sua integração no Sandbox — a Produção será ativada quando a plataforma estiver
                habilitada para pagamentos reais.
              </P>

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
                <LI><strong>Banzami Developers Console</strong> — o portal onde entra por email e OTP, cria workspaces, projetos Sandbox e <strong>chaves de teste</strong>, gere membros e papéis. A Console não é uma API pública para terceiros chamarem diretamente.</LI>
                <LI><strong>Camada de integração Banzami</strong> — o que a sua aplicação usa para pagamentos: links de pagamento, sessões, QR, confirmação, comprovativos, webhooks assinados e liquidação controlada pelo operador.</LI>
                <LI><strong>Banzami Operator / Core</strong> — a camada financeira do Banzami: executa o pagamento, mantém saldos e integridade, calcula e controla a liquidação. A sua aplicação nunca cria nem gere um ledger financeiro próprio.</LI>
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
                  <LI>Cria uma jornada de pagamento Banzami e apresenta link e QR ao doador.</LI>
                  <LI>Acompanha a confirmação e valida webhooks assinados no servidor.</LI>
                  <LI>Emite comprovativos e solicita a liquidação dentro do modelo do operador.</LI>
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
                <LI>Use a camada de integração Banzami na sua aplicação (via SDK).</LI>
                <LI>Crie uma sessão de pagamento e apresente o link/QR.</LI>
                <LI>Acompanhe a confirmação e emita o comprovativo.</LI>
                <LI>Valide webhooks assinados quando aplicável.</LI>
              </ol>
              <CodeBlock label="chaves de teste" raw={SAMPLE_KEYS} onCopy={copy} />
              <UL>
                <LI><Code>bz_test_pk_</Code> — chave <strong>publicável</strong> (pode ir no cliente).</LI>
                <LI><Code>bz_test_sk_</Code> — chave <strong>secreta</strong> (apenas no servidor).</LI>
                <LI>A chave secreta aparece <strong>uma única vez</strong>; pode <strong>rodar</strong> ou <strong>revogar</strong> chaves a qualquer momento.</LI>
              </UL>
              <Callout>Nunca exponha chaves secretas no browser, app móvel, repositório, logs, capturas de ecrã ou analytics.</Callout>
              <P>
                Os SDKs estão disponíveis como código-fonte (alguns vendored nas aplicações) e ainda não estão publicados
                em registos públicos — ver <a href="#sdks" onClick={go('sdks')} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>SDKs</a>.
                Não corra <Code>npm install @banzami/sdk</Code> — esse pacote ainda não está publicado.
              </P>
            </Section>

            {/* ------------------------------------------------ API REFERENCE */}
            <Section id="api-reference">
              <H2>API Reference</H2>
              <P>A referência separa-se em duas áreas: o que gere na <strong>Console</strong> e o que a sua aplicação chama na <strong>camada de integração</strong>.</P>

              <H3>Gestão pela Console</H3>
              <P>
                Workspaces, projetos, membros e <strong>chaves</strong> são geridos no portal Banzami Developers — pela interface,
                com sessão e permissões por papel. Não é uma API pública para chamar diretamente, por isso não expomos aqui os
                seus endpoints internos.
              </P>

              <H3>Integração Banzami</H3>
              <P>
                A sua aplicação autentica-se com uma chave <Code>bz_test_</Code> (trocada por um token de curta duração) e chama
                a camada de integração em <Code>sandbox-api.banzami.com</Code>. O fluxo principal é <strong>sessão de pagamento</strong>
                (link e QR), tal como usado pelo DOA.
              </P>
              <CodeBlock label="ts · criar sessão de pagamento" raw={SAMPLE_SESSION} onCopy={copy} />
              <CodeBlock label="http · endpoint real" raw={SAMPLE_HTTP} onCopy={copy} />

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

              <H3 id="transferencias">Transferências <Badge tone="val" /></H3>
              <P>
                Movimentação de valor entre contas dentro do modelo Banzami. Os endpoints existem no Sandbox e o SDK expõe a operação;
                o percurso está em validação contínua no Sandbox. Nunca há dinheiro real — <em>Produção em preparação</em>.
              </P>

              <H3 id="reembolsos">Reembolsos <Badge tone="val" /></H3>
              <P>
                Devolução de um pagamento já processado, controlada pelo operador. O endpoint existe no Sandbox e o SDK expõe a operação;
                o percurso está em validação contínua no Sandbox.
              </P>

              <Callout tone="warn">
                Cada endpoint é publicado apenas quando confirmado no código e acessível no Sandbox. Um exemplo de endpoint não é
                uma promessa de que já é possível processar dinheiro real.
              </Callout>
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
              <H2>Webhooks <Badge tone="val" /></H2>
              <P>
                Use webhooks para confirmar eventos no seu servidor sem depender apenas do browser ou de polling. O Banzami entrega
                cada evento assinado; o seu endpoint verifica a assinatura e reage de forma idempotente.
              </P>
              <Callout>
                <strong>Verificação de assinatura operacional em Sandbox.</strong> A validação do header canónico <Code>banza-signature</Code>
                foi confirmada de ponta a ponta contra o endpoint DOA implementado: assinatura canónica aceite, assinatura inválida
                rejeitada, janela de repetição de 5 minutos aplicada e confirmação idempotente. A jornada completa — desde a emissão
                real de <Code>payment_session.paid</Code> até à confirmação automática da doação e ao comprovativo no DOA — é um item de
                validação em curso.
              </Callout>
              <H3>Como funciona</H3>
              <UL>
                <LI>O Banzami envia um <Code>POST</Code> para o seu endpoint com o corpo do evento em JSON.</LI>
                <LI>A assinatura vai no header <Code>banza-signature</Code>, no formato <Code>t=&lt;unix&gt;,v1=&lt;hmac_sha256_hex&gt;</Code>.</LI>
                <LI>A assinatura é <strong>HMAC-SHA256</strong> sobre <Code>&quot;{'{'}t{'}'}.{'{'}corpo{'}'}&quot;</Code>, com uma janela de repetição de <strong>5 minutos</strong>.</LI>
                <LI>Processe de forma <strong>idempotente</strong> e responda <Code>2xx</Code> rapidamente; a entrega é <strong>at-least-once</strong>, sem garantia de ordem, com reentrega em caso de falha.</LI>
              </UL>
              <CodeBlock label="ts · verificar e tratar um evento" raw={SAMPLE_WEBHOOK} onCopy={copy} />
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
              <P>Erros são devolvidos com um código e uma mensagem. Trate-os de forma explícita.</P>
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
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['Julho 2026', 'Consola Sandbox disponível: entrada por email + OTP, workspaces, projetos e chaves de teste.'],
                  ['Julho 2026', 'Chaves de teste com rotação e revogação; papéis e convites de equipa.'],
                  ['Julho 2026', 'Documentação pública de developers.'],
                  ['Julho 2026', 'DOA publicado como integração de referência (Sandbox).'],
                ].map(([when, what], i) => (
                  <li key={i} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ flex: 'none', width: 92, fontSize: 12, fontWeight: 800, color: '#a89a9e', fontFamily: mono, paddingTop: 2 }}>{when}</span>
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: '#5a4a4e', fontWeight: 500 }}>{what}</span>
                  </li>
                ))}
              </ul>
            </Section>

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

// -- Dark code block with copy + toast -----------------------------------------
function CodeBlock({ label, raw, onCopy }: { label: string; raw: string; onCopy: (t: string, l: string) => void }) {
  return (
    <div style={{ background: '#2A1E20', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px -34px rgba(0,0,0,.5)', margin: '0 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8434B' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FBD2D0' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#5a4a4e' }} />
        <span style={{ marginLeft: 6, fontFamily: mono, fontSize: 11.5, color: '#b8a4a6', fontWeight: 600 }}>{label}</span>
        <button
          type="button"
          onClick={() => onCopy(raw, 'Copiado para a área de transferência')}
          className="bz-icobtn"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="#fff" strokeWidth="1.9" />
            <path d="M5 15V5a2 2 0 012-2h8" stroke="#fff" strokeWidth="1.9" />
          </svg>
          Copiar
        </button>
      </div>
      <pre style={{ margin: 0, padding: 20, fontFamily: mono, fontSize: 12.5, lineHeight: 1.7, color: '#EDE3E1', overflowX: 'auto', whiteSpace: 'pre' }}>{raw}</pre>
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
