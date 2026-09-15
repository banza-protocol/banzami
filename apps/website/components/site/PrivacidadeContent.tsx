// Privacy notice for the beta tester programme (APP-BETA-001), shared by
// /privacidade (PT) and /privacidade/en (EN). It describes exactly what the beta
// registration collects, why, and how to be removed — no more, no less. It is a
// factual data-handling notice for the tester programme, not a claim of any
// certification.

import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { LanguagePill } from '@/components/site/LanguagePill';
import { SITE } from '@/lib/site';

type Lang = 'pt' | 'en';

const COPY = {
  pt: {
    title: 'Privacidade — programa de testers',
    updated: 'Última atualização: 15 de setembro de 2026',
    intro:
      'Esta nota explica os dados que recolhemos quando se inscreve para testar as apps do Banzami (App Banzami e App Comerciante) e como os tratamos.',
    sections: [
      {
        h: 'O que recolhemos',
        p: 'O seu primeiro e último nome, o e-mail que usa na App Store ou Google Play, e as aplicações e plataformas que pretende testar. Opcionalmente, o modelo do aparelho, a versão do sistema e o país — só se os indicar, para nos ajudar a cobrir mais aparelhos. Não pedimos palavras-passe nem credenciais da Apple ou da Google.',
      },
      {
        h: 'Para que usamos',
        p: 'Apenas para gerir a sua participação nos testes: contactá-lo, convidá-lo no TestFlight (iPhone) ou no Google Play (Android) e organizar o programa. Quando enviamos um convite, o e-mail que indicou é comunicado à Apple ou à Google, porque é assim que o TestFlight e o Google Play entregam o convite.',
      },
      {
        h: 'O que não fazemos',
        p: 'Não usamos os seus dados para marketing sem o seu consentimento separado, não os vendemos e não os partilhamos para além do necessário para gerir os testes. A inscrição não ativa qualquer subscrição de marketing.',
      },
      {
        h: 'Onde ficam e quem acede',
        p: 'Os dados ficam nos sistemas do Banzami. Apenas operadores autorizados os consultam, para gerir o programa. Não há listagem pública de testers.',
      },
      {
        h: 'Quanto tempo guardamos',
        p: 'Guardamos o seu registo enquanto for relevante para o programa de testes ou até pedir a remoção.',
      },
      {
        h: 'Os seus direitos',
        p: 'Pode pedir acesso aos seus dados ou a sua remoção a qualquer momento, escrevendo para',
      },
    ],
    sandbox: 'As apps em teste correm em Sandbox: o dinheiro é fictício e nenhum pagamento é real.',
    langGroup: 'Idioma',
    langSwitch: 'Switch to English',
  },
  en: {
    title: 'Privacy — tester programme',
    updated: 'Last updated: 15 September 2026',
    intro:
      'This note explains the data we collect when you register to test the Banzami apps (App Banzami and App Comerciante) and how we handle it.',
    sections: [
      {
        h: 'What we collect',
        p: 'Your first and last name, the email you use on the App Store or Google Play, and the apps and platforms you want to test. Optionally, your device model, OS version and country — only if you provide them, to help us cover more devices. We never ask for passwords or Apple/Google credentials.',
      },
      {
        h: 'What we use it for',
        p: 'Only to manage your participation in the tests: to contact you, invite you on TestFlight (iPhone) or Google Play (Android), and run the programme. When we send an invite, the email you gave is shared with Apple or Google, because that is how TestFlight and Google Play deliver the invite.',
      },
      {
        h: 'What we do not do',
        p: 'We do not use your data for marketing without your separate consent, we do not sell it, and we do not share it beyond what is needed to run the tests. Registering does not turn on any marketing subscription.',
      },
      {
        h: 'Where it lives and who can see it',
        p: 'The data lives on Banzami systems. Only authorized operators access it, to run the programme. There is no public listing of testers.',
      },
      {
        h: 'How long we keep it',
        p: 'We keep your registration while it is relevant to the tester programme or until you ask to be removed.',
      },
      {
        h: 'Your rights',
        p: 'You can ask to access your data or to be removed at any time by writing to',
      },
    ],
    sandbox: 'The apps under test run in Sandbox: money is fictitious and no payment is real.',
    langGroup: 'Language',
    langSwitch: 'Mudar para português',
  },
} as const;

export function PrivacidadeContent({ lang }: { lang: Lang }) {
  const t = COPY[lang];
  const otherHref = lang === 'pt' ? '/privacidade/en' : '/privacidade';

  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />
      <section className="px-6 pb-16 pt-[92px]">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-5 flex justify-end">
            <LanguagePill lang={lang} otherHref={otherHref} groupLabel={t.langGroup} switchLabel={t.langSwitch} />
          </div>
          <h1 className="m-0 text-[clamp(28px,4vw,40px)] font-black leading-tight tracking-[-0.02em] text-ink">
            {t.title}
          </h1>
          <p className="m-0 mt-2 text-[13px] font-semibold text-ink-muted">{t.updated}</p>
          <p className="m-0 mt-5 text-[16px] font-semibold leading-[1.6] text-ink-secondary">{t.intro}</p>

          <div className="mt-8 space-y-6">
            {t.sections.map((s) => (
              <div key={s.h}>
                <h2 className="m-0 text-[17px] font-black text-ink">{s.h}</h2>
                <p className="m-0 mt-1.5 text-[15px] font-medium leading-[1.6] text-ink-soft">
                  {s.p}
                  {s.h === COPY[lang].sections[5].h && (
                    <>
                      {' '}
                      <a href={`mailto:${SITE.email}`} className="font-semibold text-cherry underline underline-offset-2">
                        {SITE.email}
                      </a>
                      .
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-8 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-[13.5px] font-semibold leading-[1.5] text-amber-900">
            {t.sandbox}
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
