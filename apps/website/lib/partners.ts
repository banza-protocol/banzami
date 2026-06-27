// Banzami homepage partners/ecosystem list — single source of truth for the
// hero marquee and the metrics counter.
//
// `memorandum` = companies with a Memorandum of Understanding to use the platform
// and receive payments from their own clients. `ecosystem` = ecosystem
// products/platforms (e.g. DOA): shown in the marquee but NOT counted as a
// commercial partner. partnerCount counts only memorandum partners.

export type Partner = {
  name: string;
  shortName?: string;
  handle: string;
  kind: 'memorandum' | 'ecosystem';
  website?: string;
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
  {
    name: 'DOA',
    handle: '@doa',
    kind: 'ecosystem',
    website: 'https://doadoa.app',
  },
];

// Commercial partner counter — ecosystem entries (e.g. DOA) are excluded.
export const partnerCount = partners.filter((p) => p.kind === 'memorandum').length;
