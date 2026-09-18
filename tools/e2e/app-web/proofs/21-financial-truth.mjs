#!/usr/bin/env node
/**
 * Proof 21 — financial truth (suite S09).
 *
 * The ledger is the single financial truth (CLAUDE.md §9.1), and every other
 * suite's PASS is worth exactly as much as this one's. So this asserts the
 * double-entry invariants directly, against the Sandbox book, read-only:
 *
 *   every posting balances            debits equal credits, posting by posting
 *   no single-leg posting             money never moved without a counterparty
 *   no posting without entries        and no entry without its posting
 *   no entry on an unknown account    an orphan leg is an unattributable movement
 *   the book sums to zero             the whole Sandbox, not a sample
 *
 * Read-only by construction: it counts, it never writes. Manufacturing a PASS
 * by touching the ledger would be the one thing this proof exists to detect.
 *
 *   node proofs/21-financial-truth.mjs
 */
import { integrity } from '../lib/operator-read.mjs';
import { GateReport } from '../lib/report.mjs';
import { assuranceDir } from '../../lib/assurance-output.mjs';

const R = new GateReport('21-financial-truth');

function main() {
  const i = integrity();

  R.note(`LEDGER_BOOK_SUM_MINOR=${i.bookSum}`, 'the whole Sandbox book, in minor units');

  R.mark('LEDGER_EVERY_POSTING_BALANCES', i.unbalancedPostings === 0,
    `${i.unbalancedPostings} posting(s) where debits do not equal credits`);

  R.mark('LEDGER_NO_SINGLE_LEG_POSTING', i.singleLegPostings === 0,
    `${i.singleLegPostings} posting(s) with fewer than two entries`);

  R.mark('LEDGER_NO_POSTING_WITHOUT_ENTRIES', i.postingsWithoutEntries === 0,
    `${i.postingsWithoutEntries} posting(s) carry no entry`);

  R.mark('LEDGER_NO_ENTRY_WITHOUT_POSTING', i.entriesWithoutPostings === 0,
    `${i.entriesWithoutPostings} entr(ies) reference a posting that does not exist`);

  R.mark('LEDGER_NO_ORPHAN_ACCOUNT_ENTRY', i.entriesOrphanAccount === 0,
    `${i.entriesOrphanAccount} entr(ies) reference an unknown account`);

  R.mark('LEDGER_BOOK_BALANCED', i.bookBalanced,
    `book sums to ${i.bookSum} (0 required)`);

  R.mark('LEDGER_NO_UNBACKED_LIABILITY', i.noUnbackedLiability,
    'every liability movement is matched by its counterparty');

  R.mark('LEDGER_NO_DUPLICATE_EFFECT', i.duplicateEffects === 0,
    `${i.duplicateEffects} structural anomal(ies) of the shape a duplicate effect takes`);

  const out = R.write(assuranceDir('app-web'));
  console.log(`\nPROOF_21_FINANCIAL_TRUTH=${R.ok ? 'PASS' : 'FAIL'} (${R.passed} pass / ${R.failed} fail)`);
  console.log(`evidence: ${out}`);
  process.exit(R.ok ? 0 : 1);
}

main();
