/**
 * A BZM- value is a promise: paste it into banzami.com/r/ and it resolves.
 *
 * Four separate places once minted that shape from an object id with no proof
 * behind it — two receipt generators, an operator receipt source, and two
 * payment-list display fields. Each looked locally reasonable. Together they
 * meant Banzami handed people references that answered "does not exist or may
 * have been forged", which is how BZM-F993-… reached a user.
 *
 * They were removed one at a time, and the audit that found the last of them was
 * a grep. This is that grep, kept.
 */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

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
    //
    // Since the canonical receipt (docs/api/receipt-semantics.md) the operator
    // renders the gateway's receipt and asks for it with issue:false: an existing
    // proof is read, none is minted, and without one the receipt carries no
    // reference to verify.
    const src = readFileSync(join(REPO, 'services/admin-api/internal/service/receipts.go'), 'utf8');
    const asks = src.match(/"issue":\s*(true|false)/g) || [];
    assert.ok(asks.length >= 2 && asks.every((a) => a.endsWith('false')),
      'admin receipt source must ask the gateway for both receipt kinds with issue:false');
    assert.ok(
      !/func receiptReference\(/.test(src),
      'admin receipt source has reintroduced a derived reference',
    );
    const sem = readFileSync(join(REPO, 'services/api-gateway/internal/service/receipt_semantics.go'), 'utf8');
    const body = sem.slice(sem.indexOf('func (s *ReceiptSemantics) receipt('));
    const fn = body.slice(0, body.indexOf('\n}\n'));
    const ifIssueEnds = fn.indexOf('\n\t}\n');
    const calls = [...fn.matchAll(/s\.proofs\.Ensure\(/g)].map((m) => m.index);
    assert.ok(fn.includes('\tif issue {') && calls.length > 0 && calls.every((i) => i < ifIssueEnds),
      'the gateway may issue a proof only inside `if issue { … }`');
    // And an absent proof produces no verification link on the document.
    const doc = readFileSync(join(REPO, 'services/common/documents/receipt_semantics.go'), 'utf8');
    assert.ok(/if strings\.TrimSpace\(r\.ProofReference\) != "" \{\s*verify = /.test(doc),
      'a receipt without a proof must carry no verification reference');
  });

});
