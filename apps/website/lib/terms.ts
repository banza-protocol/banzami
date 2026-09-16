// PUBLIC-WEBSITE-LEGAL-RELEASE-001 — Terms of Service metadata.
//
// The Terms BODY is human-approved legal content and is NOT authored here. This
// file only carries the versioning + identity scaffold around it. Until an
// approved document is supplied, status stays 'DRAFT' and /termos renders a
// controlled placeholder (noindex) that fabricates no clauses.
//
// When the approved document is published, set status to 'PUBLISHED' and fill
// version / effectiveDate / publishedAt / documentHash from the approved source.
// A published version is immutable: never change version while changing the body.

export type TermsStatus = 'DRAFT' | 'PUBLISHED';

export interface TermsMeta {
  status: TermsStatus;
  /** Human-readable, immutable once published (e.g. '2026-10-01'). */
  version: string | null;
  /** When the version takes effect (ISO date). */
  effectiveDate: string | null;
  /** When it was published (ISO date). */
  publishedAt: string | null;
  /** Stable content hash of the approved body, proving the version did not change. */
  documentHash: string | null;
  /** Registered legal entity responsible for the document (approved identity). */
  legalEntity: string;
  /** Canonical contact for legal questions. */
  contactEmail: string;
}

/** The one canonical public Terms route. */
export const TERMS_ROUTE = '/termos';

export const TERMS: TermsMeta = {
  status: 'DRAFT',
  version: null,
  effectiveDate: null,
  publishedAt: null,
  documentHash: null,
  legalEntity: 'BANZAMI – Tecnologia e Serviços, Lda.',
  contactEmail: 'contact@banzami.com',
};

/** True only when an approved document is published with a real version. */
export const isTermsPublished = (): boolean => TERMS.status === 'PUBLISHED' && TERMS.version !== null;
