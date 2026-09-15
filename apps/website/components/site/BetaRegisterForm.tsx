'use client';

// The beta registration form (APP-BETA-001). One component, used both inline on
// /testes and inside the homepage modal, so the fields, the validation, the
// success state and the privacy consent are written once and never drift.
//
// It collects contact detail only — name, the store email, the app(s) and
// platform(s) a person wants to test, and optional QA fields. Never a password,
// never an Apple or Google credential: the store email is the address the tester
// already uses on the App Store / Google Play, not a login to us. On success it
// shows an in-place confirmation and never promises an immediate invite; a
// friendly, non-enumerating message covers every failure.

import { useId, useRef, useState } from 'react';
import {
  submitBetaRegistration,
  type BetaApp,
  type BetaPlatform,
  BETA_APPS,
} from '@/lib/beta';

type Lang = 'pt' | 'en';

const COPY = {
  pt: {
    firstName: 'Primeiro nome',
    lastName: 'Último nome',
    email: 'E-mail utilizado na App Store ou Google Play',
    emailHelp:
      'Usamos este e-mail para o convidar no TestFlight (iPhone) ou no Google Play (Android). Tem de ser o mesmo e-mail da sua conta da App Store ou Google Play — é para esse endereço que o convite chega.',
    platform: 'Plataforma',
    platformIOS: 'iPhone (TestFlight)',
    platformAndroid: 'Android (Google Play)',
    platformBoth: 'Ambas',
    apps: 'Aplicação que pretende testar',
    appBoth: 'Ambas as aplicações',
    optional: 'Opcional — ajuda-nos a cobrir mais aparelhos',
    device: 'Modelo do aparelho',
    devicePlaceholder: 'ex.: iPhone 13, Samsung Galaxy A54',
    os: 'Versão do sistema',
    osPlaceholder: 'ex.: iOS 17.4, Android 14',
    country: 'País',
    countryPlaceholder: 'ex.: Angola',
    consent:
      'Autorizo o Banzami a usar o meu nome e e-mail para me convidar e gerir a minha participação nos testes. Posso pedir a remoção a qualquer momento.',
    privacyPrefix: 'Saiba como tratamos os seus dados na',
    privacyLink: 'política de privacidade',
    submit: 'Participar nos testes',
    submitting: 'A enviar…',
    successTitle: 'Inscrição recebida',
    successBody:
      'Obrigado! Registámos o seu interesse em testar. As vagas são limitadas e os convites são enviados por etapas — se for selecionado, receberá o convite no e-mail que indicou. Não é um convite imediato.',
    errRequired: 'Preencha o nome, o apelido e o e-mail.',
    errEmail: 'Indique um e-mail válido.',
    errPlatform: 'Escolha uma plataforma.',
    errApps: 'Escolha pelo menos uma aplicação.',
    errConsent: 'É necessário autorizar o uso dos dados para participar.',
    errDefault: 'Não foi possível enviar agora. Tente novamente daqui a pouco.',
    sandboxNote:
      'As apps estão em Sandbox: o dinheiro é fictício e nenhum pagamento é real.',
  },
  en: {
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email used on the App Store or Google Play',
    emailHelp:
      'We use this email to invite you on TestFlight (iPhone) or Google Play (Android). It must be the same email as your App Store or Google Play account — that is where the invite is sent.',
    platform: 'Platform',
    platformIOS: 'iPhone (TestFlight)',
    platformAndroid: 'Android (Google Play)',
    platformBoth: 'Both',
    apps: 'App you want to test',
    appBoth: 'Both apps',
    optional: 'Optional — helps us cover more devices',
    device: 'Device model',
    devicePlaceholder: 'e.g. iPhone 13, Samsung Galaxy A54',
    os: 'OS version',
    osPlaceholder: 'e.g. iOS 17.4, Android 14',
    country: 'Country',
    countryPlaceholder: 'e.g. Angola',
    consent:
      'I allow Banzami to use my name and email to invite me and manage my participation in the tests. I can ask to be removed at any time.',
    privacyPrefix: 'See how we handle your data in the',
    privacyLink: 'privacy policy',
    submit: 'Join the testing',
    submitting: 'Sending…',
    successTitle: 'Registration received',
    successBody:
      'Thank you! We have recorded your interest in testing. Places are limited and invites go out in stages — if selected, you will receive the invite at the email you gave. This is not an immediate invite.',
    errRequired: 'Please fill in your first name, last name and email.',
    errEmail: 'Enter a valid email.',
    errPlatform: 'Choose a platform.',
    errApps: 'Choose at least one app.',
    errConsent: 'You must allow the use of your data to take part.',
    errDefault: 'Could not send right now. Please try again shortly.',
    sandboxNote: 'The apps run in Sandbox: money is fictitious and no payment is real.',
  },
} as const;

