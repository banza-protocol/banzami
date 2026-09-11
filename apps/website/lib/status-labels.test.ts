import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountPurposeLabel, accountStatusLabel, kybStatusLabel, proofStatusLabel } from './status-labels';

describe('status codes are shown as Portuguese words', () => {
  it('KYB', () => {
    expect(kybStatusLabel('UNDER_REVIEW')).toBe('em análise');
    expect(kybStatusLabel('PENDING')).toBe('pendente');
    expect(kybStatusLabel(null)).toBe('pendente');
    expect(kybStatusLabel('SOMETHING_NEW')).toBe('por confirmar');
  });

  it('accounts', () => {
    expect(accountPurposeLabel('PRIMARY')).toBe('Principal');
    expect(accountPurposeLabel('CAMPAIGN')).toBe('Campanha');
    expect(accountStatusLabel('ACTIVE')).toBe('Activa');
    expect(accountStatusLabel('SUSPENDED')).toBe('Suspensa');
  });

  it('proofs', () => {
    expect(proofStatusLabel('FAILED')).toBe('Falhado');
    expect(proofStatusLabel('CONFIRMED')).toBe('Confirmado');
    expect(proofStatusLabel('WHATEVER')).toBe('Desconhecido');
  });

  it('no label ever passes an unknown code through raw', () => {
    for (const f of [kybStatusLabel, accountPurposeLabel, accountStatusLabel, proofStatusLabel]) {
      expect(f('SOME_CODE')).not.toMatch(/SOME_CODE/);
    }
  });

  it('the Console and the verifier render codes through these labels', () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
    expect(read('components/developers/portal/FinancialOnboarding.tsx')).not.toMatch(/Verificação: \$\{business\.kyb_status/);
    const saldos = read('app/developers/saldos/page.tsx');
    expect(saldos).not.toMatch(/>\{a\.status\}</);
    expect(saldos).not.toMatch(/^\s*\{a\.purpose\}\s*$/m);
    const setup = read('components/developers/portal/FinancialSetup.tsx');
    expect(setup).not.toMatch(/value=\{r\.kyb\.status \?\? '—'\}/);
    expect(setup).not.toMatch(/\$\{r\.wallet\.status \?\? '—'\}/);
    expect(read('app/r/[ref]/page.tsx')).not.toMatch(/Estado: \$\{p\.status\}/);
  });
});
