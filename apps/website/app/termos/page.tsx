import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Footer } from '@/components/site/Footer';
import { TERMS, isTermsPublished } from '@/lib/terms';
import { mailto } from '@/lib/site';

// PUBLIC-WEBSITE-LEGAL-RELEASE-001 — canonical Terms route.
//
// The body is human-approved legal content, published only when TERMS.status is
// 'PUBLISHED'. Until then this renders a controlled placeholder that fabricates
// no clauses and is kept out of the search index (noindex). When approved text
// is supplied, render it in the published branch below and flip robots to index.

export const metadata: Metadata = {
  title: 'Termos de Serviço',
  description: 'Termos de Serviço do Banzami.',
  alternates: { canonical: 'https://banzami.com/termos' },
  // Draft placeholder must never be indexed. Flip to index on publication.
  robots: isTermsPublished() ? undefined : { index: false, follow: false },
};

export default function TermosPage() {
  const published = isTermsPublished();
  return (
    <main className="overflow-x-hidden bg-white">
      <SiteHeader />
      <section className="px-6 pb-16 pt-[92px]">
        <div className="mx-auto max-w-[760px]">
          <p className="m-0 mb-3 text-[13px] font-black tracking-[0.06em] text-cherry">LEGAL</p>
          <h1 className="m-0 text-[clamp(28px,4vw,40px)] font-black leading-tight tracking-[-0.02em] text-ink">
            Termos de Serviço
          </h1>

          {published ? (
            // Approved document goes here (rendered from the approved source).
            // Intentionally empty until human-approved content is installed.
            <div className="mt-6" data-terms-body />
          ) : (
            <div className="mt-6 rounded-[20px] border border-border-soft bg-cream-50 p-7">
              <p className="m-0 text-[16px] font-bold leading-[1.6] text-ink">
                Os Termos de Serviço do Banzami estão a ser finalizados e serão publicados nesta
                página antes do lançamento público oficial.
              </p>
              <p className="m-0 mt-4 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
                Enquanto isso, o Banzami está disponível apenas numa Sandbox pública, com dinheiro
                fictício. Nenhum pagamento move dinheiro real.
              </p>
              <p className="m-0 mt-4 text-[15px] font-semibold leading-[1.6] text-ink-secondary">
                Para questões legais, contacte{' '}
                <a href={mailto('Termos de Serviço')} className="font-extrabold text-cherry no-underline">
                  {TERMS.contactEmail}
                </a>
                .
              </p>
            </div>
          )}

          {/* Document metadata — factual scaffold, shown as pending until published. */}
          <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-3 text-[14px] sm:grid-cols-2">
            <div className="flex justify-between gap-4 border-b border-border-soft pb-2">
              <dt className="font-bold text-ink-soft">Versão</dt>
              <dd className="m-0 font-extrabold text-ink">{TERMS.version ?? 'Pendente'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border-soft pb-2">
              <dt className="font-bold text-ink-soft">Em vigor desde</dt>
              <dd className="m-0 font-extrabold text-ink">{TERMS.effectiveDate ?? 'Pendente'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border-soft pb-2 sm:col-span-2">
              <dt className="font-bold text-ink-soft">Entidade responsável</dt>
              <dd className="m-0 font-extrabold text-ink">{TERMS.legalEntity}</dd>
            </div>
          </dl>

          <p className="mt-8 text-[13.5px] font-semibold text-ink-muted">
            Ver também a{' '}
            <a href="/privacidade" className="font-extrabold text-cherry no-underline">Política de Privacidade</a>.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
