import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { CTASection } from '@/components/CTASection';
import { Reveal } from '@/components/Reveal';
import { CodePanel } from '@/components/CodePanel';
import { SectionHeading } from '@/components/primitives';
import { mailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Para Programadores — API e SDKs de pagamento em Kwanza',
  description:
    'Uma API REST e SDKs oficiais para aceitar Kwanza nativamente em qualquer aplicação. Sandbox isolado, idempotência e webhooks assinados. Plataforma em desenvolvimento ativo.',
};

const CAPACIDADES = [
  { t: 'API REST', d: 'Versionada, idempotente, com tratamento de erros estruturado.' },
  { t: 'SDKs oficiais', d: 'Clientes tipados — o caminho recomendado, não chamadas HTTP artesanais.' },
  { t: 'Sandbox isolado', d: 'Ambiente simulado para desenvolver e testar sem dinheiro real.' },
  { t: 'Idempotência', d: 'Cada operação mutante aceita uma chave; repetir é sempre seguro.' },
  { t: 'Webhooks assinados', d: <>Eventos entregues com assinatura verificável (<span className="bz-mono text-[12px]">banza-signature</span>).</> },
  { t: 'QR / link / checkout', d: 'Helpers para iniciar pagamentos de várias formas.' },
];

const SDKS = [
  { name: 'TypeScript', pkg: '@banzami/sdk' },
  { name: 'Flutter', pkg: 'banzami_flutter' },
  { name: 'Python', pkg: 'banzami' },
  { name: 'PHP', pkg: 'banzami/sdk-php' },
  { name: 'Go', pkg: 'banzami-go' },
];

const CASOS = ['Apps de táxi', 'Delivery', 'Ecommerce', 'Doações', 'Escolas'];

export default function ProgramadoresPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <Nav active="/programadores" />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-16 pt-[130px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="bz-split relative mx-auto grid max-w-container grid-cols-1 items-center gap-12 md:grid-cols-[1fr_1.05fr]">
          <Reveal>
            <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-banzami shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
              <span className="h-2 w-2 rounded-full bg-banzami" />Developer Platform
            </span>
            <h1 className="m-0 text-[clamp(38px,5.4vw,64px)] font-black leading-[1.02] tracking-[-0.03em]">
              Aceita Kwanza dentro da tua app.
            </h1>
            <p className="m-0 mt-5 max-w-[520px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
              Uma API REST e SDKs oficiais para integrar pagamentos em Kwanza nativamente — do install
              ao primeiro pagamento em minutos, em sandbox.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={mailto('Acesso sandbox Banzami')} className="bz-btn-primary">
                Pedir acesso ao sandbox
              </a>
              <a href="#sdks" className="bz-btn-secondary">Ver SDKs</a>
            </div>
            <p className="bz-mono m-0 mt-[22px] text-[12.5px] font-semibold text-ink-soft">
              Plataforma em desenvolvimento ativo · exemplos em sandbox.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="anim-floaty-7">
              <CodePanel withWebhook />
            </div>
          </Reveal>
        </div>
      </section>

      {/* CAPACIDADES */}
      <section className="bg-gradient-to-b from-white to-pink-50 px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[640px]"
            eyebrow="CAPACIDADES"
            title="Seguro por defeito, rápido de integrar."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPACIDADES.map((c, i) => (
              <Reveal key={c.t} delay={(i % 3) * 50} className="bz-card">
                <h3 className="m-0 mb-2 text-[18px] font-black">{c.t}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-muted">{c.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SDKS */}
      <section id="sdks" className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-9 max-w-[640px]"
            eyebrow="SDKS OFICIAIS"
            title="Cinco linguagens, um só contrato."
            lead="Em diferentes graus de maturidade, todos sobre o mesmo protocolo aberto BANZA."
          />
          <div className="bz-grid5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {SDKS.map((s, i) => (
              <Reveal key={s.name} delay={i * 40} className="rounded-[20px] bg-pink-50 p-[22px]">
                <p className="m-0 text-[16px] font-black">{s.name}</p>
                <p className="bz-mono m-0 mt-2 text-[12px] text-banzami">{s.pkg}</p>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-7">
            <p className="m-0 mb-[14px] text-[14px] font-black text-ink-faint">CASOS DE USO</p>
            <div className="flex flex-wrap gap-[10px]">
              {CASOS.map((c) => (
                <span key={c} className="rounded-pill bg-pink-200 px-[18px] py-[10px] text-[14px] font-extrabold text-banzami-deep">
                  {c}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal className="mt-[30px] rounded-[20px] bg-pink-100 px-6 py-[22px]">
            <p className="m-0 text-[14px] font-semibold leading-[1.6] text-ink-secondary">
              <strong className="text-banzami-deep">Honestidade de estado.</strong> A plataforma está em
              desenvolvimento ativo; os SDKs estão em diferentes graus de maturidade; o sandbox é
              simulado e está ao nível de conformidade L0. Os exemplos usam o ambiente sandbox — não
              publicamos endpoints, chaves ou comandos que não sejam verdadeiros no momento da
              publicação.
            </p>
          </Reveal>
        </div>
      </section>

      <CTASection />
      <Footer />
    </main>
  );
}
