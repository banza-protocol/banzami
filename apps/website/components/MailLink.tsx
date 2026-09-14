// An email link.
//
// The zone's Email Address Obfuscation rewrites every address in the HTML into
// "[email protected]" and a decoder script at /cdn-cgi/ that the site's CSP
// blocks. The opt-out is one <!--email_off--> … <!--/email_off--> pair around
// the whole body, in app/layout.tsx. This component used to emit its own pair,
// and Cloudflare does not nest them: the inner closing marker ended the page's
// region early and everything after the first MailLink was obfuscated again.
// So it is a plain anchor now, and the layout's pair covers it.

import type { CSSProperties } from 'react';

export function MailLink({ to, subject, label, style, className }: { to: string; subject?: string; label?: string; style?: CSSProperties; className?: string }) {
  const href = `mailto:${to}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
  return <a href={href} className={className} style={style}>{label ?? to}</a>;
}
