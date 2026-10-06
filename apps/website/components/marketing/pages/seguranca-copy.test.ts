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

// The cryptography section names only real, publishable mechanisms. Each claim is
// pinned to the source that implements it, so changing the mechanism without
// updating the copy fails here rather than misleading a reader. No marketing
// absolutes, and receipts are never described as a client-verifiable signature.
describe('Segurança — cryptography claims are grounded in the real code', () => {
  const src = readFileSync(join(__dirname, 'Seguranca.tsx'), 'utf8');
  const repo = (p: string) => readFileSync(join(__dirname, '../../../../..', p), 'utf8');

  it('states the published mechanisms (bcrypt, HMAC-SHA256, TLS 1.2, OTP 10 min single-use)', () => {
    expect(src).toContain('bcrypt');
    expect(src).toContain('HMAC-SHA256');
    expect(src).toContain('TLS 1.2');
    expect(src).toContain('banza-signature');
    expect(src).toMatch(/10 minutos|10 minutes/);
    expect(src).toMatch(/uso único|single-use/);
  });

  it('PIN hashing claim matches public-api (bcrypt) — update the copy if the algorithm changes', () => {
    expect(repo('services/public-api/internal/service/credentials.go')).toContain('bcrypt');
  });

  it('webhook signing claim matches the signer (HMAC + SHA-256)', () => {
    const signer = repo('services/api-gateway/internal/webhook/signer.go');
    expect(signer).toContain('crypto/hmac');
    expect(signer).toContain('crypto/sha256');
  });

  it('does not use forbidden marketing absolutes', () => {
    expect(src).not.toMatch(/military[- ]grade|bank[- ]grade|unbreakable|inquebrável|grau militar/i);
    expect(src).not.toMatch(/end-to-end encryption|cifra(gem)? ponta a ponta/i);
    expect(src).not.toContain('Financial Live');
  });

  it('does not over-claim receipts as a client-verifiable cryptographic signature', () => {
    // Argon2id is the wallet-engine layer, not the login path shown here.
    expect(src).not.toContain('Argon2');
    // The receipt mechanism is reference-based, explicitly not a public signature.
    expect(src).toMatch(/não uma assinatura pública|not a public signature/);
  });
});