function looksLikeEmail(e: string): boolean {
  const t = e.trim();
  if (t.length < 5 || t.length > 254 || /\s/.test(t)) return false;
  const at = t.indexOf('@');
  return at > 0 && at === t.lastIndexOf('@') && at < t.length - 1 && t.slice(at + 1).includes('.');
}

export function BetaRegisterForm({
  lang,
  source,
  // The app(s) offered. When a single app is fixed (the homepage modal), pass one
  // id and lockApp so the chooser is replaced by a plain line.
  offeredApps,
  lockApp = false,
  initialApps,
  initialPlatform,
  // When the platform is decided by the button that opened the modal, lock it: it
  // is shown, not re-chosen.
  lockPlatform = false,
  privacyHref,
  submitLabel,
  autoFocus = false,
  onSuccess,
}: {
  lang: Lang;
  source: string;
  offeredApps?: BetaApp[];
  lockApp?: boolean;
  initialApps?: BetaApp[];
  initialPlatform?: BetaPlatform;
  lockPlatform?: boolean;
  privacyHref: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onSuccess?: () => void;
}) {
  const t = COPY[lang];
  const apps = (offeredApps ?? ['APP_BANZAMI', 'APP_MERCHANT']) as BetaApp[];
  const uid = useId();
  const firstRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [platform, setPlatform] = useState<BetaPlatform | ''>(initialPlatform ?? '');
  const [selApps, setSelApps] = useState<BetaApp[]>(initialApps ?? (lockApp ? apps : []));
  const [device, setDevice] = useState('');
  const [os, setOs] = useState('');
  const [country, setCountry] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function toggleApp(a: BetaApp) {
    setSelApps((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return setErr(t.errRequired);
    if (!looksLikeEmail(email)) return setErr(t.errEmail);
    if (!platform) return setErr(t.errPlatform);
    const chosen = lockApp ? apps : selApps;
    if (chosen.length === 0) return setErr(t.errApps);
    if (!consent) return setErr(t.errConsent);

    setBusy(true);
    const res = await submitBetaRegistration({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      platform,
      apps: chosen,
      device_model: device.trim() || undefined,
      os_version: os.trim() || undefined,
      country: country.trim() || undefined,
      source,
      website,
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      onSuccess?.();
    } else {
      setErr(res.message === 'default' ? t.errDefault : res.message);
    }
  }

  if (done) {
    return (
      <div role="status" aria-live="polite" className="rounded-2xl border border-green-200 bg-green-50 p-6">
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="#16a34a" />
            <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className="text-lg font-black text-green-900">{t.successTitle}</h3>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-green-900/90">{t.successBody}</p>
      </div>
    );
  }

  const field =
    'w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 outline-none transition focus:border-cherry focus:ring-2 focus:ring-cherry/20';
  const label = 'mb-1 block text-[13px] font-bold text-neutral-700';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Honeypot: off-screen, not a tab stop, never seen by a human. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor={`${uid}-website`}>Website</label>
        <input
          id={`${uid}-website`}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-first`} className={label}>{t.firstName}</label>
          <input
            id={`${uid}-first`}
            ref={firstRef}
            type="text"
            autoComplete="given-name"
            autoFocus={autoFocus}
            className={field}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${uid}-last`} className={label}>{t.lastName}</label>
          <input
            id={`${uid}-last`}
            type="text"
            autoComplete="family-name"
            className={field}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${uid}-email`} className={label}>{t.email}</label>
        <input
          id={`${uid}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          className={field}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={`${uid}-email-help`}
          required
        />
        <p id={`${uid}-email-help`} className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">
          {t.emailHelp}
        </p>
      </div>

      {/* App choice — a plain line when locked (homepage modal), a chooser on /testes. */}
      {lockApp ? (
        <p className="text-[14px] text-neutral-700">
          <span className="font-bold">{t.apps}:</span>{' '}
          {apps.map((id) => BETA_APPS.find((a) => a.id === id)?.name).filter(Boolean).join(' + ')}
        </p>
      ) : (
        <fieldset>
          <legend className={label}>{t.apps}</legend>
          <div className="flex flex-wrap gap-2">
            {apps.map((id) => {
              const a = BETA_APPS.find((x) => x.id === id)!;
              const on = selApps.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleApp(id)}
                  className={`rounded-full border px-4 py-2 text-[14px] font-semibold transition ${
                    on
                      ? 'border-cherry bg-cherry text-white'
                      : 'border-neutral-300 bg-white text-neutral-700 hover:border-cherry/50'
                  }`}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Platform — shown (not re-chosen) when the opening button decided it. */}
      <fieldset>
        <legend className={label}>{t.platform}</legend>
        {lockPlatform && platform ? (
          <p className="text-[14px] text-neutral-700">
            {platform === 'IOS' ? t.platformIOS : platform === 'ANDROID' ? t.platformAndroid : t.platformBoth}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.platform}>
            {([
              ['IOS', t.platformIOS],
              ['ANDROID', t.platformAndroid],
              ['BOTH', t.platformBoth],
            ] as [BetaPlatform, string][]).map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={platform === val}
                onClick={() => setPlatform(val)}
                className={`rounded-full border px-4 py-2 text-[14px] font-semibold transition ${
                  platform === val
                    ? 'border-cherry bg-cherry text-white'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:border-cherry/50'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <details className="rounded-xl border border-neutral-200 bg-neutral-50/60 px-3.5 py-2.5">
        <summary className="cursor-pointer text-[13px] font-bold text-neutral-600">{t.optional}</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-device`} className={label}>{t.device}</label>
            <input id={`${uid}-device`} type="text" className={field} placeholder={t.devicePlaceholder} value={device} onChange={(e) => setDevice(e.target.value)} maxLength={120} />
          </div>
          <div>
            <label htmlFor={`${uid}-os`} className={label}>{t.os}</label>
            <input id={`${uid}-os`} type="text" className={field} placeholder={t.osPlaceholder} value={os} onChange={(e) => setOs(e.target.value)} maxLength={60} />
          </div>
          <div>
            <label htmlFor={`${uid}-country`} className={label}>{t.country}</label>
            <input id={`${uid}-country`} type="text" className={field} placeholder={t.countryPlaceholder} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} />
          </div>
        </div>
      </details>

      <label className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-neutral-700">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 flex-none accent-cherry"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          {t.consent}{' '}
          <span className="block text-[12.5px] text-neutral-500">
            {t.privacyPrefix}{' '}
            <a href={privacyHref} className="font-semibold text-cherry underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              {t.privacyLink}
            </a>.
          </span>
        </span>
      </label>

      {err && (
        <p role="alert" aria-live="assertive" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] font-medium text-red-800">
          {err}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-cherry px-5 py-3 text-[15px] font-black text-white transition hover:bg-cherry-dark disabled:opacity-60"
      >
        {busy ? t.submitting : submitLabel ?? t.submit}
      </button>
    </form>
  );
}
