import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { PUBLISHED_PACKAGES } from './docs/published-packages';

// banzami.com/developers — the developer platform's landing page.
//
// It says what can be built and where to start, and nothing that can drift: no
// endpoint, payload, error table, event list or code sample. Every technical
// detail is one link away in the canonical documentation on
// developers.banzami.com, which is gated against the runtime; a second copy here
// was how this page came to describe an onboarding, a set of SDKs and an
// environment model the platform no longer had (PUBLIC-TRUTH-001).

const DOCS = 'https://developers.banzami.com/docs';
const CONSOLE = 'https://developers.banzami.com/login';

export const metadata: Metadata = {
  title: 'Developers',
  description:
    'Construa com o Banzami: pagamentos nativos de carteira e integração programável para aplicações feitas para Angola. Sandbox pública self-service; Financial Live indisponível.',
  alternates: { canonical: 'https://banzami.com/developers' },
};

const CAPABILITIES: { title: string; body: string; href: string }[] = [
  { title: 'Pagamentos', body: 'Uma sessão de pagamento com link, deep link e QR, a creditar a conta que escolher.', href: `${DOCS}/payments` },
  { title: 'Contas de carteira', body: 'Contas separadas dentro do seu negócio — por campanha, loja ou produto.', href: `${DOCS}/transfers#contas-segregadas` },
  { title: 'Links de pagamento', body: 'Um endereço para partilhar; o pagador paga na página alojada do Banzami.', href: `${DOCS}/payments#links` },
  { title: 'QR', body: 'QR dinâmico por pagamento, lido pela app do pagador.', href: `${DOCS}/payments#apresentar` },
  { title: 'Reembolsos', body: 'Totais ou parciais, idempotentes, sem nunca ultrapassar o que foi pago.', href: `${DOCS}/refunds` },
  { title: 'Webhooks', body: 'Eventos assinados, repetidos em caso de falha, com histórico de entregas.', href: `${DOCS}/webhooks` },
  { title: 'Estado em tempo real', body: 'A sua página vê o pagamento passar a pago, sem expor nenhuma chave.', href: `${DOCS}/payments#tempo-real` },
  { title: 'Liquidações de aplicações', body: 'Para plataformas que recebem por outros: bruto, taxa e líquido, sempre somados.', href: `${DOCS}/settlements` },
  { title: 'Comprovativos verificáveis', body: 'Cada operação tem um comprovativo que qualquer pessoa pode verificar.', href: `${DOCS}/receipts` },
  { title: 'Testes na Sandbox', body: 'Pagadores de teste, dinheiro fictício e cenários documentados, sem valores mágicos.', href: `${DOCS}/testing` },
  { title: 'API Explorer', body: 'Experimente a API a partir da Consola; nenhuma chave chega ao browser.', href: `${DOCS}/testing#explorer` },
];

const PLATFORM: { title: string; body: string }[] = [
  { title: 'Workspace', body: 'A equipa e as suas permissões.' },
  { title: 'Projeto', body: 'Uma integração, com as suas chaves e registos.' },
  { title: 'Configuração financeira', body: 'Quem recebe o dinheiro do projeto — fixado pelo Banzami, nunca pelo pedido.' },
  { title: 'Chaves de API', body: 'Por projeto, com scopes, rotação e revogação.' },
  { title: 'Webhooks', body: 'Endpoints, evento de teste, entregas e reenvio.' },
  { title: 'Registos', body: 'Cada pedido à API, com estado, código de erro, latência e request_id.' },
  { title: 'Ferramentas da Sandbox', body: 'Pagadores de teste, cenários e reposição do ambiente.' },
];

