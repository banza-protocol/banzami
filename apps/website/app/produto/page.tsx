import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { PhoneFrame } from '@/components/app/PhoneFrame';
import { AppScreen, type FrameName } from '@/components/app/AppScreen';
import { QrSyncShowcase } from '@/components/produto/QrSyncShowcase';
import { AppJourney } from '@/components/produto/AppJourney';
import { EcosystemFlow } from '@/components/produto/EcosystemFlow';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'Produto' };

/* ============================================================
   Scaled phone — renders the 300×620 PhoneFrame at a target
   width, keeping a clipped rounded device. Mirrors the
   dc-import scale wrappers in Produto.dc.html.
   ============================================================ */
function ScaledPhone({
  frame,
  width,
  valor,
  para,
  nota,
}: {
  frame: FrameName;
  width: number;
  valor?: string;
  para?: string;
  nota?: string;
}) {
  const scale = width / 300;
  const height = 620 * scale;
  return (
    <div style={{ width, height, overflow: 'hidden' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 300, height: 620 }}>
        <PhoneFrame>
          <AppScreen frame={frame} valor={valor} para={para} nota={nota} />
        </PhoneFrame>
      </div>
    </div>
  );
}

/* ---------- Como funciona steps ---------- */
const STEPS: {
  n: string;
  title: string;
  desc: string;
  chips: string[];
  frame: FrameName;
  valor?: string;
  para?: string;
  nota?: string;
}[] = [
  {
    n: '1',
    title: 'Scan',
    desc: 'Leia qualquer QR Banzami ou escolha diretamente um @banza.',
    chips: ['QR instantâneo', '@banza', 'Sem IBAN'],
    frame: 'scan',
  },
  {
    n: '2',
    title: 'Confirmar',
    desc: 'Valide a transação com PIN ou biometria antes do movimento do dinheiro.',
    chips: ['Face ID', 'PIN seguro', 'Controlo total'],
    frame: 'confpag',
  },
  {
    n: '3',
    title: 'Pago',
    desc: 'O valor é creditado em segundos e o comprovativo fica disponível imediatamente.',
    chips: ['Instantâneo', 'Comprovativo digital', 'Histórico'],
    frame: 'comprovativo',
    valor: '1 500',
    para: '@cantina-alex',
    nota: '1 Kg de Arroz',
  },
];

/* ---------- Solução bento grid (6 cards) ---------- */
const SOLUCAO_CARDS: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: <span className="bz-mono text-[22px] font-semibold text-cherry-dark">@</span>,
    title: 'Envie para qualquer @banza',
    desc: 'Envie dinheiro de forma simples usando o handle da pessoa, sem depender de IBANs longos ou processos complicados.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.6" stroke="#B5101F" strokeWidth="1.8" />
        <rect x="14" y="3" width="7" height="7" rx="1.6" stroke="#B5101F" strokeWidth="1.8" />
        <rect x="3" y="14" width="7" height="7" rx="1.6" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M14 14h3v3M21 14v7h-7" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Receba sem POS caro',
    desc: 'Pequenos negócios podem receber com QR e app, sem precisar de terminais dispendiosos.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.2 11.6l1.9 1.9 3.7-3.7" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Comprovativo vivo',
    desc: 'Cada pagamento termina com uma tela de confirmação clara, desenhada para reduzir falsificações e dúvidas.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M12 7.5v5l3.2 1.9" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Histórico claro',
    desc: 'Veja envios, recebimentos e confirmações num só lugar, com leitura simples e rápida.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 10v8a1 1 0 001 1h14a1 1 0 001-1v-8" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 6h18l-1.2 4.2a2.2 2.2 0 01-4.2 0 2.2 2.2 0 01-4.4 0 2.2 2.2 0 01-4.4 0A2.2 2.2 0 014.2 10L3 6z" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Feito para comerciantes',
    desc: 'De cantinas a táxis e bancas, o Banzami adapta-se ao comércio real do dia a dia em Angola.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 12l9 5 9-5M3 16.5l9 5 9-5" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Infraestrutura pronta para crescer',
    desc: 'Produto, comerciante e programador conectados sobre uma base moderna e escalável.',
  },
];

