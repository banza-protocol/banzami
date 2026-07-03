'use client';

import { useState, type ReactNode } from 'react';
import { BrandTile } from '@/components/developers/portal/icons';

// Public Developer Documentation (developers.banzami.com/docs).
//
// PUBLIC + STATIC: no PortalPage/auth guard, no session, no developer-api fetch,
// no browser storage. Renders the Sandbox developer-platform docs from the
// repo's official sources (README, ADR-033, docs/developer/SANDBOX_REQUIREMENTS,
// docs/sandbox/sandbox-vs-production) and the developer-api implementation.
//
// Honest scope: this is a SANDBOX developer platform — test keys only
// (bz_test_*), no real money, no production activation. Live capabilities are
// listed explicitly as NOT available. Reuses the handoff §11 visual system
// (docs sidebar + dark code blocks) with public chrome (back links).

const RED = '#B5101F';
const INK = '#2a2024';
const MUT = '#8a7a7e';
const mono = "'JetBrains Mono', ui-monospace, monospace";
const CODE_BG = '#2A1E20';
const BANZAMI_URL = 'https://banzami.com';

const SECTIONS: { id: string; label: string }[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'getting-started', label: 'Começar' },
  { id: 'auth', label: 'Autenticação e sessões' },
  { id: 'api-keys', label: 'Chaves Sandbox' },
  { id: 'projects', label: 'Projetos e workspaces' },
  { id: 'api-reference', label: 'Referência de API' },
  { id: 'errors', label: 'Erros e segurança' },
  { id: 'limitations', label: 'Ambiente e limitações' },
];

// Capabilities deliberately deferred — never presented as usable.
const NOT_AVAILABLE = [
  'Chaves Live (bz_live_) e ativação de produção',
  'Cobrança de pagamentos reais (money-in / money-out)',
  'Webhooks de produção',
  'Fluxos de verificação KYB',
  'Ligação/execução de conta de negócio (merchant/business linking)',
  'Liquidação (settlement)',
  'Integração EMIS / Multicaixa Express e rails financeiros de produção',
  'Acesso ao núcleo financeiro (Core)',
  'Sessão única entre portais (cross-portal SSO)',
];

const SCOPES = [
  'payments:read',
  'payments:write',
  'transfers:read',
  'transfers:write',
  'refunds:write',
  'webhooks:read',
  'webhooks:write',
  'customers:read',
];

const ROLES: [string, string][] = [
  ['Owner', 'Controlo total do workspace. Não pode ser removido se for o único Owner.'],
  ['Admin', 'Gere membros e projetos; não pode alterar ou remover Owners.'],
  ['Developer', 'Cria projetos e emite chaves Sandbox.'],
  ['Finance', 'Acesso orientado a faturação (Sandbox).'],
  ['Viewer', 'Acesso apenas de leitura.'],
];

// Preview of the FUTURE payment API — clearly marked as not yet available.
const CHARGES_PREVIEW = `# Pré-visualização da futura API de pagamentos — AINDA NÃO DISPONÍVEL
curl https://api.banzami.com/v1/charges \\
  -H "Authorization: Bearer bz_test_sk_exemplo" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 25000, "currency": "AOA", "description": "Pedido #123" }'`;

const KEY_SHAPE = `# Uma chave publicável (segura no cliente) e uma secreta (apenas no servidor)
bz_test_pk_XXXXXXXXXXXXXXXX   # publicável
bz_test_sk_XXXXXXXXXXXXXXXX   # secreta — revelada uma única vez`;

function CodeBlock({ label, raw }: { label: string; raw: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    // Clipboard only — no network. Guarded for environments without it.
    navigator?.clipboard?.writeText(raw).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };
  return (
    <div style={{ background: CODE_BG, borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px -34px rgba(0,0,0,.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8434B' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FBD2D0' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#5a4a4e' }} />
        <span style={{ marginLeft: 6, fontFamily: mono, fontSize: 11.5, color: '#b8a4a6', fontWeight: 600 }}>{label}</span>
        <button
          type="button"
          onClick={copy}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: 20, fontFamily: mono, fontSize: 12.5, lineHeight: 1.7, color: '#EDE3E1', overflowX: 'auto', whiteSpace: 'pre' }}>{raw}</pre>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 96, marginBottom: 40 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>{title}</h2>
      {children}
    </section>
  );
}

const P = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <p style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.65, color: '#5a4a4e', fontWeight: 500, maxWidth: 640, ...style }}>{children}</p>
);

