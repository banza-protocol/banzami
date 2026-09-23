import Link from 'next/link';
import { Reveal } from '@/components/Reveal';
import { ScaledPhone } from '@/components/app/ScaledPhone';

// Two ways into Banzami — receive as a business, or integrate as a developer.
// Each path pairs its message with a real visual: the App Banzami receive
// screen (a QR to be paid), and an honest Sandbox API call (the real endpoint,
// sandbox-api.banzami.com/v1/payment-sessions). A deepening of the hero, not a
// repeat.

const DEVELOPERS_URL = 'https://developers.banzami.com/login';
const DOCS_URL = 'https://developers.banzami.com/docs';

function Arrow({ light }: { light?: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke={light ? '#fff' : 'currentColor'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The developer visual: a dark code window with a language selector and the
// real Sandbox call. The tabs name the SDKs; cURL is shown.
function CodeCard() {
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-[20px] bg-[#1a1416] shadow-[0_40px_80px_-40px_rgba(40,3,8,0.6)] ring-1 ring-white/10">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#E8434B]" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <div className="ml-3 flex items-center gap-1.5 text-[12px] font-bold">
          <span className="rounded-[7px] bg-white/12 px-2.5 py-1 text-white">cURL</span>
          <span className="rounded-[7px] px-2.5 py-1 text-white/45">JavaScript</span>
          <span className="rounded-[7px] px-2.5 py-1 text-white/45">Python</span>
        </div>
      </div>
      <pre className="m-0 overflow-x-auto px-[18px] py-4 font-mono text-[12.5px] leading-[1.7] text-white/85">
        <code>
          <span className="text-[#E8434B]">curl</span> -X <span className="text-[#F0A6AC]">POST</span> https://sandbox-api.banzami.com/v1/payment-sessions <span className="text-white/40">\</span>
          {'\n  '}-H <span className="text-[#8FD19E]">&quot;Authorization: Bearer $BANZAMI_KEY&quot;</span> <span className="text-white/40">\</span>
          {'\n  '}-H <span className="text-[#8FD19E]">&quot;Content-Type: application/json&quot;</span> <span className="text-white/40">\</span>
          {'\n  '}-d <span className="text-[#8FD19E]">&apos;{'{'}</span>
          {'\n      '}<span className="text-[#F0A6AC]">&quot;amount_minor&quot;</span>: <span className="text-[#E8C06A]">25000</span>,
          {'\n      '}<span className="text-[#F0A6AC]">&quot;currency&quot;</span>: <span className="text-[#8FD19E]">&quot;AOA&quot;</span>,
          {'\n      '}<span className="text-[#F0A6AC]">&quot;purpose&quot;</span>: <span className="text-[#8FD19E]">&quot;ORDER&quot;</span>
          {'\n  '}<span className="text-[#8FD19E]">{'}'}&apos;</span>
        </code>
      </pre>
    </div>
  );
}

export function HomePaths() {
  const eyebrow = 'inline-flex w-fit items-center rounded-pill px-3 py-1 text-[11.5px] font-black tracking-[0.1em]';
  const title = 'm-0 mt-4 text-[clamp(24px,2.6vw,32px)] font-black leading-[1.08] tracking-[-0.02em] text-ink';
  const body = 'm-0 mt-3 max-w-[360px] text-[15.5px] font-semibold leading-[1.55] text-ink-secondary';

  return (
    <section className="bg-[#FFF7F6] px-6 py-[clamp(64px,9vw,108px)]">
      <div className="mx-auto grid max-w-container grid-cols-1 gap-x-[clamp(28px,4vw,64px)] gap-y-[clamp(48px,6vw,72px)] xl:grid-cols-2">
        {/* ── NEGÓCIOS ── */}
        <Reveal className="flex flex-col items-center gap-8 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <span className={`${eyebrow} bg-pink-100 text-cherry`}>PARA NEGÓCIOS</span>
            <h3 className={title}>Receba com Banzami</h3>
            <p className={body}>QR, links e ferramentas de cobrança para o seu negócio na Sandbox.</p>
            <Link
              href="/comerciantes"
              className="mt-7 inline-flex items-center gap-2 rounded-pill bg-[linear-gradient(180deg,#B5101F,#9A1B22)] px-[20px] py-[13px] text-[14.5px] font-black text-white no-underline shadow-[0_16px_32px_-18px_rgba(181,16,31,.55)] transition-transform hover:-translate-y-0.5"
            >
              Explorar para negócios <Arrow light />
            </Link>
          </div>
          <div className="relative flex flex-none items-center justify-center">
            <span aria-hidden className="absolute h-[78%] w-[78%] rounded-[40px] bg-pink-100/70 blur-[2px]" />
            <div className="relative drop-shadow-[0_34px_60px_-34px_rgba(181,16,31,0.45)]">
              <ScaledPhone frame="receber" width={196} />
            </div>
          </div>
        </Reveal>

        {/* ── DEVELOPERS ── */}
        <Reveal delay={90} className="flex flex-col items-center gap-8 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <span className={`${eyebrow} bg-[#efe7e7] text-ink-secondary`}>PARA DEVELOPERS</span>
            <h3 className={title}>Integre Banzami</h3>
            <p className={body}>APIs, SDKs e webhooks para testar pagamentos diretamente no seu produto.</p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href={DEVELOPERS_URL}
                className="inline-flex items-center gap-2 rounded-pill bg-ink px-[20px] py-[13px] text-[14.5px] font-black text-white no-underline shadow-[0_16px_32px_-18px_rgba(0,0,0,.5)] transition-transform hover:-translate-y-0.5"
              >
                Portal Developers <Arrow light />
              </a>
              <a href={DOCS_URL} className="inline-flex items-center gap-2 text-[14.5px] font-black text-cherry no-underline transition hover:gap-2.5 hover:text-cherry-dark">
                Documentação <Arrow />
              </a>
            </div>
          </div>
          <div className="relative flex flex-none items-center justify-center">
            <span aria-hidden className="absolute h-[86%] w-[86%] rounded-[40px] bg-pink-100/70 blur-[2px]" />
            <div className="relative">
              <CodeCard />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
