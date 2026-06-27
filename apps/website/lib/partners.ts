// Official current Banzami partners (companies with a Memorandum of Understanding
// to use the platform and receive payments from their own clients). Single source
// of truth for the homepage partner marquee and the metrics counter — add a partner
// here and both update automatically.
//
// Note: DOA is an ecosystem product/platform, NOT a memorandum partner — it is
// intentionally excluded from this list and from partnerCount.

export type Partner = {
  name: string;
  shortName?: string;
  handle: string;
  kind: 'memorandum';
};

export const partners: Partner[] = [
  {
    name: 'NCSJ Solutions – Consultoria & Formação',
    shortName: 'NCSJ Solutions',
    handle: '@ncsj-solutions',
    kind: 'memorandum',
  },
  {
    name: 'BEC ONE, Lda.',
    shortName: 'BEC ONE',
    handle: '@bec-one',
    kind: 'memorandum',
  },
  {
    name: 'AGRO ONE, Lda.',
    shortName: 'AGRO ONE',
    handle: '@agro-one',
    kind: 'memorandum',
  },
];

export const partnerCount = partners.length;
