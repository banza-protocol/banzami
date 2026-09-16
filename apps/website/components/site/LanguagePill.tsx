/**
 * The language toggle: one compact control with both languages, each behind its
 * own flag, the current one filled and the other a link to the same page in it.
 *
 * It used to be a single pill showing the language it opened — so a Portuguese
 * page carried the United Kingdom flag, which reads as a mismatch. Showing both,
 * with the flag always beside its own code, removes the ambiguity: 🇦🇴 PT is
 * Portuguese, 🇬🇧 EN is English, whichever page you are on.
 *
 * The flags are inline SVG, never emoji: a regional-indicator emoji renders as
 * two letters on Windows and differs on every platform. They are decorative —
 * each segment's accessible name says what it does — so they are aria-hidden.
 */
import type { CSSProperties } from 'react';

export type SiteLang = 'pt' | 'en';

function AngolaFlag() {
  return (
    <svg viewBox="0 0 30 20" width="17" height="11.5" aria-hidden="true" focusable="false" style={FLAG}>
      <rect width="30" height="10" fill="#CC092F" />
      <rect y="10" width="30" height="10" fill="#000" />
      <path d="M11.2 12.6a5 5 0 1 1 7.6 0" fill="none" stroke="#FFCB00" strokeWidth="1.3" strokeDasharray="1.1 0.7" />
      <path d="M11.9 12a4.1 4.1 0 1 1 6.2 0" fill="none" stroke="#FFCB00" strokeWidth="0.9" />
      <path d="M11.4 13.6l6.4-5.6 0.8 0.8-5.9 6.1z" fill="#FFCB00" />
      <path d="M11.4 13.6l-0.9 1.1 0.9 0.4 0.9-0.9z" fill="#FFCB00" />
      <path d="M14.5 7.9l0.45 1.2 1.25 0.05-1 0.8 0.35 1.25-1.05-0.72-1.05 0.72 0.35-1.25-1-0.8 1.25-0.05z" fill="#FFCB00" />
    </svg>
  );
}

function UnitedKingdomFlag() {
  return (
    <svg viewBox="0 0 60 40" width="17" height="11.5" aria-hidden="true" focusable="false" style={FLAG} preserveAspectRatio="xMidYMid slice">
      <clipPath id="bz-uk-flag"><path d="M0 0v40h60V0z" /></clipPath>
      <clipPath id="bz-uk-diag"><path d="M30 20h30v20zv20H0zH0V0zV0h30z" /></clipPath>
      <g clipPath="url(#bz-uk-flag)">
        <path d="M0 0v40h60V0z" fill="#012169" />
        <path d="M0 0l60 40m0-40L0 40" stroke="#fff" strokeWidth="8" />
        <path d="M0 0l60 40m0-40L0 40" clipPath="url(#bz-uk-diag)" stroke="#C8102E" strokeWidth="5" />
        <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="12" />
        <path d="M30 0v40M0 20h60" stroke="#C8102E" strokeWidth="7" />
      </g>
    </svg>
  );
}

const FLAG: CSSProperties = {
  display: 'block',
  flex: 'none',
  borderRadius: 2.5,
  boxShadow: '0 0 0 0.5px rgba(0,0,0,.10)',
};

const GROUP: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  padding: 3,
  border: '1px solid #E7E3E3',
  borderRadius: 999,
  background: '#FBF9F9',
  lineHeight: 1,
};

const SEG: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 26,
  padding: '0 10px',
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: '.02em',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const ACTIVE: CSSProperties = {
  ...SEG,
  background: '#fff',
  color: '#241D20',
  boxShadow: '0 1px 2px rgba(42,32,36,.10)',
};

const INACTIVE: CSSProperties = {
  ...SEG,
  color: '#6F6266',
};

/**
 * The current language, filled, and the other as a link to the same page in it.
 * `lang` is the page's language; `otherHref` opens the other one.
 */
export function LanguagePill({
  lang,
  otherHref,
  groupLabel,
  switchLabel,
}: {
  lang: SiteLang;
  otherHref: string;
  /** Accessible name for the whole control, e.g. "Idioma" / "Language". */
  groupLabel: string;
  /** Accessible name for the link to the other language, written in it. */
  switchLabel: string;
}) {
  const pt = (
    <>
      <AngolaFlag />
      <span>PT</span>
    </>
  );
  const en = (
    <>
      <UnitedKingdomFlag />
      <span>EN</span>
    </>
  );
  const other: SiteLang = lang === 'pt' ? 'en' : 'pt';
  return (
    <span className="bz-langtoggle" role="group" aria-label={groupLabel} style={GROUP}>
      {lang === 'pt' ? (
        <span style={ACTIVE} aria-current="true">{pt}</span>
      ) : (
        <a href={otherHref} hrefLang="pt" lang="pt" aria-label={switchLabel} className="bz-langseg" style={INACTIVE}>{pt}</a>
      )}
      {lang === 'en' ? (
        <span style={ACTIVE} aria-current="true">{en}</span>
      ) : (
        <a href={otherHref} hrefLang="en" lang="en" aria-label={switchLabel} className="bz-langseg" style={INACTIVE}>{en}</a>
      )}
    </span>
  );
}
