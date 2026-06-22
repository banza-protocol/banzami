import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { mailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Developers',
  description:
    'Uma API REST e SDKs oficiais para aceitar Kwanza nativamente em qualquer aplicação. Sandbox isolado, idempotência e webhooks assinados. Plataforma em desenvolvimento ativo.',
};

// Capacidades (Programadores.dc.html §CAPACIDADES).
const CAPABILITIES: { title: string; body: React.ReactNode }[] = [
  { title: 'API REST', body: 'Versionada, idempotente, com tratamento de erros estruturado.' },
  {
    title: 'SDKs oficiais',
    body: 'Clientes tipados — o caminho recomendado, não chamadas HTTP artesanais.',
  },
  {
    title: 'Sandbox isolado',
    body: 'Ambiente simulado para desenvolver e testar sem dinheiro real.',
  },
  {
    title: 'Idempotência',
    body: 'Cada operação mutante aceita uma chave; repetir é sempre seguro.',
  },
  {
    title: 'Webhooks assinados',
    body: (
      <>
        Eventos entregues com assinatura verificável (
        <span className="bz-mono text-[12px]">banza-signature</span>).
      </>
    ),
  },
  {
    title: 'QR / link / checkout',
    body: 'Helpers para iniciar pagamentos de várias formas.',
  },
];

// SDKs oficiais (Programadores.dc.html §SDKS OFICIAIS).
const SDKS: { name: string; pkg: string }[] = [
  { name: 'TypeScript', pkg: '@banzami/sdk' },
  { name: 'Flutter', pkg: 'banzami_flutter' },
  { name: 'Python', pkg: 'banzami' },
  { name: 'PHP', pkg: 'banzami/sdk-php' },
  { name: 'Go', pkg: 'banzami-go' },
];

const USE_CASES = ['Apps de táxi', 'Delivery', 'Ecommerce', 'Doações', 'Escolas'];

