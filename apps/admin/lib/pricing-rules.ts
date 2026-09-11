// Pricing-rule form rules and wording (ADR-021 / ADR-031).
//
// Core (core/pricing/src/admin.rs PricingRuleInput::validate) is the authority.
// The console mirrors the two requirements every create/edit used to trip on —
// a rule must name the operation it prices and the profile it belongs to — so
// the operator is told before sending, in Portuguese, instead of receiving
// Core's English refusal (or a 422 for the missing field) in a toast.

import { AdminApiError, type PricingRuleInput } from '@/lib/admin-api';
import { actionErrorPt } from '@/lib/errors';

/** The released fee-bearing operations — core/pricing VALID_OPERATION /
 *  PricingOperation. Closed on purpose: adding one is an economic decision. */
export const PRICING_OPERATIONS = ['SETTLEMENT', 'PAYOUT'] as const;
export type PricingOperation = (typeof PRICING_OPERATIONS)[number];

const OPERATION_LABEL: Record<PricingOperation, string> = {
  SETTLEMENT: 'Liquidação',
  PAYOUT: 'Levantamento',
};

/** Portuguese label for a rule's operation; a rule with none prices nothing. */
export function operationLabel(op: string | null | undefined): string {
  if (!op) return 'Nenhuma';
  return OPERATION_LABEL[op as PricingOperation] ?? op;
}

/** What is wrong with the form before it is sent, or null when Core should see it. */
export function validateRuleForm(f: Pick<PricingRuleInput, 'rule_key' | 'pricing_operation' | 'pricing_profile' | 'min_fee_minor' | 'max_fee_minor'>): string | null {
  if (!f.rule_key.trim()) return 'A chave da regra é obrigatória.';
  if (!PRICING_OPERATIONS.includes(f.pricing_operation as PricingOperation)) {
    return 'Escolha a operação que a regra taxa (Liquidação ou Levantamento).';
  }
  if (!(f.pricing_profile ?? '').trim()) return 'Indique o perfil de preço — uma regra sem perfil não taxa nada.';
  if (f.min_fee_minor != null && f.max_fee_minor != null && f.min_fee_minor > f.max_fee_minor) {
    return 'A taxa mínima não pode ser maior do que a máxima.';
  }
  return null;
}

// Core's validation messages (PricingError::Config) → what the operator reads.
const CORE_MESSAGES: [RegExp, string][] = [
  [/pricing_operation/i, 'Escolha a operação que a regra taxa (Liquidação ou Levantamento).'],
  [/pricing_profile is required/i, 'Indique o perfil de preço — uma regra sem perfil não taxa nada.'],
  [/rule_key must not be empty/i, 'A chave da regra é obrigatória.'],
  [/already exists/i, 'Já existe uma regra com esta chave neste ambiente.'],
  [/min_fee_minor must be <= max_fee_minor/i, 'A taxa mínima não pode ser maior do que a máxima.'],
  [/effective_to must be after/i, 'A data de fim tem de ser posterior ao início de vigência.'],
  [/unsupported currency/i, 'Moeda não suportada.'],
  [/must be >= 0/i, 'As taxas e limites não podem ser negativos.'],
  [/rounding must be/i, 'Arredondamento inválido.'],
  [/cannot duplicate a rule that names no pricing operation/i, 'Não é possível duplicar uma regra que não indica operação.'],
];

/** A failed save/duplicate, in Portuguese: Core's specific refusal when known,
 *  else the failure class. Never Core's raw English. */
export function pricingRuleErrorPt(err: unknown, what: string): string {
  if (err instanceof AdminApiError && err.status >= 400 && err.status < 500) {
    for (const [re, pt] of CORE_MESSAGES) if (re.test(err.message)) return `${what} ${pt}`;
  }
  return actionErrorPt(err, what);
}
