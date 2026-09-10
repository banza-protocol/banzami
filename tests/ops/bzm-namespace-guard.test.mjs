/**
 * A BZM- value is a promise: paste it into banzami.com/r/ and it resolves.
 *
 * Four separate places once minted that shape from an object id with no proof
 * behind it — two receipt generators, an operator receipt source, and two
 * payment-list display fields. Each looked locally reasonable. Together they
 * meant Banzami handed people references that answered "does not exist or may
 * have been forged", which is how BZM-F993-38E2 reached a user.
 *
 * They were removed one at a time, and the audit that found the last of them was
 * a grep. This is that grep, kept.
 */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '../..');

/** ripgrep-free: git grep is present wherever the repo is. */
function gitGrep(pattern, paths) {
  try {
    return execFileSync('git', ['grep', '-n', '-E', pattern, '--', ...paths], {
      cwd: REPO, encoding: 'utf8',
    }).trim().split('\n').filter(Boolean);
  } catch (e) {
    // git grep exits 1 with no matches, which is the passing case here.
    if (e.status === 1) return [];
    throw e;
  }
}

const PRODUCTION = [
  'services/*/internal/**/*.go',
  'services/*/cmd/**/*.go',
  'core/**/*.rs',
  'apps/**/*.ts',
  'apps/**/*.tsx',
  'sdk/**/*.ts',
];

const isTestFile = (line) =>
  /_test\.go:|\.test\.[tj]sx?:|\/tests\/|\/test\//.test(line) ||
  /_tests\.rs:|\/fixtures\//.test(line);

describe('BZM- namespace', () => {
  it('only the SECURE_V1 generator constructs a BZM- reference', () => {
    const hits = gitGrep('"BZM-"', PRODUCTION).filter((l) => !isTestFile(l));
    // The one legitimate producer. Anything else is a value shaped like proof
    // authority without a proof behind it.
    const allowed = /services\/api-gateway\/internal\/service\/proof\.go/;
    const rogue = hits.filter((l) => !allowed.test(l));
    assert.deepEqual(
      rogue, [],
      'a BZM- value is being constructed outside the SECURE_V1 generator — it must ' +
      'denote a real, resolvable proof or not carry the prefix at all',
    );
  });

  it('no derived-reference helper reappears', () => {
    // Each of these took an object id and returned BZM-XXXX-XXXX. They are the
    // exact shape of the defect: deterministic, plausible, and unbacked.
    const hits = gitGrep(
      'func (reference|receiptReference|adminWalletReference|legacyDisplayReference)\\(',
      PRODUCTION,
    ).filter((l) => !isTestFile(l));
    assert.deepEqual(hits, [], 'a derived proof-reference helper is back');
  });

  it('the operator receipt source reads an existing proof, never invents one', () => {
    // admin-api was the last site found. It derived a reference and printed it as
    // a verification URL while never touching the proof service, so an
    // operator-issued document advertised a page nothing had ever backed. It must
    // look one up — and must NOT mint one, because an operator reading a document
    // is not the event that establishes public proof capability.
    const src = execFileSync('git', ['show', 'HEAD:services/admin-api/internal/service/receipts.go'],
      { cwd: REPO, encoding: 'utf8' });
    assert.ok(
      src.includes('existingProofReference'),
      'admin receipt source no longer looks up an existing proof',
    );
    assert.ok(
      !/func receiptReference\(/.test(src),
      'admin receipt source has reintroduced a derived reference',
    );
    // And an absent proof must produce no verification block at all.
    assert.ok(
      src.includes('verificationRefOrEmpty'),
      'admin receipt source no longer guards the absent-proof case',
    );
  });

});
