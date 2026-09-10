// Canonical Banzami business taxonomy — the single source of truth that maps a
// merchant's chosen category/subcategory to the operator's pricing category.
//
// The merchant picks a category (+ optional subcategory) at onboarding. From
// that choice the operator AUTOMATICALLY derives:
//   - businessCategory  → the canonical business_category
//   - pricingCategory   → the value the Pricing Engine matches a rule on
// Nobody picks a pricing rule per merchant by hand. See
// docs/architecture/business-taxonomy.md and docs/architecture/pricing-mapping.md.
//
// IMPORTANT: no rate follows from a category any more. The rate an owner pays is
// the SETTLEMENT/PAYOUT rule of the pricing profile the operator assigned to it
// (ADR-057), and no caller — DOA included — sends a rate of its own. The
// category is descriptive: what kind of business this is, not what it costs.

/// Operator pricing categories. The Pricing Engine resolves a rule by matching a
/// transaction's business_category against a rule's business_category. These are
/// the exact values the seeded rules use (donation-standard → DONATION,
/// marketplace-standard → MARKETPLACE, general commerce → MERCHANT_PAYMENT).
export type PricingCategory = 'DONATION' | 'MARKETPLACE' | 'MERCHANT_PAYMENT';

export interface BusinessCategoryDef {
  /** Internal, stable key (never translated). */
  key: string;
  /** Portuguese display name shown in the onboarding form. */
  namePt: string;
  description: string;
  subcategories: string[];
  /** Canonical business_category stored on the merchant. */
  businessCategory: string;
  /** Operator pricing category the Pricing Engine resolves the rule from. */
  pricingCategory: PricingCategory;
  /** Compliance / risk note for the operator (informational). */
  riskHint?: string;
  examples: string[];
}

