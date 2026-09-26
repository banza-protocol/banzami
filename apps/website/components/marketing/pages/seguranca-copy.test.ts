import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Responsible-disclosure guidance must direct researchers behaviourally without
// implying Banzami currently exposes other users' data.
describe('Segurança — responsible disclosure copy', () => {
  const src = readFileSync(join(__dirname, 'Seguranca.tsx'), 'utf8');

  it('drops the weakness-implying "access third-party data" phrasing', () => {
    expect(src).not.toContain('Não aceda a dados de terceiros');
    expect(src).not.toContain('Do not access third-party data');
  });

  it('leads with behavioural, scope-first guidance (PT + EN)', () => {
    for (const line of [
      'Teste apenas com as suas próprias contas e dados de teste',
      'Test only with your own accounts and test data',
      'Utilize exclusivamente a Sandbox',
      'Não tente contornar controlos de acesso ou permissões',
      'Do not attempt to bypass access controls or permissions',
      'Não degrade nem interrompa o serviço',
      'Aguarde a correção antes de divulgar publicamente',
    ]) {
      expect(src).toContain(line);
    }
  });

  it('does not present itself as a bug-bounty / safe-harbour programme', () => {
    expect(src).not.toMatch(/bug bounty|recompensa|safe harbou?r/i);
  });
});
