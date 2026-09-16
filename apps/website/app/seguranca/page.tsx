import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { MailLink } from '@/components/MailLink';
import { PUBLIC_TRUTH } from '@/lib/public-truth';

// /seguranca — the owner page for public trust and security (PUBLIC-WEBSITE-
// RELEASE-001 §8/§21). Concrete controls, never marketing absolutes: no
// "military-grade", "unbreakable", "100% seguro". Names what is implemented and
// what belongs to the Financial Live approvals; no internal implementation detail.

export const metadata: Metadata = {
  title: 'Segurança',
  description:
    'Confiança por construção: ledger de dupla entrada, atomicidade e idempotência, auditoria, isolamento de ambientes, chaves protegidas e comprovativos verificáveis.',
  alternates: { canonical: 'https://banzami.com/seguranca' },
  openGraph: {
    title: 'Segurança — Banzami',
    description:
      'Como o Banzami protege o dinheiro e os dados: ledger de dupla entrada, idempotência, isolamento Sandbox/Financial Live e comprovativos verificáveis.',
    url: 'https://banzami.com/seguranca',
  },
};

const PILLARS: { title: string; desc: string; tag: string; icon: ReactNode }[] = [
  {
    tag: 'atomicidade',
    title: 'Atomicidade e idempotência',
    desc: 'Um pagamento acontece por inteiro ou não acontece. Repetir o mesmo pedido devolve o mesmo resultado, sem cobrar duas vezes.',
    icon: <path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    tag: 'auditoria',
    title: 'Auditoria append-only',
    desc: 'Cada operação deixa rasto. Os registos são acrescentados, nunca reescritos, para que a história de um pagamento seja reconstruível.',
    icon: <><rect x="5" y="3" width="14" height="18" rx="2.5" stroke="#B5101F" strokeWidth="1.8" /><path d="M9 8h6M9 12h6M9 16h4" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  {
    tag: 'sessões',
    title: 'Autenticação e sessões',
    desc: 'O acesso é protegido por PIN na app e por sessões do lado do servidor na Web — o token nunca fica exposto ao código do browser.',
    icon: <><rect x="5" y="11" width="14" height="9" rx="2.5" stroke="#B5101F" strokeWidth="1.8" /><path d="M8 11V8a4 4 0 018 0v3" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" /></>,
  },
  {
    tag: 'chaves',
    title: 'Chaves de developer isoladas',
    desc: 'As chaves secretas vivem no servidor. As chaves publicáveis são só de leitura. Nenhuma chave secreta chega ao browser ou à app.',
    icon: <><circle cx="8" cy="12" r="4" stroke="#B5101F" strokeWidth="1.8" /><path d="M11.5 12H21l-2 2 2 2M15 12v3" stroke="#B5101F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  },
];

export default function SegurancaPage() {
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      {/* HERO */}
      <section className="bg-[linear-gradient(180deg,#FFF3F1,#fff)] px-6 pb-12 pt-[124px]">
        <div className="mx-auto max-w-[860px] text-center">
          <p className="m-0 mb-3 text-[14px] font-black tracking-[0.04em] text-cherry">SEGURANÇA</p>
          <h1 className="m-0 text-[clamp(34px,5.4vw,56px)] font-black leading-[1.03] tracking-[-0.03em] text-ink">
            Confiança por construção.
          </h1>
          <p className="mx-auto m-0 mt-5 max-w-[640px] text-[clamp(16px,1.6vw,19px)] font-semibold leading-[1.6] text-ink-secondary">
            O saldo nasce do ledger, não de ajustes silenciosos. Cada operação deixa rasto, cada
            repetição devolve o mesmo resultado, e cada ambiente é isolado para proteger o sistema.
          </p>
        </div>
      </section>

      {/* LEDGER — the trust engine */}
      <section className="px-6 pt-6">
        <Reveal className="mx-auto grid max-w-container grid-cols-1 items-center gap-[34px] rounded-[28px] border border-border-soft bg-[linear-gradient(135deg,#fff,#FFF1F0)] p-[clamp(26px,3.4vw,44px)] shadow-[0_30px_70px_-42px_rgba(181,16,31,.4)] md:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="bz-mono m-0 mb-[10px] text-[12px] font-semibold text-cherry">O MOTOR DE CONFIANÇA</p>
            <h2 className="m-0 text-[clamp(24px,3vw,34px)] font-black tracking-[-0.02em] text-ink">Ledger de dupla entrada</h2>
            <p className="m-0 mb-[18px] mt-[14px] text-[15.5px] font-semibold leading-[1.55] text-ink-secondary">
              Cada lançamento tem origem e destino que se equilibram. O saldo é derivado do ledger,
              nunca editado à mão. É esta a base sobre a qual tudo o resto assenta.
            </p>
            <div className="flex flex-wrap gap-2">
              {['imutável', 'idempotente', 'derivado do ledger', 'reconciliável'].map((t) => (
                <span key={t} className="bz-mono rounded-pill bg-cream-100 px-[11px] py-[5px] text-[11px] font-semibold tracking-[0.03em] text-cherry">{t}</span>
              ))}
            </div>
          </div>
          <div className="flex min-h-[220px] items-center justify-center">
            <div className="flex h-[112px] w-[112px] flex-col items-center justify-center rounded-[28px] text-white" style={{ background: 'linear-gradient(150deg,#B5101F,#6E0E14)', boxShadow: '0 22px 44px -16px rgba(122,16,22,.6)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v18M5 6.5l7-2.5 7 2.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 6.5l-2 5a3 3 0 006 0l-2-5M19 6.5l-2 5a3 3 0 006 0l-2-5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="mt-[5px] text-[12px] font-extrabold">Ledger</span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* PILLARS */}
      <section className="px-6 py-[clamp(48px,7vw,80px)]">
        <div className="mx-auto max-w-container">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <Reveal key={p.title} className="rounded-[22px] border border-border-soft bg-white p-7 shadow-[0_16px_40px_-30px_rgba(181,16,31,.3)]">
                <div className="mb-[14px] flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-cream-100">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">{p.icon}</svg>
                  </span>
                  <span className="bz-mono rounded-pill bg-cream-100 px-[11px] py-[5px] text-[11px] font-semibold tracking-[0.03em] text-cherry">{p.tag}</span>
                </div>
                <h2 className="m-0 mb-[7px] text-[18px] font-black text-ink">{p.title}</h2>
                <p className="m-0 text-[14.5px] font-semibold leading-[1.5] text-ink-soft">{p.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ISOLATION Sandbox / Financial Live */}
      <section className="bg-[linear-gradient(180deg,#fff,#FFF7F6)] px-6 py-[clamp(48px,7vw,80px)]">
        <div className="mx-auto max-w-container">
          <Reveal className="mb-8 max-w-[680px]">
            <p className="m-0 mb-3 text-[14px] font-black text-cherry">AMBIENTES ISOLADOS</p>
            <h2 className="m-0 text-[clamp(26px,3.6vw,40px)] font-black leading-[1.08] tracking-[-0.02em] text-ink">Sandbox e Financial Live, separados.</h2>
          </Reveal>
          <div data-testid="seguranca-environment-status" className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Reveal className="rounded-[24px] border border-border-soft bg-white p-7">
              <p className="m-0 flex items-center gap-2 text-[12px] font-extrabold tracking-[0.08em] text-ink-muted">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[#1f9d57]" />
                {PUBLIC_TRUTH.sandbox.name.toUpperCase()} · {PUBLIC_TRUTH.sandbox.state.toUpperCase()}
              </p>
              <p className="m-0 mt-3 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
                Dinheiro fictício, chaves de teste com o prefixo <span className="bz-mono">{PUBLIC_TRUTH.keyPrefixes.secret}</span>. Nada entra nem sai de um banco.
              </p>
            </Reveal>
            <Reveal delay={60} className="rounded-[24px] border border-border-soft bg-cream-50 p-7">
              <p className="m-0 flex items-center gap-2 text-[12px] font-extrabold tracking-[0.08em] text-ink-muted">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-ink-muted" />
                {PUBLIC_TRUTH.live.name.toUpperCase()} · {PUBLIC_TRUTH.live.state.toUpperCase()}
              </p>
              <p className="m-0 mt-3 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
                Fechado por omissão (fail-closed). {PUBLIC_TRUTH.live.summary}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* RECEIPTS + PRIVACY */}
      <section className="px-6 py-[clamp(48px,7vw,80px)]">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-4 md:grid-cols-2">
          <Reveal className="rounded-[24px] border border-border-soft bg-white p-7">
            <h2 className="m-0 mb-2 text-[20px] font-black text-ink">Comprovativos verificáveis</h2>
            <p className="m-0 text-[14.5px] font-semibold leading-[1.55] text-ink-soft">
              Cada operação tem um comprovativo com uma referência que qualquer pessoa pode confirmar —
              sem conta e sem expor dados privados.
            </p>
            <a href="/verificar" className="mt-4 inline-flex text-[14px] font-extrabold text-cherry no-underline">Verificar um comprovativo →</a>
          </Reveal>
          <Reveal delay={60} className="rounded-[24px] border border-border-soft bg-white p-7">
            <h2 className="m-0 mb-2 text-[20px] font-black text-ink">Privacidade</h2>
            <p className="m-0 text-[14.5px] font-semibold leading-[1.55] text-ink-soft">
              Recolhemos o mínimo necessário para operar os pagamentos. Os comprovativos públicos mostram
              apenas o @banza, nunca dados pessoais.
            </p>
            <a href="/privacidade" className="mt-4 inline-flex text-[14px] font-extrabold text-cherry no-underline">Política de privacidade →</a>
          </Reveal>
        </div>
      </section>

      {/* RESPONSIBLE DISCLOSURE */}
      <section className="bg-cream-50 px-6 py-[clamp(48px,7vw,80px)]">
        <Reveal className="mx-auto flex max-w-container flex-wrap items-center justify-between gap-6 rounded-[28px] bg-white p-[clamp(26px,3.4vw,40px)] shadow-[0_20px_50px_-40px_rgba(181,16,31,.35)]">
          <div className="max-w-[560px]">
            <h2 className="m-0 mb-2 text-[clamp(22px,3vw,30px)] font-black tracking-[-0.02em] text-ink">Encontrou um problema de segurança?</h2>
            <p className="m-0 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
              Descreva o problema e como reproduzi-lo. Não inclua chaves, palavras-passe nem dados de
              outras pessoas. Respondemos e trabalhamos consigo até estar resolvido.
            </p>
          </div>
          <MailLink to="security@banzami.com" className="rounded-pill bg-cherry px-7 py-[14px] text-[15px] font-extrabold text-white no-underline" />
        </Reveal>
      </section>

      <Footer />
    </main>
  );
}
