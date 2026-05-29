# @banzami/docs

Public documentation website for the Banza platform.

> **Per ADR-015:** all content on this site derives from `docs/BANZAMI_REFERENCE.md`. The markdown file is the single source of truth. This app is the visual rendering layer only.

---

## Architecture

```text
docs/BANZAMI_REFERENCE.md   ← canonical source of truth
        ↓
lib/reference.ts             ← content parsing engine (build-time only)
        ↓
app/[section]/page.tsx       ← statically generated section pages
app/reference/page.tsx       ← full document view
app/page.tsx                 ← homepage (section grid)
```

## Content pipeline

`lib/reference.ts` reads `BANZAMI_REFERENCE.md` at build time and returns:

- **Document metadata**: Version, Date, Author, Status
- **Sections**: one per H2 heading (`## N. Title`) — with slug, anchor, and content
- **Subsections**: one per H3 heading within each section

The build validates that the source document is well-formed and section numbers are sequential. A malformed source document fails the build.

## Routes

| Route | Content |
|-------|---------|
| `/` | Homepage — section card grid |
| `/reference` | Full document rendered inline |
| `/[section-slug]` | Individual section page |

Section slugs are derived at build time from section titles. No manual route maintenance.

## Development

```bash
npm install
npm run dev      # http://localhost:3005
npm run build    # production build
npm run type-check
```

## The rule

**Nothing may appear on this website without first existing in `docs/BANZAMI_REFERENCE.md`.**

Update the markdown. Rebuild. The website reflects the truth.

See [ADR-015](../../docs/adr/ADR-015-markdown-first-content-architecture.md) for full rationale.