const UL = ({ children }: { children: ReactNode }) => (
  <ul style={{ margin: '0 0 14px', padding: '0 0 0 18px', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</ul>
);
const LI = ({ children }: { children: ReactNode }) => (
  <li style={{ fontSize: 14, lineHeight: 1.6, color: '#5a4a4e', fontWeight: 500 }}>{children}</li>
);
const Code = ({ children }: { children: ReactNode }) => (
  <code style={{ fontFamily: mono, fontSize: 13, background: '#FFF1F0', color: '#9A1B22', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{children}</code>
);

function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const c =
    tone === 'warn'
      ? { bg: '#FDF3E2', bd: '#F7E4CB', fg: '#B8770A' }
      : { bg: '#FFF1F0', bd: '#F7DAD7', fg: '#9A1B22' };
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 14, padding: '14px 16px', margin: '0 0 16px', maxWidth: 640 }}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: c.fg, fontWeight: 700 }}>{children}</p>
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: '#7a6a6e',
  textDecoration: 'none',
  padding: '3px 9px',
  borderRadius: 8,
};

export default function DocsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#FFF9F8', display: 'flex', flexDirection: 'column' }}>
      {/* Sandbox status banner — always visible */}
      <div
        role="status"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 16px', background: '#FDF3E2', borderBottom: '1px solid #F7E4CB', fontSize: 13, fontWeight: 700, color: '#B8770A', textAlign: 'center' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E0930F' }} />
          SANDBOX
        </span>
        <span style={{ fontWeight: 600 }}>
          Plataforma de developers em ambiente de testes — apenas chaves de teste, sem dinheiro real, sem ativação de produção.
        </span>
      </div>

      {/* Public header: back to banzami.com + brand + back to Console login */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 28px', maxWidth: 1160, width: '100%', margin: '0 auto' }}>
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

      <main style={{ flex: 1, maxWidth: 1160, width: '100%', margin: '0 auto', padding: '10px 28px 64px' }}>
        <div className="bz-docsgrid" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 34, alignItems: 'start' }}>
          {/* Docs section nav (sticky) */}
          <aside style={{ position: 'sticky', top: 20 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: '#a89a9e' }}>DOCUMENTAÇÃO</p>
            <nav aria-label="Secções da documentação" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {SECTIONS.map((s, i) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="bz-toplink"
                  style={{ padding: '8px 12px', borderRadius: 10, background: i === 0 ? '#FFF1F0' : 'transparent', color: i === 0 ? RED : '#6a5a5e', fontSize: 13.5, fontWeight: i === 0 ? 800 : 700, textDecoration: 'none' }}
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </aside>

          <article style={{ minWidth: 0 }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', color: INK }}>Documentação</h1>
            <p style={{ margin: '0 0 30px', fontSize: 15.5, color: MUT, fontWeight: 600, maxWidth: 640 }}>
              Guia da plataforma de developers do Banzami. Tudo aqui descreve o ambiente <strong>Sandbox</strong>.
            </p>

            <Section id="overview" title="Visão geral">
              <P>
                O <strong>Banzami Developers</strong> é a plataforma onde as equipas exploram a integração de pagamentos
                em Kwanza (AOA) do Banzami. Hoje é um <strong>ambiente Sandbox</strong>: serve para testar e integrar,
                não para movimentar dinheiro real.
              </P>
              <Callout tone="warn">
                Estado atual: <strong>Sandbox · plataforma de developers · apenas chaves de teste (bz_test_) · sem dinheiro
                real · sem ativação de produção.</strong>
              </Callout>
              <P>O que pode testar já hoje, na Consola Sandbox:</P>
              <UL>
                <LI>Entrar com email e código (OTP) — sem palavra-passe.</LI>
                <LI>Criar um workspace e convidar a equipa.</LI>
                <LI>Criar um projeto Sandbox.</LI>
                <LI>Emitir, rodar e revogar chaves de API de teste.</LI>
              </UL>
              <P>
                As APIs de pagamento que consomem estas chaves estão em preparação e ainda não estão disponíveis — ver
                <a href="#limitations" style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}> Ambiente e limitações</a>.
              </P>
            </Section>

            <Section id="getting-started" title="Começar">
              <P>Não precisa de empresa registada, documentos KYC nem de falar com ninguém para explorar o Sandbox.</P>
              <UL>
                <LI>Aceda à Consola em <Code>developers.banzami.com/login</Code> e introduza o seu email.</LI>
                <LI>Receba um código de verificação de 6 dígitos por email e confirme.</LI>
                <LI>Crie um <strong>workspace</strong> para a sua equipa.</LI>
                <LI>Crie um <strong>projeto Sandbox</strong>.</LI>
                <LI>Crie uma <strong>chave de API de teste</strong>.</LI>
              </UL>
              <Callout tone="warn">
                A chave <strong>secreta</strong> é revelada <strong>uma única vez</strong>, no momento da criação. Copie-a
                e guarde-a num local seguro. Se a perder, não é possível voltar a mostrá-la — rode a chave para gerar uma nova.
              </Callout>
              <CodeBlock label="chaves de teste" raw={KEY_SHAPE} />
            </Section>

            <Section id="auth" title="Autenticação e sessões">
              <P>
                A autenticação é por <strong>email + código (OTP)</strong>. Introduz o email, recebe um código de 6 dígitos
                e confirma. Não há palavra-passe, telefone nem login social.
              </P>
              <UL>
                <LI>A sessão do navegador é gerida por cookies seguros (HttpOnly, apenas para o host da Consola) e protegida contra CSRF.</LI>
                <LI>O programador <strong>não</strong> manipula tokens de sessão nem códigos OTP em bruto — o navegador e a Consola tratam disso.</LI>
                <LI>Nunca cole códigos OTP nem cookies de sessão em código, logs ou capturas de ecrã.</LI>
              </UL>
            </Section>

            <Section id="api-keys" title="Chaves de API Sandbox">
              <P>
                Só são emitidas chaves de teste. Cada chave tem um prefixo que indica o tipo e o ambiente:
              </P>
              <UL>
                <LI><Code>bz_test_pk_</Code> — chave <strong>publicável</strong> (identificador, seguro no cliente).</LI>
                <LI><Code>bz_test_sk_</Code> — chave <strong>secreta</strong> (apenas no servidor).</LI>
              </UL>
              <P>Cada chave transporta um conjunto fechado de <strong>scopes</strong> (privilégio mínimo):</P>
              <UL>
                {SCOPES.map((s) => (
                  <LI key={s}><Code>{s}</Code></LI>
                ))}
              </UL>
              <UL>
                <LI><strong>Rotação:</strong> invalida a chave atual e gera uma nova.</LI>
                <LI><strong>Revogação:</strong> desativa a chave imediatamente.</LI>
                <LI><strong>Revelar uma vez:</strong> o valor secreto aparece só na criação.</LI>
              </UL>
              <Callout>
                Nunca publique chaves <strong>secretas</strong> em código de frontend, browser ou mobile. As chaves secretas
                são exclusivamente de servidor.
              </Callout>
            </Section>

            <Section id="projects" title="Projetos e workspaces">
              <P>
                Um <strong>workspace</strong> agrupa a sua equipa e os seus projetos. Um <strong>projeto</strong> vive dentro
                de um workspace e é sempre <strong>Sandbox</strong> — não existem projetos Live.
              </P>
              <P>Papéis do workspace:</P>
              <UL>
                {ROLES.map(([r, d]) => (
                  <LI key={r}><strong>{r}</strong> — {d}</LI>
                ))}
              </UL>
              <UL>
                <LI>Criar projetos e emitir chaves: Owner, Admin e Developer.</LI>
                <LI>Gerir membros: Owner e Admin.</LI>
                <LI><strong>Proteção do último Owner:</strong> não é possível remover nem despromover o único Owner.</LI>
              </UL>
            </Section>

            <Section id="api-reference" title="Referência de API">
              <P>
                O Banzami é <strong>SDK-first</strong>: a integração oficial faz-se através dos SDKs (servidor: TypeScript/Node,
                PHP, Python, Go; cliente: Flutter, JavaScript). As chaves secretas usam-se apenas no servidor.
              </P>
              <Callout tone="warn">
                As APIs de pagamento (cobranças, transferências, reembolsos, webhooks) são a superfície de integração
                <strong> futura</strong> e <strong>ainda não estão disponíveis</strong>. O host <Code>api.banzami.com</Code> é
                o <strong>endpoint público de integração planeado</strong> para essa capacidade futura — não é uma API
                disponível nem chamável hoje. O exemplo abaixo é apenas uma pré-visualização do formato previsto.
              </Callout>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' }}>
                {['Pré-visualização', 'Ainda não disponível', 'Sandbox sem pagamentos reais'].map((t) => (
                  <span
                    key={t}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 30, background: '#FDF3E2', border: '1px solid #F7E4CB', fontSize: 12, fontWeight: 800, color: '#B8770A' }}
                  >
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: '#E0930F' }} />
                    {t}
                  </span>
                ))}
              </div>
              <CodeBlock label="pré-visualização · api.banzami.com · ainda não disponível" raw={CHARGES_PREVIEW} />
              <P>
                A gestão de conta, workspaces, projetos e chaves é feita pela própria Consola Sandbox. Essas rotas internas
                de gestão não fazem parte de um contrato público para integração direta e não são documentadas para chamada
                por terceiros.
              </P>
            </Section>

            <Section id="errors" title="Erros e segurança">
              <P>Estados de resposta que pode encontrar na Consola Sandbox:</P>
              <UL>
                <LI><strong>400</strong> — pedido inválido (validação).</LI>
                <LI><strong>401</strong> — não autenticado; a sessão expirou, inicie sessão novamente.</LI>
                <LI><strong>403</strong> — sem permissão (autorização ou verificação CSRF).</LI>
                <LI><strong>409</strong> — conflito; inclui a proteção do último Owner.</LI>
                <LI><strong>410</strong> — convite inválido, expirado ou já usado.</LI>
                <LI><strong>429</strong> — demasiados pedidos (limite de taxa); tente novamente daqui a pouco.</LI>
                <LI><strong>Código OTP inválido</strong> — volte a introduzir ou peça um novo código.</LI>
                <LI><strong>Chave revogada</strong> — emita uma nova chave de teste.</LI>
              </UL>
              <Callout>
                Trate as chaves secretas como palavras-passe. Nunca coloque chaves secretas, códigos OTP, cookies de sessão
                ou tokens em logs, mensagens de erro ou capturas de ecrã.
              </Callout>
            </Section>

            <Section id="limitations" title="Ambiente e limitações atuais">
              <P>
                Todo o ambiente é <strong>Sandbox</strong>. Os pagamentos são simulados — <strong>nenhum dinheiro real</strong> se
                move. Não existe rota nem ativação de produção.
              </P>
              <P style={{ fontWeight: 800, color: INK }}>Ainda não disponível (deliberadamente adiado):</P>
              <UL>
                {NOT_AVAILABLE.map((x) => (
                  <LI key={x}>{x}</LI>
                ))}
              </UL>
              <P>Estas capacidades estão planeadas para mais tarde e não estão acessíveis nesta fase.</P>
            </Section>

            {/* Footer: repeat the required navigation back to site + Console */}
            <footer style={{ marginTop: 8, paddingTop: 20, borderTop: '1px solid #F2E2E0', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <a href={BANZAMI_URL} className="bz-toplink" style={backLinkStyle}>
                <span aria-hidden="true">←</span> Voltar ao Banzami
              </a>
              <a href="/login" className="bz-toplink" style={{ ...backLinkStyle, color: RED, fontWeight: 800 }}>
                Entrar na Consola <span aria-hidden="true">→</span>
              </a>
              <a href="/suporte" className="bz-toplink" style={backLinkStyle}>Suporte</a>
            </footer>
          </article>
        </div>
      </main>
    </div>
  );
}
