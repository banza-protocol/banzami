'use client';

import { CatalogManager } from '@/components/finance/catalog-manager';

export default function PricingProfilesPage() {
  return (
    <CatalogManager
      kind="profiles"
      title="Perfis de preço"
      intro="Catálogo de perfis comerciais (STANDARD, PARTNER, NGO…). Apenas referência — sem percentagens. Os valores vivem nas Regras de preço; aqui apenas se nomeiam e ativam/desativam os códigos."
      codePlaceholder="ex.: STANDARD"
    />
  );
}
