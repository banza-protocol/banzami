// Banzami homepage partners/ecosystem list — single source of truth for the
// hero marquee and the metrics counter.
//
// `memorandum` = companies with a Memorandum of Understanding to use the platform
// and receive payments from their own clients. `ecosystem` = ecosystem
// products/platforms (e.g. DOA). Both kinds appear in the marquee and both count
// toward partnerCount (= partners.length); `kind` is metadata only.

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
    website: 'https://www.ncsj-solutions.com',
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

// Partner counter — counts every entry (memorandum and ecosystem alike, incl.
// DOA). `kind` is kept as metadata but no longer narrows the count.
export const partnerCount = partners.length;