/* ---------- Produtos (estado real de cada um) ---------- */
const PRODUTOS: { icon: ReactNode; badge: string; title: string; desc: ReactNode }[] = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="6" y="2.5" width="12" height="19" rx="3" stroke="#B5101F" strokeWidth="1.7" />
      </svg>
    ),
    badge: 'EM DESENV.',
    title: 'App Consumidor',
    desc: (
      <>
        Carteira Kwanza com <span className="bz-mono text-[12px]">@banza</span>, QR e transferências.
      </>
    ),
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8h16l-1.2 11.2A2 2 0 0116.8 21H7.2A2 2 0 015.2 19.2L4 8z" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    ),
    badge: 'EM PROGRESSO',
    title: 'App Comerciante',
    desc: 'Aceita pagamentos sem terminal, com QR e links.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="18" height="14" rx="3" stroke="#B5101F" strokeWidth="1.7" />
        <path d="M7 14l3-3 2.5 2L17 9" stroke="#B5101F" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    badge: 'EM PROGRESSO',
    title: 'Business Dashboard',
    desc: 'Saldo, transações, análises e chaves API.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" stroke="#B5101F" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    badge: 'EM DESENV.',
    title: 'Developer Platform',
    desc: 'API REST, SDKs, sandbox e webhooks assinados.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="#B5101F" strokeWidth="1.7" />
        <path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z" fill="#B5101F" />
      </svg>
    ),
    badge: 'EM PROGRESSO',
    title: 'QR Payments',
    desc: 'QR estático e dinâmico para presencial.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4-8-4z" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" stroke="#B5101F" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    ),
    badge: 'EM PROGRESSO',
    title: 'SDKs & Checkout',
    desc: 'TypeScript, Flutter, Python, PHP, Go + pay links.',
  },
];

/* ---------- A app — journey screens (horizontal scroll) ---------- */
const APP_STEPS: {
  n: string;
  label: string;
  caption: string;
  frame: FrameName;
  valor?: string;
  para?: string;
  nota?: string;
}[] = [
  { n: '01', label: 'Splash', caption: 'entrada visual da app', frame: 'splash' },
  { n: '02', label: 'Boas-vindas', caption: 'primeira apresentação ao utilizador', frame: 'welcome' },
  { n: '03', label: 'Criar conta', caption: 'escolhe o teu @banza', frame: 'criar' },
  { n: '04', label: 'Entrar', caption: 'acesso rápido e simples', frame: 'entrar' },
  { n: '05', label: 'Início', caption: 'saldo, atalhos e ações', frame: 'inicio' },
  { n: '06', label: 'Scan', caption: 'lê o QR para pagar', frame: 'scan' },
  { n: '07', label: 'Confirmar', caption: 'confirma valor e destinatário', frame: 'confpag' },
  { n: '08', label: 'Comprovativo', caption: 'prova viva do pagamento', frame: 'comprovativo', valor: '1 500', para: '@cantina-alex', nota: '1 Kg de Arroz' },
  { n: '09', label: 'Enviar', caption: 'envia dinheiro em segundos', frame: 'enviar' },
  { n: '10', label: 'Confirmar envio', caption: 'revê antes de concluir', frame: 'confenvio' },
  { n: '11', label: 'Receber', caption: 'QR e link de pagamento', frame: 'receber' },
  { n: '12', label: 'Histórico', caption: 'acompanha a atividade', frame: 'historico' },
  { n: '13', label: 'Perfil', caption: 'conta, PIN e segurança', frame: 'perfil' },
  { n: '14', label: 'Partilhar QR', caption: 'recebe via QR partilhável', frame: 'partilhar' },
];

/* ---------- Tecnologia — 4 cards ---------- */
const TECH_CARDS: { icon: ReactNode; tag: string; title: string; desc: string }[] = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 12a8 8 0 0113-6.2M20 12a8 8 0 01-13 6.2" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M17 3.5V7h-3.5M7 20.5V17h3.5" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    tag: 'idempotente',
    title: 'Atomicidade & idempotência',
    desc: 'Ou acontece por inteiro, ou não acontece. Repetir a mesma operação devolve o resultado original.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="3" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M9 8h6M9 12h6M9 16h4" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    tag: 'append-only',
    title: 'Auditoria append-only',
    desc: 'Os registos são imutáveis e auditáveis, sem mutações silenciosas nem perda de contexto.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 12h4l2.5 6 4-13 2.5 7H21" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    tag: 'traceável',
    title: 'Traces & observabilidade',
    desc: 'Cada operação deixa um rasto verificável da origem ao destino, com logs, métricas e contexto.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 12l9 5 9-5" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    tag: 'isolado',
    title: 'Separação sandbox / produção',
    desc: 'Ambientes isolados por princípio. O ambiente de teste nunca toca nos dados nem nos fluxos de produção.',
  },
];

