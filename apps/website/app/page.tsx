import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { CTASection } from '@/components/CTASection';
import { Reveal } from '@/components/Reveal';
import { PhoneMockup } from '@/components/PhoneMockup';
import { MerchantDashboard } from '@/components/MerchantDashboard';
import { CodePanel } from '@/components/CodePanel';
import { StatusGrid, LevelGrid } from '@/components/Conformance';
import { SectionHeading, SoftCard, Mono } from '@/components/primitives';
import { SITE, mailto } from '@/lib/site';

const PROBLEMAS = [
  { t: 'Dinheiro físico', d: 'Custo e risco para quem paga e para quem recebe.' },
  { t: 'Comprovativos', d: 'Screenshots de transferências por WhatsApp como "prova".' },
  { t: 'Confirmações lentas', d: 'A espera até o dinheiro "aparecer" do outro lado.' },
  { t: 'Terminais caros', d: 'TPA/POS dispendiosos e fora do alcance dos pequenos.' },
  { t: 'Pequenos de fora', d: 'Cantinas, táxis e bancas ficam fora do digital.' },
  { t: 'Sem APIs simples', d: 'Sem uma API de pagamentos nativa em Kwanza.' },
];

const SOLUCOES: { t: React.ReactNode; d: React.ReactNode }[] = [
  { t: 'Carteira Kwanza', d: 'Saldo sempre exato: disponível, reservado, total — derivado do ledger.' },
  { t: <Mono>@banza</Mono>, d: <>Paga a <span className="bz-mono text-[13px]">@maria</span>, não a um IBAN.</> },
  { t: 'QR estático', d: 'Um código impresso transforma qualquer balcão num ponto de pagamento.' },
  { t: 'Links de pagamento', d: 'Um URL partilhável que substitui o "envia o comprovativo".' },
  { t: 'Em segundos', d: 'O destinatário é creditado no momento da confirmação, dentro da rede.' },
  { t: 'API e SDKs', d: 'REST, idempotente, com SDKs tipados para integração rápida.' },
];

const PASSOS = [
  { n: '1', t: 'Scan', d: <>Lê o QR do balcão ou escolhe um <span className="bz-mono text-[13px] text-banzami">@banza</span>.</> },
  { n: '2', t: 'Confirmar', d: 'Confirmas com PIN ou biometria. Uma transação atómica no ledger.' },
  { n: '3', t: 'Pago', d: 'Creditado em segundos, dentro da rede, com recibo na carteira.' },
];

const PRODUTOS = [
  { t: 'App Consumidor', d: <>Carteira Kwanza com <span className="bz-mono text-[12px]">@banza</span>, QR e transferências.</>, badge: 'EM DESENV.' },
  { t: 'App Comerciante', d: 'Aceita pagamentos sem terminal, com QR e links.', badge: 'EM PROGRESSO' },
  { t: 'Business Dashboard', d: 'Saldo, transações, análises e chaves API.', badge: 'EM PROGRESSO' },
  { t: 'Developer Platform', d: 'API REST, SDKs, sandbox e webhooks assinados.', badge: 'EM DESENV.' },
  { t: 'QR Payments', d: 'QR estático e dinâmico para presencial.', badge: 'EM PROGRESSO' },
  { t: 'SDKs & Checkout', d: 'TypeScript, Flutter, Python, PHP, Go + pay links.', badge: 'EM PROGRESSO' },
];

const SEGURANCA = [
  { t: 'Ledger de dupla entrada', d: 'Cada lançamento tem origem e destino que se equilibram. Tudo auditável.' },
  { t: 'Atomicidade & idempotência', d: 'Por inteiro ou não acontece. Repetir o pedido devolve o resultado original.' },
  { t: 'Auditoria append-only', d: 'Lançamentos imutáveis com rasto completo, sem mutações silenciosas.' },
  { t: 'Traces & observabilidade', d: 'Rastreabilidade da origem ao destino, com métricas e logs.' },
  { t: 'Separação sandbox / produção', d: 'Ambientes isolados. O sandbox nunca acede a dados de produção.' },
  { t: 'KYC/KYB & AML-CFT', d: 'Requisitos a cumprir — dependências externas ainda não operacionais. Não prometemos licença bancária.', bordered: true },
];

