import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sandboxBusinessData,
  sandboxSeed,
  sandboxPdfContent,
  SANDBOX_DOC_FILENAMES,
} from './sandbox-autofill';
import { isValidHandleFormat } from './api';
import { municipiosDe } from './angola';
import { subcategoriasDe, CATEGORIES, VOLUME_FAIXAS } from './business-categories';

const FORM = readFileSync(
  join(__dirname, '../app/comerciantes/candidatura/CandidaturaForm.tsx'),
  'utf8',
);

describe('sandboxBusinessData — complete + valid for every field', () => {
  const d = sandboxBusinessData(1234);

  it('fills every field of every section (no empty required value)', () => {
    for (const [k, v] of Object.entries(d)) {
      expect(v, `field ${k} must not be empty`).toBeTruthy();
    }
  });

  it('produces a valid, format-correct @handle', () => {
    expect(isValidHandleFormat(d.handle)).toBe(true);
    expect(d.handle).toBe('cantina_teste_1234');
  });

  it('uses a real category + subcategory pair', () => {
    expect(CATEGORIES).toContain(d.category);
    expect(subcategoriasDe(d.category)).toContain(d.subcategory);
  });

  it('uses a real Luanda município (a valid Select option)', () => {
    expect(municipiosDe(d.provincia)).toContain(d.municipio);
  });

  it('uses a valid volume band', () => {
    expect(VOLUME_FAIXAS).toContain(d.volume);
  });

  it('passes phone (9 digits) and NIF validation', () => {
    expect(/^\d{9}$/.test(d.phone)).toBe(true);
    expect(/^\d{9}$/.test(d.telPessoal)).toBe(true);
    expect(/^\d{9,14}$/.test(d.nif)).toBe(true);
  });

  it('gives valid emails', () => {
    const ok = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    expect(ok(d.email)).toBe(true);
    expect(ok(d.emailPessoal)).toBe(true);
  });

  it('varies the @handle by seed so applications never collide', () => {
    expect(sandboxBusinessData(1111).handle).not.toBe(sandboxBusinessData(2222).handle);
    expect(sandboxSeed()).toBeGreaterThanOrEqual(1000);
    expect(sandboxSeed()).toBeLessThanOrEqual(9999);
  });
});

describe('sandbox documents', () => {
  it('has the three expected sandbox filenames', () => {
    expect(SANDBOX_DOC_FILENAMES.docCertidao).toBe('registo-comercial-sandbox.pdf');
    expect(SANDBOX_DOC_FILENAMES.docBi).toBe('bi-representante-sandbox.pdf');
    expect(SANDBOX_DOC_FILENAMES.docExtra).toBe('documento-adicional-sandbox.pdf');
  });

  it('generates a valid, self-describing PDF payload', () => {
    const pdf = sandboxPdfContent('Registo Comercial');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('Registo Comercial');
    expect(pdf).toContain('SANDBOX');
  });
});

describe('CandidaturaForm — autofill wiring (source guards)', () => {
  it('global button says "Preencher tudo com dados de teste" and calls fillAll', () => {
    expect(FORM).toContain('Preencher tudo com dados de teste');
    expect(FORM).toContain('onClick={fillAll}');
  });

  it('the global fill composes every section + docs + terms', () => {
    for (const fn of ['applyNegocio(d)', 'applyLocalizacao(d)', 'applyResponsavel(d)', 'applyAtividade(d)', 'generateSandboxDocs()', 'setAccepted(true)']) {
      expect(FORM, `fillAll must call ${fn}`).toContain(fn);
    }
  });

  it('has a per-section fill button on all five sections', () => {
    const matches = FORM.match(/<SbxFillButton/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
    expect(FORM).toContain('Gerar documentos sandbox');
  });

  it('gates every fill control behind isSandbox (never rendered in LIVE)', () => {
    // Global button lives inside the `isSandbox && (...)` notice; each section
    // button is rendered `isSandbox ? <SbxFillButton .../> : undefined`.
    expect(FORM).toContain('isSandbox ? <SbxFillButton');
    expect(FORM).toContain('{isSandbox && <SbxFillButton');
  });

  it('shows sandbox toasts for global + per-section fills', () => {
    expect(FORM).toContain('Formulário preenchido com dados sandbox.');
    expect(FORM).toContain('Secção preenchida com dados sandbox.');
  });

  it('marks generated documents as sandbox-ready with a badge', () => {
    expect(FORM).toContain('Documento sandbox pronto');
    expect(FORM).toContain('<SandboxBadge');
  });
});
