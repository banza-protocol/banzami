// The public beta tester programme (APP-BETA-001), shared by /testes (PT) and
// /testes/en (EN). A real product beta page, not a generic form: it says what
// the apps are, that they run in Sandbox with fictitious money, and that
// invites go to invited testers in stages — then lets a person register their
// interest. The registration form is the same one the homepage modal uses.
//
// No account, no password, no Apple/Google credential. On success the form shows
// an in-page confirmation; it never promises an immediate invite.

import Link from 'next/link';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { Reveal } from '@/components/Reveal';
import { LanguagePill } from '@/components/site/LanguagePill';
import { BetaRegisterForm } from '@/components/site/BetaRegisterForm';
import { BETA_APPS, type BetaApp } from '@/lib/beta';

type Lang = 'pt' | 'en';

const COPY = {
  pt: {
    kicker: 'Programa de testers',
    title: 'Ajude-nos a testar o Banzami',
    lead: 'As apps do Banzami já funcionam e estão a ser distribuídas a testers convidados. Registe o seu interesse e, à medida que abrimos vagas, enviamos o convite para instalar no iPhone (TestFlight) ou no Android (Google Play).',
    webNote: 'Prefere experimentar já? A App Banzami Web está disponível no browser, em app.banzami.com, sem convite.',
    sandbox:
      'As apps correm em Sandbox: o dinheiro é fictício e nenhum pagamento é real. É um ambiente de testes, feito para experimentar sem risco.',
    appsTitle: 'As apps que pode testar',
    ios: 'iPhone — TestFlight',
    android: 'Android — Google Play',
    formTitle: 'Registe o seu interesse',
    formLead: 'Preencha os seus dados e escolha o que pretende testar. Não promete um convite imediato — as vagas são limitadas.',
    langGroup: 'Idioma',
    langSwitch: 'Switch to English',
    metaTitle: 'Testers',
  },
  en: {
    kicker: 'Tester programme',
    title: 'Help us test Banzami',
    lead: 'The Banzami apps already work and are being given to invited testers. Register your interest and, as we open places, we send the invite to install on iPhone (TestFlight) or Android (Google Play).',
    webNote: 'Want to try it now? The App Banzami Web is available in the browser, at app.banzami.com, with no invite needed.',
    sandbox:
      'The apps run in Sandbox: money is fictitious and no payment is real. It is a testing environment, made to try things with no risk.',
    appsTitle: 'The apps you can test',
    ios: 'iPhone — TestFlight',
    android: 'Android — Google Play',
    formTitle: 'Register your interest',
    formLead: 'Fill in your details and choose what you want to test. It does not promise an immediate invite — places are limited.',
    langGroup: 'Language',
    langSwitch: 'Mudar para português',
    metaTitle: 'Testers',
  },
} as const;

export function TestesContent({ lang, initialApps }: { lang: Lang; initialApps?: BetaApp[] }) {
  const t = COPY[lang];
  const otherHref = lang === 'pt' ? '/testes/en' : '/testes';

  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />

      <section className="relative overflow-hidden px-6 pb-6 pt-[92px]">
        <div className="pointer-events-none absolute -right-[120px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.6),rgba(251,210,208,0)_66%)]" />
        <div className="relative mx-auto max-w-container">
          <div className="mb-5 flex justify-end">
            <LanguagePill lang={lang} otherHref={otherHref} groupLabel={t.langGroup} switchLabel={t.langSwitch} />
          </div>
          <Reveal>
            <span className="mb-5 inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13px] font-extrabold text-cherry shadow-[0_6px_18px_-8px_rgba(181,16,31,.3)]">
              {t.kicker}
            </span>
            <h1 className="m-0 max-w-[720px] text-[clamp(30px,4.6vw,48px)] font-black leading-[1.05] tracking-[-0.03em] text-ink">
              {t.title}
            </h1>
            <p className="m-0 mt-5 max-w-[620px] text-[clamp(15px,1.5vw,18px)] font-semibold leading-[1.55] text-ink-secondary">
              {t.lead}
            </p>
            <p className="m-0 mt-3 max-w-[620px] text-[14px] font-semibold leading-[1.55] text-ink-secondary">
              {t.webNote.split('app.banzami.com')[0]}
              <a href="https://app.banzami.com" className="font-extrabold text-cherry no-underline hover:text-cherry-dark">
                app.banzami.com
              </a>
              {t.webNote.split('app.banzami.com')[1]}
            </p>
            <p className="m-0 mt-3 max-w-[620px] rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-[13.5px] font-semibold leading-[1.5] text-amber-900">
              {t.sandbox}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-6">
        <div className="mx-auto grid max-w-container grid-cols-1 gap-10 lg:grid-cols-[1fr_1.05fr]">
          {/* The apps */}
          <div>
            <h2 className="m-0 mb-4 text-[20px] font-black text-ink">{t.appsTitle}</h2>
            <div className="space-y-3">
              {BETA_APPS.map((a) => (
                <div key={a.id} className="rounded-2xl border border-border-soft bg-cream-50 p-5">
                  <h3 className="m-0 text-[16px] font-black text-ink">{a.name}</h3>
                  <p className="m-0 mt-1 text-[13.5px] font-semibold leading-[1.5] text-ink-soft">
                    {lang === 'pt' ? a.tagline_pt : a.tagline_en}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.ios && (
                      <span className="rounded-pill bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-700 ring-1 ring-neutral-200">
                        {t.ios}
                      </span>
                    )}
                    {a.android && (
                      <span className="rounded-pill bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-700 ring-1 ring-neutral-200">
                        {t.android}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The form */}
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-[0_24px_60px_-40px_rgba(181,16,31,.35)] sm:p-8">
            <h2 className="m-0 text-[20px] font-black text-ink">{t.formTitle}</h2>
            <p className="m-0 mb-5 mt-1.5 text-[14px] font-semibold leading-[1.5] text-ink-soft">{t.formLead}</p>
            <BetaRegisterForm
              lang={lang}
              source="testes"
              initialApps={initialApps}
              privacyHref={lang === 'pt' ? '/privacidade' : '/en/privacidade'}
            />
          </div>
        </div>
      </section>

      <div className="px-6 pb-10 pt-2">
        <div className="mx-auto max-w-container">
          <Link href="/produto" className="text-[13.5px] font-bold text-cherry no-underline hover:text-cherry-dark">
            ← {lang === 'pt' ? 'Ver todos os produtos' : 'See all products'}
          </Link>
        </div>
      </div>

      <Footer />
    </main>
  );
}
