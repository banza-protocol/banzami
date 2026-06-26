import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROVINCIAS, municipiosDe, cidadesDe } from './angola';
import { CATEGORIES, OUTROS, subcategoriasDe, VOLUME_FAIXAS } from './business-categories';
import { submitApplication, type ApplicationInput } from './api';

afterEach(() => vi.unstubAllGlobals());

const FORM = readFileSync(join(__dirname, '../app/comerciantes/candidatura/CandidaturaForm.tsx'), 'utf8');

describe('Angola location data', () => {
  it('has the 18 províncias', () => {
    expect(PROVINCIAS).toHaveLength(18);
    expect(PROVINCIAS).toContain('Luanda');
    expect(PROVINCIAS).toContain('Cuando Cubango');
  });

  it('município depends on província', () => {
    expect(municipiosDe('Luanda')).toContain('Talatona');
    expect(municipiosDe('Luanda')).toContain('Viana');
    expect(municipiosDe('Benguela')).toContain('Lobito');
    expect(municipiosDe('Huíla')).toContain('Lubango');
    // A município from one province must NOT appear under another.
    expect(municipiosDe('Benguela')).not.toContain('Talatona');
    // Unknown province → empty (no flat global list).
    expect(municipiosDe('Não Existe')).toEqual([]);
  });

  it('cidade suggestions are per-município and optional (free text)', () => {
    expect(cidadesDe('Talatona')).toContain('Benfica');
    expect(cidadesDe('Município Desconhecido')).toEqual([]);
  });
});

describe('business categories', () => {
  it('subcategoria depends on categoria', () => {
    expect(CATEGORIES).toContain('Alimentação e bebidas');
    expect(subcategoriasDe('Alimentação e bebidas')).toContain('Cantina');
    expect(subcategoriasDe('Farmácia e saúde')).toContain('Farmácia');
    expect(subcategoriasDe('Não Existe')).toEqual([]);
  });

  it('Outros has no fixed subcategories (free description instead)', () => {
    expect(CATEGORIES).toContain(OUTROS);
    expect(subcategoriasDe(OUTROS)).toEqual([]);
  });

  it('offers estimated monthly volume bands in Kz', () => {
    expect(VOLUME_FAIXAS.length).toBeGreaterThanOrEqual(3);
    expect(VOLUME_FAIXAS.join(' ')).toMatch(/Kz/);
  });
});

describe('submit application — structured payload', () => {
  function captureFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return { ok: status >= 200 && status < 300, status, json: async () => body };
      }),
    );
    return calls;
  }

  it('sends every structured field as its own key (no folding) + environment', async () => {
    const calls = captureFetch(201, { application_id: 'app-9', status: 'SUBMITTED' });
    const input: ApplicationInput = {
      desired_handle: 'cantina_alex',
      business_name: 'Cantina do Alex',
      category: 'Alimentação e bebidas',
      subcategory: 'Cantina',
      email: 'geral@cantina.co.ao',
      phone: '+244 923 456 789',
      nif: '5001234567',
      country: 'Angola',
      province: 'Luanda',
      municipality: 'Talatona',
      city: 'Benfica',
      address: 'Rua Direita do Kilamba',
      address_reference: 'Próximo ao supermercado X',
      legal_representative: 'João da Silva',
      representative_role: 'Proprietário(a)',
      representative_email: 'joao@email.com',
      representative_phone: '+244 924 000 000',
      business_activity: 'Refeições e bebidas para levar',
      estimated_volume: '100.000 – 500.000 Kz',
      terms_accepted: true,
    };
    const r = await submitApplication(input);
    expect(r.ok).toBe(true);
    expect(r.applicationId).toBe('app-9');

    const body = JSON.parse(calls[0].init.body as string);
    for (const k of [
      'province', 'municipality', 'subcategory', 'address_reference',
      'representative_role', 'representative_email', 'representative_phone', 'estimated_volume',
    ]) {
      expect(body[k]).toBeTruthy();
    }
    expect(body.environment).toBeDefined();
    // No legacy folded keys.
    expect(body.reference).toBeUndefined();
  });
});

describe('CandidaturaForm — final flow guarantees', () => {
  it('uses Angola-first dependent location data', () => {
    expect(FORM).toMatch(/from '@\/lib\/angola'/);
    expect(FORM).toMatch(/from '@\/lib\/business-categories'/);
    expect(FORM).toContain('onChangeProvincia');
    expect(FORM).toContain('municipiosDisponiveis');
    expect(FORM).toContain('subcategoriasDisponiveis');
  });

  it('has no proof-of-address anywhere', () => {
    expect(FORM).not.toMatch(/proof[_\s-]?of[_\s-]?address/i);
    expect(FORM).not.toMatch(/comprovativo de morada/i);
  });

  it('requires exactly the 3 company documents — no bank proof, no optional', () => {
    expect(FORM).toContain('BUSINESS_REGISTRATION');
    expect(FORM).toContain('TAX_ID');
    expect(FORM).toContain('REPRESENTATIVE_ID');
    // Bank proof was removed from the application entirely.
    expect(FORM).not.toContain('BANK_PROOF');
    expect(FORM).not.toMatch(/comprovativo banc[áa]rio/i);
    expect(FORM).not.toMatch(/optional: true/); // no optional DOCUMENT defs
    expect(FORM).not.toMatch(/acelera a configuração de pagamentos/i);
    // Exactly three document definitions (BUSINESS_REGISTRATION/TAX_ID/REPRESENTATIVE_ID).
    expect((FORM.match(/type: 'BUSINESS_REGISTRATION'|type: 'TAX_ID'|type: 'REPRESENTATIVE_ID'/g) || []).length).toBe(3);
    // Optional FORM fields (subcategoria, referência) remain legitimately optional.
  });

  it('never fakes uploads — handles storage-not-configured', () => {
    expect(FORM).toContain('storageNotConfigured');
    expect(FORM).toContain("res.reason === 'NOT_CONFIGURED'");
  });

  it('collects estimated volume + short description', () => {
    expect(FORM).toContain('estimated_volume');
    expect(FORM).toContain('Volume mensal estimado');
    expect(FORM).toContain('Descrição curta do negócio');
  });

  it('success copy describes análise → aprovação → ativação (no auto-approval)', () => {
    expect(FORM).toContain('Candidatura enviada');
    expect(FORM).toMatch(/link de ativação/i);
    expect(FORM).toContain('PRÓXIMOS PASSOS');
    expect(FORM).not.toMatch(/aprovação automática|aprovado automaticamente/i);
  });
});