const ECOSSISTEMA = [
  { tag: 'BANZA', t: 'O protocolo aberto', d: 'Define regras, invariantes, contratos e a certificação. Existe independentemente do Banzami.', link: true },
  { tag: 'Banzami', t: 'O operador de referência', d: 'Constrói produto sobre o BANZA: carteiras, UX e serviços a comerciantes.', highlight: true },
  { tag: 'BanzAI', t: 'O sistema de conhecimento', d: 'Explica e ajuda a entender o protocolo. Não opera pagamentos nem certifica sozinho.' },
];

export default function HomePage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <Nav />

      {/* HERO */}
      <section id="inicio" className="relative overflow-hidden px-6 pb-[70px] pt-[130px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="pointer-events-none absolute -left-[160px] top-[240px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.12),rgba(232,67,75,0)_66%)]" />
        <div className="bz-herogrid relative mx-auto grid max-w-container grid-cols-1 items-center gap-12 md:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="mb-6 inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-banzami shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
              <span className="block h-2 w-2 rounded-full bg-banzami" />A carteira Kwanza de Angola
            </span>
            <h1 className="m-0 text-[clamp(40px,6vw,72px)] font-black leading-none tracking-[-0.03em] text-ink">
              O novo caminho do Kwanza.
            </h1>
            <p className="m-0 mt-[22px] max-w-[520px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
              Cada conta é uma carteira em Kwanza. Paga por QR, envia para um{' '}
              <span className="bz-mono font-semibold text-banzami">@banza</span> e recebe em segundos
              — sem dinheiro físico, sem comprovativos.
            </p>
            <div className="mt-[30px] flex flex-wrap gap-3">
              <a href={mailto('Descarregar a app Banzami')} className="bz-btn-primary">
                Descarregar app
              </a>
              <Link href="/programadores" className="bz-btn-secondary">
                Para programadores
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <div className="flex items-center">
                <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-white bg-pink-200 text-[13px] font-black text-banzami">J</span>
                <span className="-ml-[10px] inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-white bg-[#F8B4B1] text-[13px] font-black text-banzami-deep">A</span>
                <span className="-ml-[10px] inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-white bg-banzami-coral text-[13px] font-black text-white">M</span>
              </div>
              <p className="m-0 text-[13.5px] font-bold text-ink-soft">
                Construído sobre o protocolo aberto{' '}
                <a href={SITE.protocolUrl} target="_blank" rel="noopener noreferrer" className="bz-link">
                  BANZA ↗
                </a>
              </p>
            </div>
          </div>
          <PhoneMockup />
        </div>
      </section>

      {/* POSITIONING STRIP */}
      <section className="px-6 pb-4 pt-2">
        <div className="mx-auto flex max-w-container flex-wrap items-center justify-between gap-[18px] rounded-[28px] bg-pink-50 px-7 py-6">
          <p className="m-0 text-[clamp(15px,1.5vw,18px)] font-extrabold tracking-[-0.01em]">
            <span className="text-ink">BANZA é o protocolo.</span>{' '}
            <span className="text-banzami">Banzami é como Angola paga.</span>
          </p>
          <div className="flex flex-wrap gap-[9px] text-[13px] font-extrabold">
            <span className="rounded-pill bg-white px-[15px] py-2 text-ink-secondary">Wallet-native</span>
            <span className="rounded-pill bg-white px-[15px] py-2 text-ink-secondary">Kwanza · AOA</span>
            <span className="rounded-pill bg-white px-[15px] py-2 text-ink-secondary">Em segundos</span>
            <span className="rounded-pill bg-pink-200 px-[15px] py-2 text-banzami-deep">Em desenvolvimento ativo</span>
          </div>
        </div>
      </section>

      {/* PROBLEMA */}
      <section id="problema" className="bz-section px-6">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-11 max-w-[660px]"
            eyebrow="O PROBLEMA"
            title="Pagar ainda depende de notas e de screenshots."
            lead="O Banzami substitui tudo por um gesto simples: scan, confirmar, pago."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROBLEMAS.map((p, i) => (
              <SoftCard key={p.t} title={p.t} delay={(i % 3) * 60}>
                {p.d}
              </SoftCard>
            ))}
          </div>
        </div>
      </section>

      {/* SOLUÇÃO */}
      <section id="solucao" className="bz-section bg-gradient-to-b from-white to-pink-50 px-6">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-11 max-w-[660px]"
            eyebrow="A SOLUÇÃO"
            title={<>Uma rede. Uma carteira. Um <Mono>@banza</Mono>.</>}
            lead="Tudo o que precisas para pagar e receber em Kwanza — num só toque."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUCOES.map((s, i) => (
              <Reveal key={i} delay={(i % 3) * 60} className="bz-card">
                <h3 className="m-0 mb-2 text-[19px] font-black">{s.t}</h3>
                <p className="m-0 text-[15px] font-semibold leading-[1.5] text-ink-muted">{s.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="bz-section px-6">
        <div className="mx-auto max-w-container">
          <SectionHeading
            center
            className="mb-12 max-w-[600px]"
            eyebrow="COMO FUNCIONA"
            title="Scan. Confirmar. Pago."
            lead="O dinheiro move-se de carteira para carteira, registado num ledger de dupla entrada."
          />
          <div className="bz-grid3 mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PASSOS.map((p, i) => (
              <Reveal key={p.n} delay={i * 80} className="rounded-card bg-pink-50 p-[30px]">
                <span className="mb-4 inline-flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-banzami text-[17px] font-black text-white">
                  {p.n}
                </span>
                <h3 className="m-0 mb-2 text-[20px] font-black">{p.t}</h3>
                <p className="m-0 text-[15px] font-semibold leading-[1.5] text-ink-muted">{p.d}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="rounded-[28px] bg-gradient-to-br from-pink-50 to-[#FFEFEE] p-[clamp(28px,4vw,44px)]">
            <div className="bz-wallets mx-auto flex max-w-[720px] flex-col items-center justify-between gap-[18px] sm:flex-row">
              <div className="flex-1 text-center">
                <div className="mx-auto mb-3 flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-white shadow-[0_12px_26px_-12px_rgba(181,16,31,.3)]">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="6" width="18" height="13" rx="3" stroke="#B5101F" strokeWidth="1.8" />
                    <path d="M3 10h18" stroke="#B5101F" strokeWidth="1.8" />
                    <circle cx="16.5" cy="14.5" r="1.4" fill="#E8434B" />
                  </svg>
                </div>
                <p className="bz-mono m-0 text-[13px] font-semibold text-ink">@joao</p>
                <p className="m-0 mt-[3px] text-[12px] font-bold text-ink-faint">Consumidor</p>
              </div>
              <div className="relative mt-9 h-1 flex-[1.4] self-start rounded bg-pink-200">
                <div className="anim-coin absolute left-[8%] top-1/2 h-5 w-5 rounded-full bg-gradient-to-br from-banzami-coral to-banzami shadow-[0_0_14px_3px_rgba(232,67,75,.4)]" />
                <div className="anim-credit bz-mono absolute -top-[30px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold text-banzami">
                  +2.500 Kz
                </div>
              </div>
              <div className="flex-1 text-center">
                <div className="mx-auto mb-3 flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-gradient-to-br from-banzami to-banzami-deep shadow-[0_14px_30px_-10px_rgba(181,16,31,.5)]">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 21V9l9-6 9 6v12" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M9 21v-7h6v7" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="bz-mono m-0 text-[13px] font-semibold text-ink">@padaria-luanda</p>
                <p className="m-0 mt-[3px] text-[12px] font-bold text-ink-faint">Comerciante</p>
              </div>
            </div>
            <p className="mx-auto mt-[30px] max-w-[660px] text-center text-[13.5px] font-semibold leading-[1.55] text-ink-soft">
              A liquidação instantânea acontece <strong className="text-ink-secondary">dentro da rede</strong>. O
              funding em Kwanza real e os levantamentos dependem de rails externos aprovados que{' '}
              <strong className="text-ink-secondary">ainda não estão ativos</strong>.
            </p>
          </Reveal>
        </div>
      </section>

      {/* PRODUTOS */}
      <section id="produtos" className="bz-section bg-gradient-to-b from-white to-pink-50 px-6">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[660px]"
            eyebrow="PRODUTOS"
            title="Para ti, para o teu negócio, para a tua app."
            lead="Cada produto é uma capacidade da rede — mostramos o estado real de cada um."
          />
          <div className="bz-grid4 grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {PRODUTOS.map((p, i) => (
              <Reveal key={p.t} delay={(i % 4) * 50} className="rounded-[22px] bg-white p-6 shadow-[0_14px_40px_-24px_rgba(181,16,31,.2)]">
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
            <Reveal delay={150} className="flex flex-col justify-between rounded-[22px] bg-gradient-to-br from-banzami to-banzami-deep p-6 text-white sm:col-span-2">
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

      {/* COMERCIANTES */}
      <section id="comerciantes" className="bz-section px-6">
        <div className="bz-split mx-auto grid max-w-container grid-cols-1 items-center gap-12 md:grid-cols-2">
          <Reveal>
            <p className="bz-eyebrow">PARA COMERCIANTES</p>
            <h2 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[1.06] tracking-[-0.02em]">
              Aceita pagamentos sem terminal.
            </h2>
            <p className="m-0 mb-6 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              Imprime um QR, partilha um link, recebe em segundos. Onboarding em minutos, sem hardware.
            </p>
            <div className="flex flex-col gap-3">
              {[
                'Sem terminal físico — basta um smartphone.',
                'Confirmação criptográfica, não screenshot.',
                'Dashboard e histórico em tempo real.',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[10px] bg-pink-200">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke="#B5101F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <p className="m-0 text-[15.5px] font-bold text-[#3a2a2e]">{item}</p>
                </div>
              ))}
            </div>
            <p className="m-0 mt-6 rounded-box bg-pink-50 px-4 py-[14px] text-[13px] font-semibold leading-[1.55] text-ink-soft">
              Os levantamentos para conta bancária dependem de rails de saída aprovados ainda não
              ativos — capacidade da rede e roadmap, não serviço comercial já disponível.
            </p>
            <div className="mt-6">
              <Link href="/comerciantes" className="bz-link text-[15px]">
                Ver tudo para comerciantes ↗
              </Link>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <MerchantDashboard />
          </Reveal>
        </div>
      </section>

      {/* PROGRAMADORES */}
      <section id="programadores" className="bz-section bg-gradient-to-b from-pink-50 to-white px-6">
        <div className="bz-split mx-auto grid max-w-container grid-cols-1 items-center gap-12 md:grid-cols-[1fr_1.05fr]">
          <Reveal>
            <p className="bz-eyebrow">PARA PROGRAMADORES</p>
            <h2 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[1.06] tracking-[-0.02em]">
              Aceita Kwanza dentro da tua app.
            </h2>
            <p className="m-0 mb-6 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              Uma API e SDKs oficiais — do install ao primeiro pagamento em minutos, em sandbox.
            </p>
            <div className="mb-[22px] grid grid-cols-1 gap-[10px] sm:grid-cols-2">
              {[
                ['API REST', 'Versionada e idempotente.'],
                ['SDKs tipados', 'TS, Flutter, Python, PHP, Go.'],
                ['Sandbox isolado', 'Testa sem risco.'],
                ['Webhooks assinados', 'Assinatura verificável.'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-box bg-white p-[15px] shadow-[0_10px_30px_-20px_rgba(181,16,31,.25)]">
                  <p className="m-0 text-[14px] font-extrabold">{t}</p>
                  <p className="m-0 mt-1 text-[12.5px] font-semibold text-ink-soft">{d}</p>
                </div>
              ))}
            </div>
            <p className="m-0 rounded-box bg-pink-100 px-4 py-[14px] text-[13px] font-semibold leading-[1.55] text-ink-soft">
              Plataforma em desenvolvimento ativo. SDKs em diferentes graus de maturidade; exemplos
              correm em sandbox. O caminho recomendado é sempre via SDK oficial.
            </p>
            <div className="mt-6">
              <Link href="/programadores" className="bz-link text-[15px]">
                Ver a Developer Platform ↗
              </Link>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <CodePanel />
          </Reveal>
        </div>
      </section>

      {/* TECNOLOGIA / SEGURANÇA */}
      <section id="tecnologia" className="bz-section px-6">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[660px]"
            eyebrow="TECNOLOGIA & SEGURANÇA"
            title="Confiança é o produto."
            lead="O saldo é sempre derivado do ledger, nunca alterado em silêncio. Correção financeira no centro."
          />
          <div id="seguranca" className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SEGURANCA.map((s, i) => (
              <SoftCard key={s.t} title={s.t} delay={(i % 3) * 50} bordered={s.bordered}>
                {s.d}
              </SoftCard>
            ))}
          </div>
        </div>
      </section>

      {/* CONFORMANCE / TRANSPARÊNCIA */}
      <section id="conformance" className="bz-section bg-pink-50 px-6">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-9 max-w-[720px]"
            eyebrow="BANZA CONFORMANCE · TRANSPARÊNCIA"
            title="Transparentes sobre o que está pronto."
            lead={
              <>
                Corremos a suite oficial de conformance do BANZA contra o sandbox, como operador
                candidato. <strong className="text-ink">PASS significa evidência, não certificação.</strong> O
                Banzami não é certificado e ainda não está launch-ready.
              </>
            }
          />
          <Reveal className="mb-7">
            <StatusGrid />
          </Reveal>
          <Reveal>
            <LevelGrid />
            <p className="m-0 mt-6 text-[13px] font-semibold leading-[1.6] text-ink-soft">
              O certificado de produção{' '}
              <span className="bz-mono text-[12px] text-ink-secondary">/.well-known/banza/certificate.json</span>{' '}
              está intencionalmente ausente (404). A framework de certificação é propriedade do BANZA,
              não do Banzami. A produção depende de KYC/KYB, rails de money-in/money-out e dependências
              regulatórias.
            </p>
            <div className="mt-5">
              <Link href="/conformance" className="bz-link text-[15px]">
                Ver a página de transparência ↗
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* SOBRE / ECOSSISTEMA */}
      <section id="sobre" className="bz-section px-6">
        <div className="mx-auto max-w-container">
          <SectionHeading
            className="mb-10 max-w-[660px]"
            eyebrow="SOBRE · O ECOSSISTEMA"
            title="BANZA, Banzami e BanzAI."
            lead="O Banzami é o operador de referência construído sobre o protocolo aberto BANZA — não é o protocolo, nem um banco."
          />
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {ECOSSISTEMA.map((e, i) => (
              <Reveal
                key={e.tag}
                delay={i * 60}
                className={`rounded-card p-7 ${e.highlight ? 'bg-gradient-to-br from-pink-200 to-pink-100' : 'bg-pink-50'}`}
              >
                <p className="bz-mono m-0 mb-[10px] text-[13px] font-semibold text-banzami">{e.tag}</p>
                <h3 className="m-0 mb-2 text-[18px] font-black">{e.t}</h3>
                <p className={`m-0 text-[14.5px] font-semibold leading-[1.5] ${e.highlight ? 'text-[#7a5a5e]' : 'text-ink-muted'}`}>
                  {e.d}
                </p>
                {e.link && (
                  <a href={SITE.protocolUrl} target="_blank" rel="noopener noreferrer" className="bz-link mt-4 inline-flex items-center gap-[6px] text-[14px]">
                    Ver o protocolo BANZA ↗
                  </a>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CTASection id="contacto" />
      <Footer />
    </main>
  );
}
