import { describe, it, expect } from 'vitest';
import { REFUSAL_TEXT, handleUnavailableText } from './financial-onboarding';

// Policy: the public interface must never disclose WHY a @banza is unavailable
// (already in use, reserved, protected, retired or institutional). Every
// unavailable case reads the same neutral message; no class is ever named, and
// no institution is ever referenced.
const FORBIDDEN = /reservad|protegid|protected|owned|business account|já é de um negócio|pertence|banco\b|instituiç/i;

describe('@banza unavailability copy is neutral (never reveals class)', () => {
  it('handleUnavailableText collapses every class to one neutral line', () => {
    for (const reason of ['BUSINESS', 'RESERVED', 'PENDING', 'TAKEN', 'UNAVAILABLE', undefined]) {
      const msg = handleUnavailableText(reason);
      expect(msg).toMatch(/não está disponível/i);
      expect(msg).not.toMatch(FORBIDDEN);
    }
  });

  it('a format hint stays distinct (non-sensitive) and mentions the letter-start rule', () => {
    const msg = handleUnavailableText('INVALID');
    expect(msg).toMatch(/caracteres/i);
    expect(msg).toMatch(/letra/i);
    expect(msg).not.toMatch(FORBIDDEN);
  });

  it('the submit refusal codes for an unavailable handle are all neutral', () => {
    for (const code of ['HANDLE_RESERVED', 'HANDLE_OWNED_BY_BUSINESS', 'HANDLE_TAKEN']) {
      const msg = REFUSAL_TEXT[code];
      expect(msg).toMatch(/não está disponível/i);
      expect(msg).not.toMatch(FORBIDDEN);
    }
  });
});
