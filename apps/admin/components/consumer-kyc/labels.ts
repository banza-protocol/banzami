// Shared KYC display vocabulary (case lifecycle + document types), used by the
// list page and the review drawer. Kept out of the page file because Next.js
// route modules may not export arbitrary symbols.

// KYC case lifecycle. Decisions are only possible from UNDER_REVIEW.
export const KYC_STATUS: Record<string, { label: string; cls: string }> = {
  WAITING_DOCUMENTS: { label: 'Aguarda documentos', cls: 'bg-gray-100 text-gray-600' },
  UNDER_REVIEW: { label: 'Em análise', cls: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Aprovado', cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: 'Rejeitado', cls: 'bg-red-50 text-red-700' },
  EXPIRED: { label: 'Expirado', cls: 'bg-red-50 text-red-700' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500' },
};

export const KYC_DOC_LABEL: Record<string, string> = {
  IDENTITY_CARD: 'Bilhete de Identidade',
  PASSPORT: 'Passaporte',
  RESIDENCE_PERMIT: 'Autorização de residência',
  DRIVER_LICENSE: 'Carta de condução',
};