export default function DevelopersPage() {
  return (
    <div className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-16 pt-[clamp(120px,16vw,130px)]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto grid max-w-container grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-cherry shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
              <span className="h-2 w-2 rounded-full bg-cherry" />
              Developer Platform
            </span>
            <h1 className="m-0 text-[clamp(38px,5.4vw,64px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
              Aceita Kwanza dentro da tua app.
            </h1>
            <p className="m-0 mt-5 max-w-[520px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
              Uma API REST e SDKs oficiais para integrar pagamentos em Kwanza nativamente — do
              install ao primeiro pagamento em minutos, em sandbox.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={mailto('Acesso sandbox Banzami')}
                className="inline-flex items-center gap-2 rounded-[40px] bg-cherry px-[30px] py-4 text-[16px] font-extrabold text-white no-underline shadow-[0_14px_30px_-10px_rgba(181,16,31,.5)] transition-[transform,background] duration-200 hover:-translate-y-0.5 hover:bg-cherry-dark"
              >
                Pedir acesso ao sandbox
              </a>
              <a
                href="#sdks"
                className="inline-flex items-center gap-2 rounded-[40px] bg-white px-7 py-4 text-[16px] font-extrabold text-cherry no-underline shadow-[0_8px_22px_-10px_rgba(0,0,0,.18)] transition-[transform,background] duration-200 hover:-translate-y-0.5 hover:bg-cream-100"
              >
                Ver SDKs
              </a>
            </div>
            <p className="m-0 mt-[22px] bz-mono text-[12.5px] font-semibold text-[#8a7a7e]">
              Plataforma em desenvolvimento ativo · exemplos em sandbox.
            </p>
          </div>

          {/* Code window — official SDK only, no internal endpoints/secrets. */}
          <div>
            <div className="anim-floaty-7 overflow-hidden rounded-card border border-border-soft bg-white shadow-[0_30px_70px_-34px_rgba(181,16,31,.35)]">
              <div className="flex items-center gap-2 border-b border-border-soft bg-cream-50 px-[18px] py-[14px]">
                <span className="h-[11px] w-[11px] rounded-full bg-cherry-coral" />
                <span className="h-[11px] w-[11px] rounded-full bg-pink-200" />
                <span className="h-[11px] w-[11px] rounded-full bg-[#e8d4d2]" />
                <span className="ml-2 bz-mono text-[12px] font-semibold text-ink-muted">
                  pagamento.ts · sandbox
                </span>
              </div>
              <pre className="m-0 overflow-x-auto p-[22px] bz-mono text-[12.5px] leading-[1.7] text-[#3a2a2e]">
                <span className="text-cherry">import</span> {'{ BanzamiClient } '}
                <span className="text-cherry">from</span>{' '}
                <span className="text-[#1f9a5b]">&quot;@banzami/sdk&quot;</span>;{'\n\n'}
                <span className="text-cherry">const</span> banzami = <span className="text-cherry">new</span>{' '}
                <span className="text-cherry-dark">BanzamiClient</span>({'{\n'}
                {'  '}env: <span className="text-[#1f9a5b]">&quot;sandbox&quot;</span>,{'\n'}
                {'  '}apiKey: process.env.<span className="text-cherry-dark">BANZA_API_KEY</span>,{'\n'}
                {'});\n\n'}
                <span className="text-[#a89a9e]">{'// criar um pagamento (sandbox)'}</span>
                {'\n'}
                <span className="text-cherry">const</span> pagamento = <span className="text-cherry">await</span>{' '}
                banzami.payments.<span className="text-cherry-dark">create</span>({'\n'}
                {'  { to: '}
                <span className="text-[#1f9a5b]">&quot;@maria&quot;</span>, amount:{' '}
                <span className="text-cherry-dark">2500</span>, currency:{' '}
                <span className="text-[#1f9a5b]">&quot;AOA&quot;</span>
                {' },\n'}
                {'  { idempotencyKey: order.id }\n'}
                {');\n\n'}
                <span className="text-[#a89a9e]">{'// verificar a assinatura de um webhook'}</span>
                {'\n'}
                banzami.webhooks.<span className="text-cherry-dark">verify</span>(payload, headers[
                <span className="text-[#1f9a5b]">&quot;banza-signature&quot;</span>]);
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* CAPACIDADES */}
      <section className="bg-[linear-gradient(180deg,#fff,#FFF7F6)] px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-10 max-w-[640px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">CAPACIDADES</p>
            <h2 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[1.06] tracking-[-0.02em] text-ink">
              Seguro por defeito, rápido de integrar.
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((cap, i) => (
              <Reveal
                key={cap.title}
                delay={(i % 3) * 50}
                className="rounded-[24px] bg-white p-[26px] shadow-[0_14px_40px_-24px_rgba(181,16,31,.2)]"
              >
                <h3 className="m-0 mb-2 text-[18px] font-black text-ink">{cap.title}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">
                  {cap.body}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SDKS */}
      <section id="sdks" className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-9 max-w-[640px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">SDKS OFICIAIS</p>
            <h2 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[1.06] tracking-[-0.02em] text-ink">
              Cinco linguagens, um só contrato.
            </h2>
            <p className="m-0 mt-4 text-[16px] font-semibold leading-[1.55] text-ink-secondary">
              Em diferentes graus de maturidade, todos sobre o mesmo protocolo aberto BANZA.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SDKS.map((sdk, i) => (
              <Reveal
                key={sdk.name}
                delay={i * 40}
                className="rounded-[20px] bg-cream-50 p-[22px]"
              >
                <p className="m-0 text-[16px] font-black text-ink">{sdk.name}</p>
                <p className="m-0 mt-2 bz-mono text-[12px] text-cherry">{sdk.pkg}</p>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-7">
            <p className="m-0 mb-[14px] text-[14px] font-black text-ink-muted">CASOS DE USO</p>
            <div className="flex flex-wrap gap-[10px]">
              {USE_CASES.map((c) => (
                <span
                  key={c}
                  className="rounded-pill bg-pink-200 px-[18px] py-[10px] text-[14px] font-extrabold text-cherry-dark"
                >
                  {c}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal className="mt-[30px] rounded-[20px] bg-cream-100 px-6 py-[22px]">
            <p className="m-0 text-[14px] font-semibold leading-[1.6] text-ink-secondary">
              <strong className="text-cherry-dark">Honestidade de estado.</strong> A plataforma está
              em desenvolvimento ativo; os SDKs estão em diferentes graus de maturidade; o sandbox é
              simulado e está ao nível de conformidade L0. Os exemplos usam o ambiente sandbox — não
              publicamos endpoints, chaves ou comandos que não sejam verdadeiros no momento da
              publicação.
            </p>
          </Reveal>
        </div>
      </section>

      <CTASection />
      <Footer />
    </div>
  );
}
