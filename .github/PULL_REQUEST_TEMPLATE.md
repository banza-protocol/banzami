## Summary

<!-- What does this PR do and why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactoring (no functional change)
- [ ] Documentation
- [ ] Infrastructure / deployment

## Protocol compliance check

- [ ] This PR does NOT change any protocol rule (if it does, an ADR must be opened in github.com/banza-protocol/banza first)
- [ ] Financial invariants are preserved (INV-LEDGER-001, INV-STL-001, INV-WALLET-001, etc.)
- [ ] No direct HTTP integrations added to examples or documentation (all examples use official SDKs)

## Checklist

- [ ] Tests pass locally (`make test` or `cargo test && go test ./...`)
- [ ] Documentation updated if public-facing behaviour changed
- [ ] Commit messages follow `type(scope): description` convention
- [ ] Database migrations are reversible (if applicable)
- [ ] Staging tested before production deployment (for infra changes)

## Testing notes

<!-- How was this tested? Financial edge cases covered? -->
