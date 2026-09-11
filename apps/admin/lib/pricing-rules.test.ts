import { describe, expect, it } from 'vitest';
import { AdminApiError } from '@/lib/admin-api';
import { PRICING_OPERATIONS, operationLabel, pricingRuleErrorPt, validateRuleForm } from './pricing-rules';

const ok = { rule_key: 'donation-standard', pricing_operation: 'SETTLEMENT', pricing_profile: 'STANDARD', min_fee_minor: null, max_fee_minor: null };

describe('pricing rule form', () => {
  it('offers exactly Core’s released operations', () => {
    // core/pricing/src/admin.rs VALID_OPERATION
    expect([...PRICING_OPERATIONS]).toEqual(['SETTLEMENT', 'PAYOUT']);
    expect(operationLabel('SETTLEMENT')).toBe('Liquidação');
    expect(operationLabel('PAYOUT')).toBe('Levantamento');
    expect(operationLabel(null)).toBe('Nenhuma');
  });

  it('refuses a rule that names no operation, no profile or no key', () => {
    expect(validateRuleForm(ok)).toBeNull();
    expect(validateRuleForm({ ...ok, pricing_operation: '' })).toMatch(/operação/);
    expect(validateRuleForm({ ...ok, pricing_operation: 'CAPTURE' })).toMatch(/operação/);
    expect(validateRuleForm({ ...ok, pricing_profile: '  ' })).toMatch(/perfil/);
    expect(validateRuleForm({ ...ok, pricing_profile: null })).toMatch(/perfil/);
    expect(validateRuleForm({ ...ok, rule_key: ' ' })).toMatch(/chave/);
    expect(validateRuleForm({ ...ok, min_fee_minor: 500, max_fee_minor: 100 })).toMatch(/mínima/);
  });

  it('never shows Core’s English refusal', () => {
    const e = new AdminApiError(400, 'BAD_REQUEST', 'invalid pricing configuration: pricing_profile is required — a rule with no profile prices nothing');
    const msg = pricingRuleErrorPt(e, 'Não foi possível guardar a regra.');
    expect(msg).toBe('Não foi possível guardar a regra. Indique o perfil de preço — uma regra sem perfil não taxa nada.');
    expect(msg).not.toMatch(/invalid|required/);

    const unknown = pricingRuleErrorPt(new AdminApiError(400, 'BAD_REQUEST', 'something new in English'), 'X.');
    expect(unknown).toBe('X. O pedido foi recusado — verifique os dados.');
    expect(pricingRuleErrorPt(new AdminApiError(409, 'CONFLICT', 'rule_key already exists'), 'X.')).toMatch(/Já existe uma regra/);
    expect(pricingRuleErrorPt(new AdminApiError(403, 'FORBIDDEN', 'forbidden'), 'X.')).toMatch(/permissão/);
    expect(pricingRuleErrorPt(new AdminApiError(502, 'BAD_GATEWAY', 'upstream'), 'X.')).toMatch(/indisponível/);
  });
});
