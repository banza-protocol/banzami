import { describe, it, expect } from 'vitest';
import {
  BUSINESS_TAXONOMY, resolvePricing, everyCategoryMapped, categoryByName, OTHER_KEY,
} from './business-taxonomy';
import { CATEGORIES, OUTROS, subcategoriasDe } from './business-categories';

describe('business taxonomy → operator pricing mapping', () => {
  it('DOA / Doações resolves to donation → DONATION', () => {
    expect(resolvePricing('donation')).toEqual({
      businessCategory: 'donation', pricingCategory: 'DONATION', fallback: false,
    });
    expect(resolvePricing('Doações e causas')?.pricingCategory).toBe('DONATION');
    // ONG also maps to the donation pricing category.
    expect(resolvePricing('ngo')?.pricingCategory).toBe('DONATION');
  });

  it('marketplace resolves to MARKETPLACE', () => {
    expect(resolvePricing('marketplace')?.pricingCategory).toBe('MARKETPLACE');
    expect(resolvePricing('marketplace')?.businessCategory).toBe('marketplace');
  });

  it('retail / general commerce resolves to MERCHANT_PAYMENT (fallback family)', () => {
    expect(resolvePricing('retail')?.pricingCategory).toBe('MERCHANT_PAYMENT');
    expect(resolvePricing('food_and_drinks')?.pricingCategory).toBe('MERCHANT_PAYMENT');
  });

  it('"Outros" is the only flagged fallback', () => {
    const r = resolvePricing('other');
    expect(r?.pricingCategory).toBe('MERCHANT_PAYMENT');
    expect(r?.fallback).toBe(true);
    // No other category is a fallback.
    for (const c of BUSINESS_TAXONOMY) {
      if (c.key !== OTHER_KEY) expect(resolvePricing(c.key)?.fallback).toBe(false);
    }
  });

  it('an unknown category returns null (blocks activation)', () => {
    expect(resolvePricing('not-a-real-category')).toBeNull();
  });

  it('every category maps to a pricing category (no gaps)', () => {
    expect(everyCategoryMapped()).toBe(true);
    for (const c of BUSINESS_TAXONOMY) {
      expect(['DONATION', 'MARKETPLACE', 'MERCHANT_PAYMENT']).toContain(c.pricingCategory);
      expect(c.businessCategory).toBeTruthy();
    }
  });
});

describe('onboarding categories derive from the taxonomy', () => {
  it('exposes a Doações category so DOA can be selected', () => {
    expect(CATEGORIES).toContain('Doações e causas');
    expect(subcategoriasDe('Doações e causas')).toContain('Crowdfunding comunitário');
  });
  it('keeps "Outros" as the free-text category', () => {
    expect(OUTROS).toBe('Outros');
    expect(CATEGORIES[CATEGORIES.length - 1]).toBe('Outros');
  });
  it('keeps the existing food category + subcategory (sandbox autofill still valid)', () => {
    expect(CATEGORIES).toContain('Alimentação e bebidas');
    expect(subcategoriasDe('Alimentação e bebidas')).toContain('Cantina');
    expect(categoryByName('Alimentação e bebidas')?.businessCategory).toBe('food_and_drinks');
  });
});
