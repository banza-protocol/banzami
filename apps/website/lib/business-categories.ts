// Onboarding categories — derived from the canonical business taxonomy
// (lib/business-taxonomy.ts), which is the single source of truth and also maps
// each category to the operator pricing category. The "Outros" category opens a
// free "Descreva a categoria" field.

import { BUSINESS_TAXONOMY, OTHER_KEY, categoryByName } from './business-taxonomy';

/** PT category names in taxonomy order (donation first, "Outros" last). */
export const CATEGORIES: string[] = BUSINESS_TAXONOMY.map((c) => c.namePt);

/** The free-text "Outros" category name. */
export const OUTROS = BUSINESS_TAXONOMY.find((c) => c.key === OTHER_KEY)!.namePt;

export const SUBCATEGORIES: Record<string, string[]> = Object.fromEntries(
  BUSINESS_TAXONOMY.filter((c) => c.subcategories.length > 0).map((c) => [c.namePt, c.subcategories]),
);

/** Subcategorias de uma categoria (vazio para "Outros" ou categoria inválida). */
export function subcategoriasDe(categoria: string): string[] {
  return categoryByName(categoria)?.subcategories ?? [];
}

// Volume mensal estimado (faixas em Kz) — usado para risco/limites no MVP.
export const VOLUME_FAIXAS: string[] = [
  'Menos de 100.000 Kz',
  '100.000 – 500.000 Kz',
  '500.000 – 2.000.000 Kz',
  '2.000.000 – 10.000.000 Kz',
  'Mais de 10.000.000 Kz',
];
