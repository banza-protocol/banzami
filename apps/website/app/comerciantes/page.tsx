import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { CTASection } from '@/components/site/CTASection';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { PhoneFrame } from '@/components/app/PhoneFrame';
import { AppScreen } from '@/components/app/AppScreen';
import { Mono } from '@/components/primitives';
import { mailto } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Comerciantes',
  description:
    'Aceita pagamentos digitais sem terminal físico. Imprime um QR, partilha um link, recebe em segundos dentro da rede. Dashboard, histórico e conciliação em tempo real.',
};

// COMO COMEÇAR — três passos (Comerciantes.dc.html §COMO COMEÇAR).
const STEPS: { n: string; title: string; body: React.ReactNode; icon: React.ReactNode }[] = [
  {
    n: '1',
    title: 'Cria a tua carteira',
    body: (
      <>
        Registas o negócio e recebes uma carteira e um <Mono>@banza</Mono>.
      </>
    ),
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="13" rx="3" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M3 10h18" stroke="#B5101F" strokeWidth="1.8" />
        <circle cx="16.5" cy="14.5" r="1.4" fill="#E8434B" />
      </svg>
    ),
  },
  {
    n: '2',
    title: 'Gera um QR ou link',
    body: 'Cola o QR no balcão ou partilha o link por WhatsApp ou SMS.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#B5101F" strokeWidth="1.8" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#B5101F" strokeWidth="1.8" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#B5101F" strokeWidth="1.8" />
        <path
          d="M14 14h3v3M21 14v7h-7"
          stroke="#B5101F"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    n: '3',
    title: 'Recebe em segundos',
    body: 'O cliente faz scan, confirma e pagas. Creditado na tua carteira, dentro da rede.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M13 2L5 13h6l-1 9 8-12h-6l1-8z"
          stroke="#B5101F"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

// VANTAGENS — seis cartões (Comerciantes.dc.html §VANTAGENS).
const ADVANTAGES: {
  title: React.ReactNode;
  body: React.ReactNode;
  delay?: number;
  icon: React.ReactNode;
}[] = [
  {
    title: 'Sem terminal físico',
    body: 'Nada de TPA/POS — basta um smartphone.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="6" y="2.5" width="12" height="19" rx="3" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M10 18.5h4" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Confirmação criptográfica',
    body: 'Um recibo na carteira substitui o screenshot.',
    delay: 50,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3l7 3v5c0 4.2-2.9 7.5-7 8.5-4.1-1-7-4.3-7-8.5V6l7-3z"
          stroke="#B5101F"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 11.5l2 2 4-4"
          stroke="#B5101F"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: 'Dashboard em tempo real',
    body: 'Saldo, transações e análises num só painel.',
    delay: 100,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 4v16h16"
          stroke="#B5101F"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="7" y="12" width="3" height="5" rx="1" stroke="#B5101F" strokeWidth="1.8" />
        <rect x="12" y="9" width="3" height="8" rx="1" stroke="#B5101F" strokeWidth="1.8" />
        <rect x="17" y="6" width="3" height="11" rx="1" stroke="#B5101F" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    title: <>Histórico &amp; conciliação</>,
    body: (
      <>
        Cada pagamento com data/hora, valor e <Mono>@banza</Mono>.
      </>
    ),
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="3" width="14" height="18" rx="3" stroke="#B5101F" strokeWidth="1.8" />
        <path d="M9 8h6M9 12h6M9 16h4" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Onboarding em minutos',
    body: 'Sem volume mínimo e sem burocracia de cartão.',
    delay: 50,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#B5101F" strokeWidth="1.8" />
        <path
          d="M12 7v5l3.5 2"
          stroke="#B5101F"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: 'Liquidação na rede',
    body: 'Creditado no momento da confirmação, dentro da rede.',
    delay: 100,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M13 2L5 13h6l-1 9 8-12h-6l1-8z"
          stroke="#B5101F"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function ComerciantesPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-16 pt-[clamp(110px,16vw,130px)]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.7),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto grid max-w-container grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="mb-[22px] inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-cherry shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
              <span className="h-2 w-2 rounded-full bg-cherry" />
              Para o teu negócio
            </span>
            <h1 className="m-0 text-[clamp(38px,5.4vw,64px)] font-black leading-[1.02] tracking-[-0.03em] text-ink">
              Aceita pagamentos sem terminal.
            </h1>
            <p className="m-0 mt-5 max-w-[520px] text-[clamp(16px,1.5vw,19px)] font-semibold leading-[1.55] text-ink-secondary">
              Imprime um QR, partilha um link, recebe em segundos dentro da rede. Onboarding em
              minutos, sem hardware e sem volume mínimo.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={mailto('Quero aceitar pagamentos')}
                className="inline-flex items-center gap-2 rounded-[40px] bg-cherry px-[30px] py-4 text-[16px] font-extrabold text-white no-underline shadow-[0_14px_30px_-10px_rgba(181,16,31,.5)] transition-[transform,background] duration-200 hover:-translate-y-0.5 hover:bg-cherry-dark"
              >
                Quero aceitar pagamentos
              </a>
              <a
                href="#como"
                className="inline-flex items-center gap-2 rounded-[40px] bg-white px-7 py-4 text-[16px] font-extrabold text-cherry no-underline shadow-[0_8px_22px_-10px_rgba(0,0,0,.18)] transition-[transform,background] duration-200 hover:-translate-y-0.5 hover:bg-cream-100"
              >
                Como começar
              </a>
            </div>
          </div>

          {/* Phone — Receber screen with @cantina.alex (README §Comerciantes). */}
          <div className="relative flex min-h-[680px] items-center justify-center">
            <div className="absolute h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.1),rgba(232,67,75,0)_70%)]" />
            <PhoneFrame float>
              <AppScreen frame="receber" handle="@cantina.alex" />
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* COMO COMEÇAR */}
      <section id="como" className="bg-[linear-gradient(180deg,#fff,#FFF7F6)] px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mx-auto mb-11 max-w-[600px] text-center">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">COMO COMEÇAR</p>
            <h2 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[1.06] tracking-[-0.02em] text-ink">
              Em três passos, sem burocracia.
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal
                key={s.n}
                delay={i * 80}
                className="rounded-card bg-white p-[30px] shadow-[0_14px_40px_-24px_rgba(181,16,31,.2)]"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-cherry text-[17px] font-black text-white">
                    {s.n}
                  </span>
                  <span className="flex h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-cream-100">
                    {s.icon}
                  </span>
                </div>
                <h3 className="m-0 mb-2 text-[19px] font-black text-ink">{s.title}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CENÁRIOS */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mx-auto mb-11 max-w-[640px] text-center">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">DOIS CENÁRIOS</p>
            <h2 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[1.06] tracking-[-0.02em] text-ink">
              Recebe de um cliente — ou de uma mesa inteira.
            </h2>
            <p className="m-0 mt-4 text-[17px] font-semibold leading-[1.55] text-ink-secondary">
              O mesmo <Mono>@banza</Mono> aceita um pagamento simples ou vários ao mesmo tempo.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
            {/* A · PAGAMENTO SIMPLES */}
            <Reveal className="flex flex-col rounded-[28px] bg-white p-[30px] shadow-[0_24px_60px_-34px_rgba(181,16,31,.28)]">
              <span className="mb-4 self-start rounded-pill bg-pink-200 px-[13px] py-1.5 text-[11px] font-black tracking-[0.04em] text-cherry-dark">
                PAGAMENTO SIMPLES
              </span>
              <h3 className="m-0 mb-1.5 text-[20px] font-black text-ink">Um cliente paga ao balcão</h3>
              <p className="m-0 mb-6 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">
                O cliente lê o teu QR, confirma o valor e recebes na hora.
              </p>
              <div className="mt-auto flex justify-center pt-1.5">
                <PhoneFrame>
                  <AppScreen frame="comprovativo" />
                </PhoneFrame>
              </div>
            </Reveal>

            {/* B · PAGAMENTO PARTILHADO */}
            <Reveal
              delay={80}
              className="flex flex-col rounded-[28px] bg-white p-[30px] shadow-[0_24px_60px_-34px_rgba(181,16,31,.28)]"
            >
              <span className="mb-4 self-start rounded-pill bg-pink-200 px-[13px] py-1.5 text-[11px] font-black tracking-[0.04em] text-cherry-dark">
                PAGAMENTO PARTILHADO
              </span>
              <h3 className="m-0 mb-1.5 text-[20px] font-black text-ink">
                Vários clientes dividem a conta
              </h3>
              <p className="m-0 mb-6 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">
                Cada um paga a sua parte para o mesmo <Mono>@banza</Mono>. Vês tudo conciliado, sem
                confusão.
              </p>
              <div className="mt-auto flex justify-center pt-1.5">
                <PhoneFrame>
                  <AppScreen frame="historico" />
                </PhoneFrame>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* VANTAGENS */}
      <section className="px-6 py-[clamp(56px,8vw,96px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-10 max-w-[640px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">VANTAGENS</p>
            <h2 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[1.06] tracking-[-0.02em] text-ink">
              Feito para cantinas, táxis, lojas e serviços.
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ADVANTAGES.map((a, i) => (
              <Reveal
                key={i}
                delay={a.delay}
                className="rounded-card bg-cream-50 p-[26px]"
              >
                <div className="mb-4 flex h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-white">
                  {a.icon}
                </div>
                <h3 className="m-0 mb-2 text-[18px] font-black text-ink">{a.title}</h3>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">{a.body}</p>
              </Reveal>
            ))}
          </div>

          {/* Nota honesta — levantamentos dependem de rails de saída ainda não ativos. */}
          <Reveal className="mt-7 rounded-[20px] bg-cream-100 px-6 py-[22px]">
            <p className="m-0 text-[14px] font-semibold leading-[1.6] text-ink-secondary">
              <strong className="text-cherry-dark">Nota honesta.</strong> Os levantamentos para conta
              bancária dependem de rails de saída aprovados que ainda não estão ativos — apresentados
              como capacidade da rede e roadmap, não como serviço comercial já disponível.
            </p>
          </Reveal>
        </div>
      </section>

      <CTASection />
      <Footer />
    </main>
  );
}
