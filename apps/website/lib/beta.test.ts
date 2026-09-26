import { describe, it, expect } from 'vitest';
import { splitFullName } from './beta';

// The full-name rule: at least a given name and a family name, accent/hyphen/
// apostrophe-friendly, no anglo-centric regex.
describe('splitFullName', () => {
  it('rejects a single word', () => {
    expect(splitFullName('Fidel')).toBeNull();
    expect(splitFullName('   ')).toBeNull();
    expect(splitFullName('')).toBeNull();
  });

  it('accepts two or more segments and splits first / last', () => {
    expect(splitFullName('Fidel Monteiro')).toEqual({ first: 'Fidel', last: 'Monteiro' });
    expect(splitFullName('João da Silva')).toEqual({ first: 'João', last: 'da Silva' });
  });

  it('accepts hyphenated and apostrophe names', () => {
    expect(splitFullName('Ana-Maria José')).toEqual({ first: 'Ana-Maria', last: 'José' });
    expect(splitFullName("O'Connor Silva")).toEqual({ first: "O'Connor", last: 'Silva' });
  });

  it('trims and collapses whitespace', () => {
    expect(splitFullName('  Fidel   Monteiro  ')).toEqual({ first: 'Fidel', last: 'Monteiro' });
  });
});
