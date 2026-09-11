import { describe, expect, it } from 'vitest';
import { NOT_A_REFERENCE_PATH, PROOF_REF_ALPHABET, isProofRef, parseProofInput, proofPagePath } from './proof-ref';

const C = 'BZM-7K2M-9QXR-4TWZ-H3YJ-QY5R-BYN0';
const L = 'BZM-5EED-0A11';

// Every other spelling of a real reference — none may be accepted as it.
function aliases(c: string): Record<string, string> {
  const head = c.slice(0, -1);
  const lastLetter = [...c].reduce((at, ch, i) => (i > 3 && /[A-Z]/.test(ch) ? i : at), -1);
  return {
    'O for 0 (the reproduced defect)': head + 'O',
    'I': head + 'I', 'L': head + 'L', 'U': head + 'U',
    'Greek omicron': head + '\u039F', 'Cyrillic O': head + '\u041E',
    'fullwidth 0': head + '\uFF10', 'fullwidth O': head + '\uFF2F', 'math bold 0': head + '\u{1D7CE}',
    'lowercase': c.toLowerCase(), 'Bzm': 'Bzm' + c.slice(3),
    'one lowercase letter': c.slice(0, lastLetter) + c[lastLetter].toLowerCase() + c.slice(lastLetter + 1),
    'no hyphens': c.replace(/-/g, ''), 'missing hyphen': c.replace('-', ''), 'extra hyphen': c + '-',
    'underscore': c.replace(/-/g, '_'), 'spaces for hyphens': c.replace(/-/g, ' '),
    'en dash': c.replace(/-/g, '\u2013'), 'em dash': c.replace(/-/g, '\u2014'),
    'non-breaking hyphen': c.replace(/-/g, '\u2011'), 'minus sign': c.replace(/-/g, '\u2212'),
    'fullwidth hyphen': c.replace(/-/g, '\uFF0D'),
    'leading space': ' ' + c, 'trailing space': c + ' ', 'tab': c + '\t', 'newline': c + '\n',
    'NBSP': c + '\u00A0', 'zero-width space': c + '\u200B', 'ZWNJ': c + '\u200C', 'ZWJ': c + '\u200D',
    'BOM': '\uFEFF' + c, 'inner zero-width space': c.slice(0, 8) + '\u200B' + c.slice(8),
    'encoded O': head + '%4F', 'encoded 0': head + '%30', 'double-encoded 0': head + '%2530',
    'missing prefix': c.slice(4), 'duplicate prefix': 'BZM-' + c, 'suffix': c + 'X',
    'query': c + '?x=1', 'fragment': c + '#x',
    'in copied text': `Referência do comprovativo: ${c}`,
    'link with O': `https://banzami.com/r/${head}O`,
    'link lowercase': `https://banzami.com/r/${c.toLowerCase()}`,
    'link encoded': `https://banzami.com/r/${head}%30`,
    'link with query': `https://banzami.com/r/${c}?utm=x`,
    'link trailing slash': `https://banzami.com/r/${c}/`,
    'link on another host': `https://banzami.com.evil.example/r/${c}`,
    'link over http': `http://banzami.com/r/${c}`,
  };
}

describe('parseProofInput: exact references only', () => {
  it('accepts the canonical SECURE_V1 reference exactly', () => {
    expect(parseProofInput(C)).toEqual({ ok: true, ref: C });
  });

  it('accepts a canonical LEGACY_V0 reference exactly', () => {
    expect(parseProofInput(L)).toEqual({ ok: true, ref: L });
  });

  it('takes the reference from the canonical link, unchanged', () => {
    expect(parseProofInput(`https://banzami.com/r/${C}`)).toEqual({ ok: true, ref: C });
    expect(parseProofInput(`banzami.com/r/${C}`)).toEqual({ ok: true, ref: C });
  });

  for (const [name, input] of Object.entries({ ...aliases(C), ...Object.fromEntries(Object.entries(aliases(L)).map(([k, v]) => [`legacy ${k}`, v])) })) {
    it(`refuses ${name}`, () => {
      expect(parseProofInput(input).ok).toBe(false);
    });
  }

  it('says why when the reason is invisible to the reader', () => {
    expect(parseProofInput(C + ' ')).toEqual({ ok: false, reason: 'whitespace' });
    expect(parseProofInput(C + '\u200B')).toEqual({ ok: false, reason: 'whitespace' });
    expect(parseProofInput(C.slice(0, -1) + 'O')).toEqual({ ok: false, reason: 'format' });
    expect(parseProofInput('')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('isProofRef: the operator grammar', () => {
  it('accepts at every symbol position exactly the alphabet the generator emits', () => {
    const accepted: string[] = [];
    for (let cp = 0; cp <= 0xffff; cp++) {
      const ch = String.fromCodePoint(cp);
      const ref = C.slice(0, -1) + ch;
      if (isProofRef(ref)) accepted.push(ch);
    }
    expect(accepted.join('')).toBe(PROOF_REF_ALPHABET);
  });

  it('is exact: no case folding, no trimming', () => {
    expect(isProofRef(C)).toBe(true);
    expect(isProofRef(C.toLowerCase())).toBe(false);
    expect(isProofRef(` ${C}`)).toBe(false);
  });
});

describe('proofPagePath: one public URL per proof', () => {
  it('keeps the canonical raw path', () => {
    expect(proofPagePath(`/r/${C}`)).toBe(`/r/${C}`);
    expect(proofPagePath(`/r/${L}`)).toBe(`/r/${L}`);
  });

  it('is not the proof page elsewhere', () => {
    expect(proofPagePath('/verificar')).toBeNull();
    expect(proofPagePath('/rr/x')).toBeNull();
  });

  for (const raw of [
    `/r/${C.slice(0, -1)}%30`, `/r/${C.replace(/-/g, '%2D')}`, `/r/%42${C.slice(1)}`, `/r/${C}/`,
    `/r/${C.toLowerCase()}`, `/r/${C.slice(0, -1)}O`, `/r/${C}%20`, `/r/${L.slice(0, -1)}%32`, '/r/', '/r/_',
  ]) {
    it(`renders ${raw.replace(C, 'REF')} as not a reference`, () => {
      expect(proofPagePath(raw)).toBe(NOT_A_REFERENCE_PATH);
    });
  }
});
