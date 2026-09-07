# Audits

What was found, what the evidence was, and what it cost — kept because the
reasoning is worth being able to re-check, including where it turned out to be
wrong.

An audit here is a snapshot with a date. It is not a specification and it does
not carry authority: where an audit and the code disagree, the code is what
runs, and the audit is either stale or was mistaken. Both happen, and neither is
quietly deleted.

| date | audit | verdict |
| --- | --- | --- |
| 2026-06-19 | [Global readiness](2026-06-19-global-readiness-audit.md) | — |
| 2026-09-07 | [Indirect pricing authority](2026-09-07-pricing-indirect-authority.md) | one live hole found and fixed; payout path cleared of caller influence |
| 2026-09-07 | [Where operator fees are charged](2026-09-07-where-operator-fees-are-charged.md) | **contains a corrected conclusion** — the measurements held, the reasoning did not |
| 2026-09-07 | [Pricing model re-audit](2026-09-07-pricing-model-re-audit.md) | NEEDS MODIFICATION — the model cannot say which operation a rate is for |

The second entry is deliberately labelled. It was filed as a defect ("the priced
path is not the payment path") on the reasoning that a payment reaching a
merchant without an operator fee must be a gap. The measurements were right and
the conclusion was wrong: the transfer primitive is neutral on purpose, because
it also carries P2P, and the fee belongs one step later. Keeping the wrong
conclusion visible is more useful than a clean file — the mistake is a plausible
one to repeat.