/* ---------- Problema cards ---------- */
const PROBLEMA: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2.5" y="6" width="19" height="12" rx="3" stroke="#B5101F" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.6" stroke="#B5101F" strokeWidth="1.8" />
      </svg>
    ),
    title: 'Dinheiro físico',
    desc: 'Custo e risco para quem paga e para quem recebe.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="3" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    title: 'Comprovativos',
    desc: 'Screenshots de transferências por WhatsApp como "prova".',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M12 7v5l3.5 2" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Confirmações lentas',
    desc: 'A espera até o dinheiro "aparecer" do outro lado.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="2.5" width="14" height="19" rx="3" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M9 6h6" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    title: 'Terminais caros',
    desc: 'TPA/POS dispendiosos e fora do alcance dos pequenos.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9" cy="8" r="3.2" stroke="#B5101F" strokeWidth="1.8" />
      </svg>
    ),
    title: 'Pequenos de fora',
    desc: 'Cantinas, táxis e bancas ficam fora do digital.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Sem APIs simples',
    desc: 'Sem uma API de pagamentos nativa em Kwanza.',
  },
];

/* ---------- shared check icons ---------- */
function CheckTile({ light }: { light?: boolean }) {
  return (
    <span
      className="inline-flex flex-none items-center justify-center"
      style={{
        width: 20,
        height: 20,
        borderRadius: 7,
        background: light ? 'rgba(255,255,255,.18)' : '#FBD2D0',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13l4 4L19 7" stroke={light ? '#fff' : '#9A1B22'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function ProdutoPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* ===================== COMO FUNCIONA ===================== */}
      <section
        id="como-funciona"
        className="px-6 py-[clamp(64px,9vw,104px)] pt-[clamp(110px,12vw,150px)]"
        style={{ background: 'linear-gradient(180deg,rgba(181,16,31,.03),rgba(181,16,31,.01))' }}
      >
        <div className="mx-auto max-w-container">
          <Reveal className="mx-auto mb-[52px] max-w-[640px] text-center">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">COMO FUNCIONA</p>
            <h2 className="m-0 text-[clamp(28px,4.2vw,48px)] font-black leading-[1.04] tracking-[-0.025em]">
              Um pagamento em menos de 10 segundos.
            </h2>
            <p className="m-0 mt-[18px] text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              Uma experiência desenhada para desaparecer. Sem IBANs, sem terminais complexos, sem
              esperas — apenas três gestos naturais.
            </p>
          </Reveal>

          <Reveal className="bz-howrow flex flex-col items-center justify-center gap-[18px] md:flex-row md:items-start">
            {STEPS.map((s, i) => (
              <div key={s.n} className="contents">
                <div className="flex w-[250px] flex-none flex-col items-center">
                  <ScaledPhone frame={s.frame} width={250} valor={s.valor} para={s.para} nota={s.nota} />
                  <div className="mt-5 flex items-center gap-[10px]">
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-cherry text-[15px] font-black text-white">
                      {s.n}
                    </span>
                    <span className="text-[21px] font-black text-ink">{s.title}</span>
                  </div>
                  <p className="m-0 mt-[10px] text-center text-[14px] font-semibold leading-[1.5] text-ink-secondary">
                    {s.desc}
                  </p>
                  <div className="mt-[13px] flex flex-wrap justify-center gap-[7px]">
                    {s.chips.map((c) => (
                      <span
                        key={c}
                        className="rounded-pill bg-cream-100 px-[10px] py-[5px] text-[11px] font-extrabold text-cherry-dark"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="bz-conn relative hidden h-[3px] min-w-[50px] flex-1 self-start md:block"
                    style={{
                      marginTop: 235,
                      borderRadius: 3,
                      background: 'linear-gradient(90deg,#FBD2D0,#E8434B,#FBD2D0)',
                    }}
                  >
                    <span
                      className="anim-coin absolute"
                      style={{
                        top: '50%',
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#B5101F',
                        boxShadow: '0 0 10px 2px rgba(232,67,75,.5)',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </Reveal>

          <div className="mt-[50px] flex flex-wrap items-center justify-center gap-[18px]">
            <span className="h-px w-[54px]" style={{ background: '#E8C8C6' }} />
            <p className="m-0 max-w-[520px] text-center text-[13px] font-semibold leading-[1.55] text-ink-muted">
              O dinheiro move-se entre carteiras Banzami, com registo seguro em ledger de dupla
              entrada.
            </p>
            <span className="h-px w-[54px]" style={{ background: '#E8C8C6' }} />
          </div>
        </div>
      </section>

      {/* ===================== SOLUÇÃO ===================== */}
      <section id="solucao" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-9 max-w-[720px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">A SOLUÇÃO</p>
            <h2 className="m-0 text-[clamp(28px,4vw,46px)] font-black leading-[1.06] tracking-[-0.02em]">
              Tudo o que precisa para pagar em Angola.
            </h2>
            <p className="m-0 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              Do envio entre pessoas ao pagamento por QR, o Banzami junta numa só app o que hoje
              ainda está espalhado entre notas, comprovativos e confirmações lentas.
            </p>
          </Reveal>

          {/* big QR card */}
          <Reveal className="bz-split mb-4 grid grid-cols-1 items-center gap-[34px] rounded-[28px] border border-border-soft bg-[linear-gradient(135deg,#fff,#FFF1F0)] p-[clamp(26px,3.4vw,40px)] shadow-[0_30px_70px_-40px_rgba(181,16,31,.4)] md:grid-cols-[1.1fr_0.9fr]">
            <QrSyncShowcase />
          </Reveal>

          {/* 6-card grid */}
          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {SOLUCAO_CARDS.map((c) => (
              <div
                key={c.title}
                className="rounded-[22px] border border-border-soft bg-white p-6 shadow-[0_16px_40px_-28px_rgba(181,16,31,.3)] transition-all hover:-translate-y-1 hover:shadow-[0_26px_52px_-28px_rgba(181,16,31,.42)]"
              >
                <span className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-[linear-gradient(150deg,#FBD2D0,#FFE7E5)]">
                  {c.icon}
                </span>
                <h3 className="m-0 mb-[7px] text-[18px] font-black text-ink">{c.title}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== PRODUTOS ===================== */}
      <section id="produtos" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-10 max-w-[660px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">PRODUTOS</p>
            <h2 className="m-0 text-[clamp(28px,4vw,46px)] font-black leading-[1.06] tracking-[-0.02em]">
              Para ti, para o teu negócio, para a tua app.
            </h2>
            <p className="m-0 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              Cada produto é uma capacidade da rede — mostramos o estado real de cada um.
            </p>
          </Reveal>

          <div className="bz-grid4 grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {PRODUTOS.map((p, i) => (
              <Reveal
                key={p.title}
                delay={(i % 4) * 50}
                className="rounded-[22px] bg-white p-6 shadow-[0_14px_40px_-24px_rgba(181,16,31,.2)]"
              >
                <div className="mb-[14px] flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-cream-100">
                    {p.icon}
                  </div>
                  <span className="rounded-pill bg-pink-200 px-[9px] py-1 text-[10px] font-black text-cherry-dark">
                    {p.badge}
                  </span>
                </div>
                <h3 className="m-0 mb-[6px] text-[16px] font-black">{p.title}</h3>
                <p className="m-0 text-[13.5px] font-semibold leading-[1.5] text-ink-soft">{p.desc}</p>
              </Reveal>
            ))}

            {/* Sandbox — honest L0 dry-run card */}
            <Reveal
              delay={100}
              className="flex flex-col justify-between rounded-[22px] bg-[linear-gradient(140deg,#B5101F,#9A1B22)] p-6 text-white sm:col-span-2"
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
                  Ambiente simulado e isolado da produção, para testar sem risco. Operacional ao
                  nível de conformidade L0.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== A APP ===================== */}
      <section id="app" className="px-6 pt-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#FFF7F6,#fff)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-2 max-w-[660px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">A APP</p>
            <h2 className="m-0 text-[clamp(28px,4vw,46px)] font-black leading-[1.06] tracking-[-0.02em]">
              A app Banzami, de ponta a ponta.
            </h2>
            <p className="m-0 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              Criar conta, pagar, receber e confirmar — tudo em poucos passos.{' '}
              <span className="text-ink-muted">Arrasta para ver →</span>{' '}
              <Link href="/ecras" className="font-extrabold text-cherry no-underline">
                Ver todos os ecrãs ↗
              </Link>
            </p>
          </Reveal>
        </div>

        <AppJourney>
          {APP_STEPS.map((s) => (
            <div key={s.n} className="w-[216px] flex-none">
              <ScaledPhone frame={s.frame} width={216} valor={s.valor} para={s.para} nota={s.nota} />
              <div className="mt-[14px] flex items-center gap-[9px]">
                <span className="inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[9px] bg-cherry text-[12px] font-black text-white">
                  {s.n}
                </span>
                <span className="text-[15px] font-black text-ink">{s.label}</span>
              </div>
              <p className="m-0 ml-[35px] mt-[6px] text-[13px] font-semibold text-ink-soft">{s.caption}</p>
            </div>
          ))}
        </AppJourney>
      </section>

      {/* ===================== TECNOLOGIA / SEGURANÇA ===================== */}
      <section id="tecnologia" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-9 max-w-[720px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">TECNOLOGIA & SEGURANÇA</p>
            <h2 className="m-0 text-[clamp(28px,4vw,46px)] font-black leading-[1.06] tracking-[-0.02em]">
              Confiança é o produto.
            </h2>
            <p className="m-0 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              O saldo nasce do ledger, não de ajustes silenciosos. Cada operação deixa rasto, cada
              repetição devolve o mesmo resultado, e cada ambiente é isolado para proteger o sistema.
            </p>
          </Reveal>

          {/* ledger engine card */}
          <Reveal className="bz-split mb-4 grid grid-cols-1 items-center gap-[34px] rounded-[28px] border border-border-soft bg-[linear-gradient(135deg,#fff,#FFF1F0)] p-[clamp(26px,3.4vw,40px)] shadow-[0_30px_70px_-42px_rgba(181,16,31,.4)] md:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="bz-mono m-0 mb-[10px] text-[12px] font-semibold text-cherry">
                O MOTOR DE CONFIANÇA
              </p>
              <h3 className="m-0 text-[clamp(23px,3vw,32px)] font-black tracking-[-0.02em] text-ink">
                Ledger de dupla entrada
              </h3>
              <p className="m-0 mb-[18px] mt-[14px] text-[15.5px] font-semibold leading-[1.55] text-ink-secondary">
                Cada lançamento tem origem e destino que se equilibram. O saldo é derivado do ledger,
                não editado manualmente.
              </p>
              <div className="flex flex-wrap gap-2">
                {['imutável', 'idempotente', 'derivado do ledger'].map((t) => (
                  <span
                    key={t}
                    className="bz-mono rounded-pill bg-cream-100 px-[11px] py-[5px] text-[11px] font-semibold tracking-[0.03em] text-cherry"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative flex min-h-[248px] items-center justify-center">
              <div className="anim-pulsering absolute h-[150px] w-[150px] rounded-full border-2 border-[rgba(181,16,31,.16)]" />
              <div className="anim-pulsering absolute h-[150px] w-[150px] rounded-full border-2 border-[rgba(181,16,31,.16)]" style={{ animationDelay: '1.2s' }} />
              <div className="anim-spin-slow absolute h-[196px] w-[196px] rounded-full border-[1.5px] border-dashed border-[rgba(181,16,31,.28)]" />
              <div className="anim-floaty absolute left-[30px] top-[18px] h-[11px] w-[11px] rounded-full bg-cherry-coral" />
              <div className="anim-floaty-5 absolute bottom-6 right-[34px] h-[9px] w-[9px] rounded-full bg-pink-200" />
              <div className="anim-floaty-7 absolute right-[26px] top-10 h-[7px] w-[7px] rounded-full bg-cherry" />
              <div
                className="relative flex h-[112px] w-[112px] flex-col items-center justify-center rounded-[28px] text-white"
                style={{
                  background: 'linear-gradient(150deg,#B5101F,#6E0E14)',
                  boxShadow: '0 22px 44px -16px rgba(122,16,22,.6)',
                }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3v18M5 6.5l7-2.5 7 2.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 6.5l-2 5a3 3 0 006 0l-2-5M19 6.5l-2 5a3 3 0 006 0l-2-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="mt-[5px] text-[12px] font-extrabold">Ledger</span>
              </div>
            </div>
          </Reveal>

          {/* 4 tech cards */}
          <div className="bz-grid4 mb-4 grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {TECH_CARDS.map((c) => (
              <Reveal
                key={c.title}
                className="rounded-[22px] border border-border-soft bg-white p-6 shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)] transition-all hover:-translate-y-1 hover:shadow-[0_26px_52px_-30px_rgba(181,16,31,.4)]"
              >
                <div className="mb-[14px] flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-cream-100">
                    {c.icon}
                  </span>
                  <span className="bz-mono rounded-pill bg-cream-100 px-[11px] py-[5px] text-[11px] font-semibold tracking-[0.03em] text-cherry">
                    {c.tag}
                  </span>
                </div>
                <h3 className="m-0 mb-[7px] text-[17px] font-black text-ink">{c.title}</h3>
                <p className="m-0 text-[14px] font-semibold leading-[1.5] text-ink-soft">{c.desc}</p>
              </Reveal>
            ))}
          </div>

          {/* honest compliance card */}
          <Reveal className="flex scroll-mt-28 flex-wrap items-center justify-between gap-5 rounded-[24px] border-2 border-pink-200 bg-white p-[clamp(24px,3vw,32px)]">
            <div id="seguranca" className="flex max-w-[680px] items-center gap-[18px]">
              <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[15px] bg-cream-100">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z" stroke="#B5101F" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M9.2 11.6l1.9 1.9 3.7-3.7" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <div className="mb-1 flex items-center gap-[10px]">
                  <h3 className="m-0 text-[18px] font-black text-ink">KYC/KYB & AML-CFT</h3>
                  <span className="bz-mono rounded-pill bg-cream-100 px-[11px] py-[5px] text-[11px] font-semibold tracking-[0.03em] text-cherry">
                    compliance
                  </span>
                </div>
                <p className="m-0 text-[14px] font-semibold leading-[1.5] text-ink-soft">
                  Camada de conformidade e controlo regulatório, com dependências externas ainda não
                  operacionais. Não prometemos licença bancária.
                </p>
              </div>
            </div>
            <span className="rounded-pill bg-pink-200 px-[13px] py-[7px] text-[11px] font-extrabold tracking-[0.04em] text-cherry-dark">
              REQUISITO · NÃO OPERACIONAL
            </span>
          </Reveal>
        </div>
      </section>

      {/* ===================== PROBLEMA ===================== */}
      <section id="problema" className="px-6 py-[clamp(64px,9vw,104px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-11 max-w-[660px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">O PROBLEMA</p>
            <h2 className="m-0 text-[clamp(28px,4vw,46px)] font-black leading-[1.06] tracking-[-0.02em]">
              Pagar ainda depende de notas e de screenshots.
            </h2>
            <p className="m-0 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              O Banzami substitui tudo por um gesto simples: scan, confirmar, pago.
            </p>
          </Reveal>

          <div className="bz-grid3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {PROBLEMA.map((p, i) => (
              <Reveal key={p.title} delay={(i % 3) * 60} className="rounded-[24px] bg-cream-50 p-[26px]">
                <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[16px] bg-white">
                  {p.icon}
                </div>
                <h3 className="m-0 mb-[7px] text-[18px] font-extrabold">{p.title}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">{p.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== SOBRE · O ECOSSISTEMA ===================== */}
      <section id="sobre" className="px-6 py-[clamp(64px,9vw,104px)] bg-[linear-gradient(180deg,#fff,#FFF7F6)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-9 max-w-[760px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">SOBRE · O ECOSSISTEMA</p>
            <h2 className="m-0 text-[clamp(28px,4vw,46px)] font-black leading-[1.06] tracking-[-0.02em]">
              Banzami, construído sobre <span className="bz-mono">BANZA</span>.
            </h2>
            <p className="m-0 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              O Banzami é o operador de referência construído sobre o protocolo aberto BANZA. O BANZA
              define as regras. O Banzami transforma essas regras numa experiência de pagamento
              simples para pessoas e comerciantes em Angola.
            </p>
          </Reveal>

          {/* BANZA é a base */}
          <Reveal className="bz-split mb-4 grid grid-cols-1 items-center gap-[34px] rounded-[28px] border border-border-soft bg-white p-[clamp(26px,3.4vw,40px)] shadow-[0_30px_70px_-42px_rgba(181,16,31,.35)] md:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="bz-mono m-0 mb-[10px] text-[12px] font-semibold tracking-[0.04em] text-cherry">
                PROTOCOLO ABERTO
              </p>
              <h3 className="m-0 text-[clamp(24px,3vw,34px)] font-black tracking-[-0.02em] text-ink">
                BANZA é a base.
              </h3>
              <p className="m-0 mb-5 mt-[14px] text-[15.5px] font-semibold leading-[1.55] text-ink-secondary">
                O protocolo aberto que define regras, interoperabilidade, conformidade e certificação
                para pagamentos. Não é uma app. Não é um banco. Não é uma carteira. É a infraestrutura
                lógica que permite que operadores construam serviços compatíveis sobre a mesma base.
              </p>
              <a
                href={SITE.protocolUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-[7px] text-[14px] font-extrabold text-cherry no-underline"
              >
                Ver o protocolo BANZA ↗
              </a>
            </div>
            <div className="flex flex-col gap-[13px] rounded-[20px] bg-cream-50 p-6">
              {[
                'Regras públicas',
                'Interoperabilidade sem acordos bilaterais',
                'Conformidade verificável',
                'Certificação aberta',
              ].map((t) => (
                <div key={t} className="flex items-center gap-[10px]">
                  <CheckTile />
                  <span className="text-[14px] font-bold text-[#3a2a2e]">{t}</span>
                </div>
              ))}
            </div>
          </Reveal>

          {/* O produto / Porquê */}
          <div className="bz-split mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Reveal className="rounded-[24px] bg-[linear-gradient(150deg,#B5101F,#6E0E14)] p-[30px] text-white shadow-[0_26px_56px_-30px_rgba(122,16,22,.6)]">
              <p className="bz-mono m-0 mb-2 text-[12px] font-semibold text-pink-200">O PRODUTO</p>
              <h3 className="m-0 mb-[10px] text-[21px] font-black">Banzami é o produto.</h3>
              <p className="m-0 mb-[18px] text-[14.5px] font-semibold leading-[1.55] text-white/85">
                É a carteira e rede de pagamentos construída sobre o BANZA. É aqui que a tecnologia
                vira experiência real: enviar, receber, pagar por QR, usar @handles e aceitar
                pagamentos no dia a dia.
              </p>
              <div className="flex flex-col gap-[11px]">
                {[
                  'Carteira em Kwanza',
                  'Pagamentos por QR',
                  'Envios entre utilizadores',
                  'Ferramentas para comerciantes',
                ].map((t) => (
                  <div key={t} className="flex items-center gap-[10px]">
                    <CheckTile light />
                    <span className="text-[14px] font-bold text-white">{t}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal
              delay={80}
              className="rounded-[24px] border border-border-soft bg-white p-[30px] shadow-[0_20px_50px_-34px_rgba(181,16,31,.3)]"
            >
              <p className="bz-mono m-0 mb-2 text-[12px] font-semibold text-cherry">PORQUÊ</p>
              <h3 className="m-0 mb-[10px] text-[21px] font-black text-ink">Porque isso importa.</h3>
              <p className="m-0 mb-[18px] text-[14.5px] font-semibold leading-[1.55] text-ink-secondary">
                A maioria das pessoas não precisa de entender o protocolo — precisa de pagar com
                confiança. O valor do BANZA está precisamente aí: permitir que produtos como o
                Banzami sejam mais claros, mais consistentes e mais preparados para crescer sem
                depender de improviso.
              </p>
              <div className="flex flex-col gap-[11px]">
                {[
                  'Mais clareza',
                  'Mais confiança',
                  'Melhor base para crescer',
                  'Melhor experiência para quem paga e recebe',
                ].map((t) => (
                  <div key={t} className="flex items-center gap-[10px]">
                    <CheckTile />
                    <span className="text-[14px] font-bold text-[#3a2a2e]">{t}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Do protocolo ao pagamento */}
          <Reveal className="rounded-[24px] bg-cream-100 p-[clamp(22px,3vw,32px)]">
            <div className="mb-[18px] flex flex-wrap items-center justify-between gap-[14px]">
              <div>
                <h3 className="m-0 text-[20px] font-black text-ink">Do protocolo ao pagamento</h3>
                <p className="m-0 mt-[6px] text-[14.5px] font-semibold text-ink-secondary">
                  BANZA define a infraestrutura. Banzami entrega a experiência.
                </p>
              </div>
            </div>
            <EcosystemFlow />
          </Reveal>
        </div>
      </section>

      {/* ===================== CTA FINAL + FOOTER ===================== */}
      <CTASection id="contacto" />
      <Footer />
    </main>
  );
}
