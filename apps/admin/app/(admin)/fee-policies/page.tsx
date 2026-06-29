'use client';

import { CatalogManager } from '@/components/finance/catalog-manager';

export default function FeePoliciesPage() {
  return (
    <CatalogManager
      kind="policies"
      title="Políticas de fee"
      intro="Catálogo de políticas de fee (FeePolicyRef). Identifica uma política comercial por código + documentação interna. Não contém percentagens — os valores vivem apenas nas Regras de preço."
      codePlaceholder="ex.: pol_donation_standard"
      withMetadata
    />
  );
}
