# contracts/sdk-certification/

Canonical target location for SDK compliance certification vectors.

## Current state

The active certification test suite lives at `/sdk-certification/` in the repository root. That is the authoritative source until this migration is complete.

**Do not add new vectors here yet.** Add them to `/sdk-certification/` and update this note when migration is performed.

## Migration plan

1. Copy all content from `/sdk-certification/` here
2. Update all import paths in test runners
3. Update `tools/check-repository-layout.mjs` to accept this new location
4. Remove `/sdk-certification/` from the accepted top-level directories list
5. Create an ADR if needed
