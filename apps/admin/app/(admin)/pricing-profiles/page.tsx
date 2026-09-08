'use client';

import { CatalogManager } from '@/components/finance/catalog-manager';
import { AssignPricingProfile } from '@/components/finance/assign-pricing-profile';

export default function PricingProfilesPage() {
  return (
    <>
      <CatalogManager
        kind="profiles"
        title="Perfis de preço"
        intro="Os perfis comerciais do operador. Um perfil é o que decide quanto uma Business Account paga: o modelo resolve exactamente uma regra a partir de (perfil atribuído, operação), e uma conta sem perfil não resolve nenhuma. As percentagens vivem nas Regras de preço; aqui nomeiam-se, activam-se e atribuem-se."
        codePlaceholder="ex.: sandbox-reference"
      />
      <AssignPricingProfile />
    </>
  );
}