function Dot({ tone }: { tone: 'ok' | 'off' }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${tone === 'ok' ? 'bg-[#1f9d57]' : 'bg-ink-muted'}`} />;
}

// The model in one picture. External rails are drawn dashed and labelled: they
// belong to Financial Live, which is not available.
function PlatformDiagram() {
  const box = (x: number, label: string, sub: string) => (
    <g>
      <rect x={x} y={34} width={170} height={78} rx={14} fill="#FFFFFF" stroke="#F2D6D4" strokeWidth={2} />
      <text x={x + 85} y={68} textAnchor="middle" fontSize={15} fontWeight={800} fill="#2a2024">{label}</text>
      <text x={x + 85} y={90} textAnchor="middle" fontSize={12} fontWeight={600} fill="#8a7a7e">{sub}</text>
    </g>
  );
  const arrow = (x: number) => <path d={`M${x} 73 h26`} stroke="#B5101F" strokeWidth={2.2} markerEnd="url(#bz-dev-arrow)" />;
  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 1010 150" role="img" aria-labelledby="bz-dev-diagram-title bz-dev-diagram-desc" className="block min-w-[720px] w-full">
          <title id="bz-dev-diagram-title">Como uma aplicação usa o Banzami</title>
          <desc id="bz-dev-diagram-desc">A aplicação chama a API do Banzami, que cria pagamentos e movimenta contas de carteira; cada movimento fica registado no ledger do Banzami. A ligação a bancos e outros rails externos pertence ao Financial Live, que não está disponível.</desc>
          <defs>
            <marker id="bz-dev-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="#B5101F" />
            </marker>
          </defs>
          {box(0, 'A sua aplicação', 'servidor + página')}
          {arrow(176)}
          {box(206, 'API do Banzami', 'v1 · chave do projeto')}
          {arrow(382)}
          {box(412, 'Pagamentos e contas', 'sessões, links, QR')}
          {arrow(588)}
          {box(618, 'Ledger do Banzami', 'cada movimento registado')}
          <path d="M794 73 h26" stroke="#c9b9bc" strokeWidth={2.2} strokeDasharray="5 5" />
          <rect x={826} y={34} width={180} height={78} rx={14} fill="#FBF8F8" stroke="#c9b9bc" strokeWidth={2} strokeDasharray="6 5" />
          <text x={916} y={66} textAnchor="middle" fontSize={14} fontWeight={800} fill="#8a7a7e">Rails externos</text>
          <text x={916} y={88} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#8a7a7e">Financial Live · indisponível</text>
        </svg>
      </div>
      <figcaption className="mt-3 text-[13px] font-semibold text-ink-muted">
        Na Sandbox pública, o dinheiro é fictício e nada chega a um banco. A ligação a bancos, PSPs e outros rails pertence ao Financial Live.
      </figcaption>
    </figure>
  );
}

export default function DevelopersLandingPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      <section className="px-6 pb-10 pt-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <p className="m-0 text-[13px] font-black tracking-[0.08em] text-cherry">DEVELOPER PLATFORM</p>
          <h1 className="m-0 mt-4 max-w-[820px] text-[clamp(34px,5.4vw,60px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
            Construa com o Banzami.
          </h1>
          <p className="m-0 mt-5 max-w-[680px] text-[clamp(17px,1.6vw,20px)] font-semibold leading-[1.55] text-ink-secondary">
            Pagamentos nativos de carteira e integração programável para aplicações feitas para Angola.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={CONSOLE} className="inline-flex items-center rounded-[40px] bg-gradient-to-b from-cherry to-cherry-deeper px-7 py-[15px] text-[16px] font-extrabold text-white no-underline shadow-[0_16px_32px_-12px_rgba(181,16,31,.5)] transition-transform hover:-translate-y-0.5">
              Começar a construir
            </a>
            <a href={DOCS} className="inline-flex items-center rounded-[40px] border border-border-soft bg-white px-7 py-[15px] text-[16px] font-extrabold text-cherry no-underline transition-transform hover:-translate-y-0.5">
              Ler a documentação
            </a>
          </div>

          <div className="mt-10 grid max-w-[880px] grid-cols-1 gap-4 md:grid-cols-2" data-testid="environment-cards">
            <div className="rounded-[22px] border border-border-soft bg-white p-6 shadow-[0_20px_40px_-34px_rgba(181,16,31,.4)]">
              <p className="m-0 flex items-center gap-2 text-[13px] font-black tracking-[0.06em] text-ink"><Dot tone="ok" /> SANDBOX PÚBLICA · DISPONÍVEL</p>
              <ul className="m-0 mt-3 list-none space-y-1 p-0 text-[15px] font-semibold text-ink-secondary">
                <li>Totalmente self-service, sem aprovação de um operador Banzami.</li>
                <li>Dinheiro fictício: nada entra ou sai de um banco.</li>
              </ul>
            </div>
            <div className="rounded-[22px] border border-border-soft bg-[#FBF8F8] p-6">
              <p className="m-0 flex items-center gap-2 text-[13px] font-black tracking-[0.06em] text-ink"><Dot tone="off" /> FINANCIAL LIVE · INDISPONÍVEL</p>
              <ul className="m-0 mt-3 list-none space-y-1 p-0 text-[15px] font-semibold text-ink-secondary">
                <li>Operação financeira real desligada.</li>
                <li>Sujeito às aprovações regulatórias, contratuais e operacionais aplicáveis.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-[clamp(40px,6vw,72px)]">
        <Reveal className="mx-auto max-w-container">
          <h2 className="m-0 text-[clamp(26px,3.4vw,38px)] font-black tracking-[-0.02em] text-ink">O que pode construir</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <a key={c.title} href={c.href} className="group block rounded-[20px] border border-border-soft bg-white p-5 no-underline transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-30px_rgba(181,16,31,.45)]">
                <p className="m-0 text-[16px] font-extrabold text-ink">{c.title}</p>
                <p className="m-0 mt-2 text-[14.5px] font-semibold leading-[1.5] text-ink-secondary">{c.body}</p>
                <p className="m-0 mt-3 text-[13px] font-extrabold text-cherry">Ver na documentação →</p>
              </a>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="px-6 py-[clamp(40px,6vw,72px)]">
        <Reveal className="mx-auto max-w-container">
          <h2 className="m-0 text-[clamp(26px,3.4vw,38px)] font-black tracking-[-0.02em] text-ink">Uma plataforma, dois ambientes</h2>
          <p className="m-0 mt-3 max-w-[720px] text-[16px] font-semibold leading-[1.55] text-ink-secondary">
            A Consola de Developers é a mesma para os dois. Hoje trabalha na Sandbox; o Financial Live vive na mesma plataforma e continua fechado.
          </p>
          <div className="mt-8"><PlatformDiagram /></div>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM.map((p) => (
              <div key={p.title} className="rounded-[18px] border border-border-soft bg-white p-4">
                <p className="m-0 text-[15px] font-extrabold text-ink">{p.title}</p>
                <p className="m-0 mt-1 text-[14px] font-semibold leading-[1.45] text-ink-secondary">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="m-0 mt-5 text-[14px] font-semibold"><a href={`${DOCS}/console`} className="font-extrabold text-cherry">Como funciona a Consola →</a></p>
        </Reveal>
      </section>

      <section className="px-6 py-[clamp(40px,6vw,72px)]">
        <Reveal className="mx-auto grid max-w-container grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[24px] border border-border-soft bg-white p-7">
            <h2 className="m-0 text-[24px] font-black tracking-[-0.02em] text-ink">SDK oficial</h2>
            <p className="m-0 mt-2 text-[15px] font-semibold leading-[1.55] text-ink-secondary">
              Tipado, com repetição segura, verificação de webhooks e acompanhamento do estado em tempo real.
            </p>
            <ul className="m-0 mt-4 list-none space-y-2 p-0" data-testid="published-packages">
              {PUBLISHED_PACKAGES.map((p) => (
                <li key={p.name} className="rounded-[12px] bg-[#1f1719] px-4 py-3 font-mono text-[13.5px] text-[#f5eceb]">{p.install}</li>
              ))}
            </ul>
            <p className="m-0 mt-4 text-[14px] font-semibold"><a href={`${DOCS}/sdk`} className="font-extrabold text-cherry">Documentação do SDK →</a></p>
          </div>
          <div className="rounded-[24px] border border-border-soft bg-white p-7">
            <h2 className="m-0 text-[24px] font-black tracking-[-0.02em] text-ink">Implementação de referência: DOA</h2>
            <p className="m-0 mt-2 text-[15px] font-semibold leading-[1.55] text-ink-secondary">
              Uma plataforma de doações construída só com a API pública e o SDK: contas por campanha, pagamentos, webhooks, comprovativos e liquidações. Um tutorial percorre-a passo a passo, na Sandbox.
            </p>
            <p className="m-0 mt-4 text-[14px] font-semibold"><a href={`${DOCS}/doa`} className="font-extrabold text-cherry">Construir como o DOA →</a></p>
          </div>
        </Reveal>
      </section>

      <section className="px-6 pb-[clamp(56px,8vw,100px)] pt-6">
        <Reveal className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[36px] bg-[linear-gradient(150deg,#B5101F,#9A1B22)] p-[clamp(36px,6vw,68px)] text-center">
          <h2 className="m-0 text-[clamp(28px,4.4vw,46px)] font-black leading-[1.05] tracking-[-0.025em] text-white">Comece na Sandbox.</h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[17px] font-semibold leading-[1.55] text-pink-200">
            Crie a conta, um projeto e a primeira chave — e faça o primeiro pagamento de teste em minutos.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href={CONSOLE} className="inline-flex items-center rounded-[40px] bg-white px-7 py-[15px] text-[16px] font-extrabold text-cherry no-underline transition-transform hover:-translate-y-0.5">Abrir a Consola</a>
            <a href={`${DOCS}/get-started`} className="inline-flex items-center rounded-[40px] border border-white/30 bg-white/[0.14] px-7 py-[15px] text-[16px] font-extrabold text-white no-underline transition-transform hover:-translate-y-0.5">Quickstart</a>
          </div>
        </Reveal>
      </section>

      <Footer />
    </main>
  );
}
