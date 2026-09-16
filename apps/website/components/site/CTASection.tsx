import Link from 'next/link';
import { SITE } from '@/lib/site';
import type { ClosingAction } from '@/lib/closing-ctas';
import { Reveal } from '../Reveal';

// The one canonical closing CTA (PUBLIC-WEBSITE-CLOSING-CTA-001). One red card,
// one geometry, used at the bottom of every marketing page. Its content is
// owned by the page and passed in (see lib/closing-ctas.ts) so the closing
// speaks to that page's audience — never a generic developer pitch everywhere.

function ActionLink({ action, primary }: { action: ClosingAction; primary: boolean }) {
  const cls = primary
    ? 'inline-flex items-center gap-2 rounded-[40px] bg-white px-[30px] py-4 text-[16px] font-extrabold text-cherry no-underline transition-transform hover:-translate-y-0.5'
    : 'inline-flex items-center gap-2 rounded-[40px] border border-white/30 bg-white/[0.14] px-7 py-4 text-[16px] font-extrabold text-white no-underline transition-colors hover:bg-white/20';
  const internal = action.href.startsWith('/') && !action.href.startsWith('//');
  return internal ? (
    <Link href={action.href} className={cls}>{action.label}</Link>
  ) : (
    <a href={action.href} className={cls} {...(action.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{action.label}</a>
  );
}

export function CTASection({
  id,
  eyebrow,
  title,
  description,
  primary,
  secondary,
  showContact = false,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description: string;
  primary: ClosingAction;
  secondary?: ClosingAction;
  showContact?: boolean;
}) {
  return (
    <section id={id} className="px-6 py-[clamp(56px,8vw,100px)]">
      <Reveal className="relative mx-auto max-w-[1080px] overflow-hidden rounded-[36px] bg-[linear-gradient(150deg,#B5101F,#9A1B22)] p-[clamp(40px,6vw,76px)] text-center">
        <div className="pointer-events-none absolute -left-[60px] -top-[100px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(232,67,75,.6),rgba(232,67,75,0)_64%)]" />
        <div className="pointer-events-none absolute -bottom-[120px] -right-[50px] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(251,210,208,.32),rgba(251,210,208,0)_64%)]" />
        <div className="relative">
          {eyebrow ? (
            <p className="m-0 mb-3 text-[13px] font-black tracking-[0.08em] text-pink-200">{eyebrow}</p>
          ) : null}
          <h2 className="m-0 text-[clamp(30px,5vw,52px)] font-black leading-[1.04] tracking-[-0.025em] text-white">
            {title}
          </h2>
          <p className="mx-auto mt-[18px] max-w-[540px] text-[17px] font-semibold leading-[1.55] text-pink-200">
            {description}
          </p>
          <div className="mt-[30px] flex flex-wrap justify-center gap-3">
            <ActionLink action={primary} primary />
            {secondary ? <ActionLink action={secondary} primary={false} /> : null}
          </div>
          {showContact ? <p className="bz-mono mt-[26px] text-[13px] text-pink-200">{SITE.email}</p> : null}
        </div>
      </Reveal>
    </section>
  );
}
