// PUBLIC-WEBSITE-LEGAL-RELEASE-001 — Terms of Service + Privacy Policy metadata.
//
// The legal BODY lives in lib/legal-content.ts (single source of truth, rendered
// by /termos and /privacidade). This file pins the published version, dates and
// a content hash over that module, so a published version is immutable: the hash
// changes if the text changes, and legal-content.test.ts fails unless the hash
// is updated deliberately together with a version bump (reacceptance rule).
//
// Scope: PUBLIC BETA SANDBOX. Nothing here or in the content claims Banzami is a
// licensed/regulated financial institution; real-money operations are out of scope.

import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  LEGAL_EFFECTIVE_DATE,
  OPERATOR_NAME,
  OPERATOR_CONTACT,
} from './legal-content';

export type TermsStatus = 'DRAFT' | 'PUBLISHED';

export interface TermsMeta {
  status: TermsStatus;
  /** Terms version, immutable once published. */
  version: string | null;
  /** Privacy Policy version, immutable once published. */
  privacyVersion: string | null;
  /** When the versions take effect (ISO date). */
  effectiveDate: string | null;
  /** When they were published (ISO date). */
  publishedAt: string | null;
  /** sha256 of lib/legal-content.ts — proves the published body did not change.
   *  Recomputed and asserted by legal-content.test.ts. */
  documentHash: string | null;
  /** Registered legal entity responsible for the documents (self-asserted name). */
  legalEntity: string;
  /** Canonical contact for legal/privacy questions. */
  contactEmail: string;
}

/** The canonical public legal routes. */
export const TERMS_ROUTE = '/termos';
export const PRIVACY_ROUTE = '/privacidade';

export const TERMS: TermsMeta = {
  status: 'PUBLISHED',
  version: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  publishedAt: LEGAL_EFFECTIVE_DATE,
  documentHash: '390a627ac446d1758b686e15196de81b67813775a77b802fc375fb8afd63e08a',
  legalEntity: OPERATOR_NAME,
  contactEmail: OPERATOR_CONTACT,
};

/** True only when an approved document is published with a real version. */
export const isTermsPublished = (): boolean => TERMS.status === 'PUBLISHED' && TERMS.version !== null;
