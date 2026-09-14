/**
 * The language switch: a pill with the flag and the code of the language the
 * link opens — Angola for PT, the United Kingdom for EN.
 *
 * The flags are inline SVG, never emoji: a regional-indicator emoji renders as
 * two letters on Windows and differs on every platform, and an image request
 * would be one more thing to load for a 22-pixel mark. They are decorative —
 * the link's accessible name says what it does — so they are hidden from
 * assistive technology.
 */
import type { CSSProperties } from 'react';

export type SiteLang = 'pt' | 'en';

function AngolaFlag() {
  return (
    <svg viewBox="0 0 30 20" width="22" height="15" aria-hidden="true" focusable="false" style={FLAG}>
      <rect width="30" height="10" fill="#CC092F" />
      <rect y="10" width="30" height="10" fill="#000" />
      {/* Half cog-wheel */}
      <path
        d="M11.2 12.6a5 5 0 1 1 7.6 0"
        fill="none"
        stroke="#FFCB00"
        strokeWidth="1.3"
        strokeDasharray="1.1 0.7"
      />
      <path d="M11.9 12a4.1 4.1 0 1 1 6.2 0" fill="none" stroke="#FFCB00" strokeWidth="0.9" />
      {/* Machete */}
      <path d="M11.4 13.6l6.4-5.6 0.8 0.8-5.9 6.1z" fill="#FFCB00" />
      <path d="M11.4 13.6l-0.9 1.1 0.9 0.4 0.9-0.9z" fill="#FFCB00" />
      {/* Star */}
      <path
        d="M14.5 7.9l0.45 1.2 1.25 0.05-1 0.8 0.35 1.25-1.05-0.72-1.05 0.72 0.35-1.25-1-0.8 1.25-0.05z"
        fill="#FFCB00"
      />
    </svg>
  );
}

function UnitedKingdomFlag() {
  return (
    <svg viewBox="0 0 60 40" width="22" height="15" aria-hidden="true" focusable="false" style={FLAG} preserveAspectRatio="xMidYMid slice">
      <clipPath id="bz-uk-flag">
        <path d="M0 0v40h60V0z" />
      </clipPath>
      <clipPath id="bz-uk-diag">
        <path d="M30 20h30v20zv20H0zH0V0zV0h30z" />
      </clipPath>
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
  borderRadius: 3,
  boxShadow: '0 0 0 1px rgba(0,0,0,.08)',
};

const PILL: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 9,
  minHeight: 36,
  padding: '6px 14px 6px 11px',
  border: '1.5px solid #E4E1E1',
  borderRadius: 999,
  background: '#fff',
  color: '#4B4F54',
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: '.02em',
  lineHeight: 1,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

/**
 * A link to the same page in the other language, shown as the language it opens.
 * `target` is that language; `label` is the accessible name, written in it.
 */
export function LanguagePill({ href, target, label }: { href: string; target: SiteLang; label: string }) {
  return (
    <a href={href} hrefLang={target} lang={target} aria-label={label} className="bz-langpill" style={PILL}>
      {target === 'pt' ? <AngolaFlag /> : <UnitedKingdomFlag />}
      <span>{target.toUpperCase()}</span>
    </a>
  );
}
