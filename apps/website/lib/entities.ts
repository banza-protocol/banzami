// Banzami homepage entity model — the single source of truth for the homepage
// marquee ("Comerciantes & Empresas") and the adoption metrics cards. Designed to
// be reused later by the website, admin, API and documentation.
//
// Category meaning (domain rules):
//   user     = a consumer account using the Banzami wallet.
//   merchant = a business/merchant that ACCEPTS Banzami payments.
//   company  = a company, organisation or product officially linked to the
//              Banzami ecosystem (e.g. companies with a Memorandum of
//              Understanding, or ecosystem products like DOA).
//
// "partner" is intentionally NOT a category — it is ambiguous and must not be
// used as the primary homepage counter.
//
// Future categories may include: 'bank' | 'institution' | 'association' |
// 'government' | 'integrator'. When that happens, just extend EntityCategory and
// add entries — the homepage only ever filters 'merchant' and 'company', so the
// components do not need to change.

export type EntityCategory = 'user' | 'merchant' | 'company';

export type HomepageEntity = {
  id: string;
  category: EntityCategory;
  name: string;
  shortName?: string;
  handle?: string;
  website?: string;
  active: boolean;
  showOnHomepage: boolean;
};

// Current entities officially linked to the Banzami ecosystem. Today these are
// all companies; there are no real public merchants to list yet (merchantCount
// stays 0 — do not invent merchants, and do not reclassify companies).
export const entities: HomepageEntity[] = [
  {
    id: 'ncsj-solutions',
    category: 'company',
    name: 'NCSJ Solutions',
    shortName: 'NCSJ Solutions',
    handle: '@ncsj-solutions',
    website: 'https://www.ncsj-solutions.com',
    active: true,
    showOnHomepage: true,
  },
  {
    id: 'bec-one',
    category: 'company',
    name: 'BEC ONE',
    shortName: 'BEC ONE',
    handle: '@bec-one',
    active: true,
    showOnHomepage: true,
  },
  {
    id: 'agro-one',
    category: 'company',
    name: 'AGRO ONE',
    shortName: 'AGRO ONE',
    handle: '@agro-one',
    active: true,
    showOnHomepage: true,
  },
  {
    id: 'doa',
    category: 'company',
    name: 'DOA',
    shortName: 'DOA',
    handle: '@doa',
    website: 'https://doadoa.app',
    active: true,
    showOnHomepage: true,
  },
];

// Derived helpers — the homepage consumes these; nothing is hardcoded in the JSX.
export const homepageEntities = entities.filter((e) => e.active && e.showOnHomepage);
export const homepageCompanies = homepageEntities.filter((e) => e.category === 'company');
export const homepageMerchants = homepageEntities.filter((e) => e.category === 'merchant');

// Adoption metrics. userCount and dailyTransactionCount stay 0 until a real
// source exists (no fake data). merchant/company counts derive from the model.
export const userCount = 0;
export const merchantCount = homepageMerchants.length;
export const companyCount = homepageCompanies.length;
export const dailyTransactionCount = 0;
