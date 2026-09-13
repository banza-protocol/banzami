// An email link Cloudflare leaves alone.
//
// The zone's Email Address Obfuscation rewrites every address in the HTML into
// "[email protected]" and a decoder script at /cdn-cgi/. The site's CSP blocks
// that script, so a reader saw neither the address nor a working link — on the
// support page, of all places. Cloudflare's documented per-address opt-out is
// the <!--email_off--> comment pair, and React can only emit a comment as raw
// HTML, hence the one dangerouslySetInnerHTML here. Every value is escaped; the
// addresses are constants in the source, never user input.

import type { CSSProperties } from 'react';

const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const css = (style: CSSProperties) =>
  Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${typeof v === 'number' && !/^(fontWeight|lineHeight|opacity|zIndex|flex)/.test(k) ? `${v}px` : v}`)
    .join(';');

export function MailLink({ to, subject, label, style, className }: { to: string; subject?: string; label?: string; style?: CSSProperties; className?: string }) {
  const href = `mailto:${to}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
  const attrs = [`href="${escape(href)}"`, className ? `class="${escape(className)}"` : '', style ? `style="${escape(css(style))}"` : ''].filter(Boolean).join(' ');
  return <span dangerouslySetInnerHTML={{ __html: `<!--email_off--><a ${attrs}>${escape(label ?? to)}</a><!--/email_off-->` }} />;
}