export const BUSINESS_TAXONOMY: BusinessCategoryDef[] = [
  {
    key: 'donation',
    namePt: 'Doações e causas',
    description: 'Doações, vaquinhas, crowdfunding e recolha de fundos para causas.',
    subcategories: [
      'Vaquinha pessoal', 'Campanha solidária', 'Crowdfunding comunitário',
      'Emergência médica', 'Educação', 'Funeral', 'Projeto social',
    ],
    businessCategory: 'donation',
    pricingCategory: 'DONATION',
    riskHint: 'Origem/destino de fundos; verificar campanhas de alto valor.',
    examples: ['DOA', 'Vaquinha para tratamento', 'Campanha de emergência'],
  },
  {
    key: 'ngo',
    namePt: 'ONG e associações',
    description: 'Organizações não-governamentais, associações e instituições sem fins lucrativos.',
    subcategories: ['ONG', 'Associação', 'Instituição religiosa', 'Fundação'],
    businessCategory: 'donation',
    pricingCategory: 'DONATION',
    riskHint: 'Verificar registo legal da organização.',
    examples: ['ONG local', 'Associação de bairro'],
  },
  {
    key: 'marketplace',
    namePt: 'Marketplace e plataformas',
    description: 'Plataformas que agregam vários vendedores/prestadores e intermediam pagamentos.',
    subcategories: ['Marketplace de produtos', 'Plataforma de serviços', 'Delivery multi-loja', 'Reservas'],
    businessCategory: 'marketplace',
    pricingCategory: 'MARKETPLACE',
    riskHint: 'Fluxos multi-beneficiário; validar repasses.',
    examples: ['Loja de várias marcas', 'App de entregas multi-restaurante'],
  },
  {
    key: 'food_and_drinks',
    namePt: 'Alimentação e bebidas',
    description: 'Restaurantes, cantinas, bares e comércio alimentar.',
    subcategories: ['Restaurante', 'Cantina', 'Pastelaria', 'Bar', 'Take-away', 'Mercearia'],
    businessCategory: 'food_and_drinks',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Cantina do Kilamba', 'Restaurante', 'Padaria'],
  },
  {
    key: 'retail',
    namePt: 'Retalho',
    description: 'Lojas e comércio de produtos.',
    subcategories: ['Loja de roupa', 'Loja alimentar', 'Loja de conveniência', 'Supermercado', 'Peças e acessórios'],
    businessCategory: 'retail',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Loja de roupa', 'Supermercado'],
  },
  {
    key: 'pharmacy_health',
    namePt: 'Farmácia e saúde',
    description: 'Farmácias, clínicas e serviços de saúde.',
    subcategories: ['Farmácia', 'Clínica', 'Laboratório', 'Óptica'],
    businessCategory: 'pharmacy_health',
    pricingCategory: 'MERCHANT_PAYMENT',
    riskHint: 'Setor regulado (saúde).',
    examples: ['Farmácia', 'Clínica'],
  },
  {
    key: 'services',
    namePt: 'Serviços',
    description: 'Serviços profissionais e prestações diversas.',
    subcategories: ['Serviços profissionais', 'Limpeza', 'Reparações', 'Consultoria', 'Lavandaria'],
    businessCategory: 'services',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Consultoria', 'Lavandaria'],
  },
  {
    key: 'transport',
    namePt: 'Transportes',
    description: 'Táxis, transporte de mercadorias e logística.',
    subcategories: ['Táxi', 'Transporte de mercadorias', 'Aluguer de viaturas', 'Logística'],
    businessCategory: 'transport',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['App de táxi', 'Transportadora'],
  },
  {
    key: 'education',
    namePt: 'Educação',
    description: 'Escolas, formação e explicações.',
    subcategories: ['Escola', 'Explicações', 'Formação profissional', 'Creche'],
    businessCategory: 'education',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Escola', 'Centro de formação'],
  },
  {
    key: 'beauty',
    namePt: 'Beleza e estética',
    description: 'Cabeleireiros, barbearias e estética.',
    subcategories: ['Salão de cabeleireiro', 'Barbearia', 'Estética', 'Manicure / Pedicure'],
    businessCategory: 'beauty',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Barbearia', 'Salão'],
  },
  {
    key: 'technology',
    namePt: 'Tecnologia',
    description: 'Lojas e serviços de tecnologia, software e apps.',
    subcategories: ['Loja de informática', 'Reparação de telemóveis', 'Software / Apps', 'Serviços digitais'],
    businessCategory: 'technology',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Loja de informática', 'Estúdio de software'],
  },
  {
    key: 'auto_parts',
    namePt: 'Oficinas e peças',
    description: 'Oficinas auto, peças e serviços automóveis.',
    subcategories: ['Oficina auto', 'Peças auto', 'Lavagem de viaturas', 'Bate-chapa e pintura'],
    businessCategory: 'auto_parts',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Oficina', 'Loja de peças'],
  },
  {
    key: 'hospitality',
    namePt: 'Hotelaria e alojamento',
    description: 'Hotéis, pensões e alojamento.',
    subcategories: ['Hotel', 'Pensão / Hospedaria', 'Guest house', 'Arrendamento turístico'],
    businessCategory: 'hospitality',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Hotel', 'Guest house'],
  },
  {
    key: 'entertainment',
    namePt: 'Entretenimento',
    description: 'Eventos, discotecas e produção.',
    subcategories: ['Eventos', 'Discoteca / Bar', 'Aluguer de equipamento', 'Produção musical'],
    businessCategory: 'entertainment',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Produtora de eventos', 'Discoteca'],
  },
  {
    key: 'government',
    namePt: 'Governo e setor público',
    description: 'Entidades e serviços públicos.',
    subcategories: ['Serviço público', 'Autarquia', 'Taxa / licença'],
    businessCategory: 'government',
    pricingCategory: 'MERCHANT_PAYMENT',
    riskHint: 'Entidade pública — validar mandato.',
    examples: ['Autarquia', 'Serviço de licenças'],
  },
  {
    key: 'utilities',
    namePt: 'Utilities e contas',
    description: 'Água, energia, telecomunicações e contas.',
    subcategories: ['Água', 'Energia', 'Telecomunicações', 'Recarga'],
    businessCategory: 'utilities',
    pricingCategory: 'MERCHANT_PAYMENT',
    examples: ['Recargas', 'Contas de serviços'],
  },
  {
    key: 'other',
    namePt: 'Outros',
    description: 'Categoria genérica quando nenhuma acima se aplica. Requer descrição livre.',
    subcategories: [],
    businessCategory: 'other',
    pricingCategory: 'MERCHANT_PAYMENT',
    riskHint: 'Fallback — rever manualmente antes de ativar.',
    examples: [],
  },
];

const _byKey = new Map(BUSINESS_TAXONOMY.map((c) => [c.key, c]));
const _byName = new Map(BUSINESS_TAXONOMY.map((c) => [c.namePt, c]));

/** The 'Outros' fallback category. */
export const OTHER_KEY = 'other';

/** Look up a category by its internal key. */
export function categoryByKey(key: string): BusinessCategoryDef | undefined {
  return _byKey.get(key);
}

/** Look up a category by its PT display name (as chosen in the form). */
export function categoryByName(namePt: string): BusinessCategoryDef | undefined {
  return _byName.get(namePt);
}

/**
 * Resolve the operator pricing for a chosen category (by key OR PT name).
 * Returns the canonical business_category + pricing_category, or null when the
 * category is unknown (a configuration error that must block activation).
 */
export function resolvePricing(categoryKeyOrName: string):
  | { businessCategory: string; pricingCategory: PricingCategory; fallback: boolean }
  | null {
  const c = _byKey.get(categoryKeyOrName) ?? _byName.get(categoryKeyOrName);
  if (!c) return null;
  return {
    businessCategory: c.businessCategory,
    pricingCategory: c.pricingCategory,
    fallback: c.key === OTHER_KEY,
  };
}

/** True when every active category maps to a pricing category (no gaps). */
export function everyCategoryMapped(): boolean {
  return BUSINESS_TAXONOMY.every((c) => !!c.pricingCategory && !!c.businessCategory);
}
