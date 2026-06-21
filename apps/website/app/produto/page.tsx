import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { CTASection } from '@/components/CTASection';
import { Reveal } from '@/components/Reveal';
import { PhoneMockup } from '@/components/PhoneMockup';
import { SectionHeading, SoftCard, Mono } from '@/components/primitives';
import { mailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Produto — A rede de pagamentos wallet-native de Angola',
  description:
    'Uma rede wallet-native: cada conta é uma carteira em Kwanza, cada pagamento é uma transferência instantânea — por QR, por @banza ou por link. Conhece o produto Banzami.',
};

const FORMAS: { t: React.ReactNode; d: React.ReactNode }[] = [
  {
    t: 'QR',
    d: 'Lê um QR no balcão e paga num toque. Estático (introduzes o valor) ou dinâmico (valor já codificado).',
  },
  {
    t: <Mono>@banza</Mono>,
    d: (
      <>
        Paga a uma pessoa ou negócio pelo nome — <span className="bz-mono text-[13px]">@maria</span>,
        não um IBAN.
      </>
    ),
  },
  {
    t: 'Link de pagamento',
    d: 'Um URL partilhável que substitui o "envia o comprovativo". Abre no browser e paga com a carteira.',
  },
];

const PRODUTOS = [
  { t: 'App Consumidor', d: <>Carteira Kwanza com <span className="bz-mono text-[12px]">@banza</span>, QR e transferências.</>, badge: 'EM DESENV.' },
  { t: 'App Comerciante', d: 'Aceita pagamentos sem terminal, com QR e links.', badge: 'EM PROGRESSO' },
  { t: 'Business Dashboard', d: 'Saldo, transações, análises e chaves API.', badge: 'EM PROGRESSO' },
  { t: 'Developer Platform', d: 'API REST, SDKs, sandbox e webhooks assinados.', badge: 'EM DESENV.' },
  { t: 'QR Payments', d: 'QR estático e dinâmico para presencial.', badge: 'EM PROGRESSO' },
  { t: 'SDKs & Checkout', d: 'TypeScript, Flutter, Python, PHP, Go + pay links.', badge: 'EM PROGRESSO' },
];

const LEDGER = [
  { t: 'Transferência entre carteiras', d: 'Cada pagamento é um movimento de uma carteira para outra.' },
  { t: 'Ledger de dupla entrada', d: 'Origem e destino que se equilibram, append-only e auditável.' },
  { t: 'Atómico e idempotente', d: 'Por inteiro ou não acontece; repetir o pedido não duplica.' },
  { t: 'Saldo derivado do ledger', d: 'Nunca alterado em silêncio — sempre exato (disponível, reservado, total).' },
];

export default function ProdutoPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <Nav active="/produto" />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-16 pt-[130px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="bz-herogrid relative mx-auto grid max-w-container grid-cols-1 items-center gap-12 md:grid-cols-[1.05fr_0.95fr]">
          <Reveal>
            <p className="bz-eyebrow">O PRODUTO</p>
            <h1 className="m-0 text-[clamp(38px,5.4vw,64px)] font-black leading-[1.02] tracking-[-0.03em]">
              Tudo para pagar e receber em Kwanza.
            </h1>
            <p className="m-0 mt-5 max-w-[520px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
              Uma rede wallet-native: cada conta é uma carteira, cada pagamento é uma transferência
              instantânea — por QR, por <span className="bz-mono text-banzami">@banza</span> ou por link.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={mailto('Descarregar a app Banzami')}
                className="bz-btn-primary w-full justify-center sm:w-auto sm:justify-start"
              >
                Descarregar app
              </a>
              <Link
                href="/programadores"
                className="bz-btn-secondary w-full justify-center sm:w-auto sm:justify-start"
              >
                Para programadores
              </Link>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <PhoneMockup />
          </Reveal>
        </div>
      </section>

      {/* FORMAS DE PAGAR */}
      <section className="bg-gradient-to-b from-white to-pink-50 px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[660px]"
            eyebrow="FORMAS DE PAGAR"
            title={<>Uma rede, várias formas de pagar.</>}
            lead="A mesma transferência entre carteiras, iniciada da forma que fizer sentido."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {FORMAS.map((f, i) => (
              <Reveal key={i} delay={(i % 3) * 60} className="bz-card">
                <h3 className="m-0 mb-2 text-[19px] font-black">{f.t}</h3>
                <p className="m-0 text-[15px] font-semibold leading-[1.5] text-ink-muted">{f.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUTOS */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[660px]"
            eyebrow="OS PRODUTOS"
            title="Para ti, para o teu negócio, para a tua app."
            lead="Cada produto é uma capacidade da rede — mostramos o estado real de cada um."
          />
          <div className="bz-grid4 grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {PRODUTOS.map((p, i) => (
              <Reveal
                key={i}
                delay={(i % 4) * 50}
                className="rounded-[22px] bg-white p-6 shadow-[0_14px_40px_-24px_rgba(181,16,31,.2)]"
              >
                <div className="mb-[14px] flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-pink-100">
                    <span className="h-[18px] w-[18px] rounded-[5px] bg-banzami/80" />
                  </div>
                  <span className="rounded-pill bg-pink-200 px-[9px] py-1 text-[10px] font-black text-banzami-deep">
                    {p.badge}
                  </span>
                </div>
                <h3 className="m-0 mb-[6px] text-[16px] font-black">{p.t}</h3>
                <p className="m-0 text-[13.5px] font-semibold leading-[1.5] text-ink-muted">{p.d}</p>
              </Reveal>
            ))}
            <Reveal
              delay={150}
              className="flex flex-col justify-between rounded-[22px] bg-gradient-to-br from-banzami to-banzami-deep p-6 text-white sm:col-span-2"
            >
              <div className="mb-[14px] flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-white/[0.18]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 3v6l-5 9a2 2 0 001.7 3h12.6a2 2 0 001.7-3l-5-9V3" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="rounded-pill bg-white/[0.22] px-[9px] py-1 text-[10px] font-black text-white">
                  L0 · DRY-RUN
                </span>
              </div>
              <div>
                <h3 className="m-0 mb-[6px] text-[16px] font-black">Sandbox</h3>
                <p className="m-0 text-[13.5px] font-semibold leading-[1.5] text-pink-200">
                  Ambiente simulado e isolado da produção, para testar sem risco. Operacional ao nível
                  de conformidade L0.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* COMO O DINHEIRO SE MOVE */}
      <section className="bg-gradient-to-b from-white to-pink-50 px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[660px]"
            eyebrow="COMO O DINHEIRO SE MOVE"
            title="Wallet-to-wallet, registado no ledger."
            lead="O dinheiro move-se de carteira para carteira, em tempo real, dentro da rede."
          />
          <div className="bz-grid2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {LEDGER.map((l, i) => (
              <SoftCard key={l.t} title={l.t} delay={(i % 2) * 60}>
                {l.d}
              </SoftCard>
            ))}
          </div>
          <Reveal className="mt-7 rounded-[20px] bg-pink-100 px-6 py-[22px]">
            <p className="m-0 text-[14px] font-semibold leading-[1.6] text-ink-secondary">
              <strong className="text-banzami-deep">Nota honesta.</strong> A liquidação instantânea
              acontece <strong className="text-ink-secondary">dentro da rede</strong>. O funding em
              Kwanza real e os levantamentos dependem de rails externos aprovados que{' '}
              <strong className="text-ink-secondary">ainda não estão ativos</strong> — apresentados
              como capacidade da rede e roadmap.
            </p>
          </Reveal>
        </div>
      </section>

      <CTASection />
      <Footer />
    </main>
  );
}
