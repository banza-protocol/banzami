'use client';

import { CatalogManager } from '@/components/finance/catalog-manager';
import { AssignPricingProfile } from '@/components/finance/assign-pricing-profile';
import { ClassifyBusinessAccount } from '@/components/finance/classify-business-account';

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
      {/* The other half of pricing an application: whether it may receive the fee its profile charges. */}
      <ClassifyBusinessAccount />
    </>
  );
}
