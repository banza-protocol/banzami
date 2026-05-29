# ADR-015: Markdown-First Content Architecture — BANZAMI_REFERENCE.md as Single Source of Truth

**Status:** Accepted  
**Date:** 2026-05-19  
**Author:** Fidel Monteiro — `@fm65`

---

## Context

As the Banza platform matures into national payment infrastructure, its public-facing presence must be:

* **consistent** — every audience sees the same product definition,
* **authoritative** — one document owns the canonical truth,
* **maintainable** — updates happen in one place, propagate everywhere,
* **coherent** — positioning never drifts between website sections.

The alternative — writing content independently for landing pages, docs sites, marketing pages, and investor decks — creates divergence. Different pages will describe Banza differently. Positioning drifts. Engineering credibility erodes. The platform loses its voice.

`docs/BANZAMI_REFERENCE.md` was created as the official flagship reference document, covering all audiences: merchants, developers, consumers, banks, investors, regulators. It has been written as a national payment network manifesto combined with a technical architecture reference.

The question is: how does this document relate to the public website?

---

## Decision

**`docs/BANZAMI_REFERENCE.md` is the single source of truth for the entire public Banza ecosystem.**

The correct content flow is:

```text
BANZAMI_REFERENCE.md
        ↓
   structured parsing
        ↓
   website sections
        ↓
    banzami.org
```

The website is **only the visual presentation layer**. It renders the markdown document elegantly. It does not own content.

### The Publication Rule

Nothing may appear on any public surface — banzami.org, landing pages, docs pages, manifesto pages, ecosystem pages, architecture pages, SDK explanation pages, marketing pages, or investor pages — without first existing inside `docs/BANZAMI_REFERENCE.md`.

### The Update Rule

When a new concept is added to the platform, it is documented in `BANZAMI_REFERENCE.md` first. The website updates automatically when it re-renders from the source.

---

## Technical Implementation

### Content Parsing Engine — `lib/reference.ts`

The `apps/docs` application contains a content parsing engine that:

1. Reads `docs/BANZAMI_REFERENCE.md` at build time via Node.js `fs`
2. Parses H2 sections (`## N. Title`) into structured `ReferenceSection` objects
3. Parses H3 subsections within each section
4. Extracts document metadata (Version, Date, Author)
5. Generates URL slugs for each section

This engine runs at build time only. No client-side file reads. No runtime I/O.

### Section-Based Routing

Each H2 section in `BANZAMI_REFERENCE.md` maps to a route in `apps/docs`:

| Section | Route |
|---------|-------|
| `## 1. What Is Banzami?` | `/what-is-banzami` |
| `## 5. A Morning in Luanda` | `/a-morning-in-luanda` |
| `## 12. Banzami for Developers` | `/banzami-for-developers` |
| `## 14. The Banzami Flywheel` | `/the-banzami-flywheel` |
| (all sections) | `/reference` — full document view |

Routes are generated statically at build time from the parsed section list. No manual route maintenance.

### Custom Rendering Components

The markdown content is rendered with domain-aware React components:

| Component | Purpose |
|-----------|---------|
| `MarkdownSection` | Renders a parsed section's markdown content |
| `ArchitectureDiagram` | Prettifies ASCII architecture and flow diagrams |
| `Callout` | Renders `>` blockquotes as styled callout boxes |
| `SectionNav` | Sidebar navigation from parsed section list |
| `SectionCard` | Section preview cards for the homepage |

The markdown is never manually converted to JSX. The source markdown is always preserved.

### MDX Compatibility

Custom markdown directives can be added as remark/rehype plugins if needed — for animated sections, embedded diagrams, or rich callouts. These plugins operate on the parsed AST before rendering and do not modify `BANZAMI_REFERENCE.md`.

### Build-Time Validation

The build process validates that `BANZAMI_REFERENCE.md` is well-formed:

* all 20 sections are present,
* section numbers are sequential,
* required metadata fields exist (Version, Date, Author).

Build fails if the source document is malformed.

---

## Alternatives Considered

### Alt 1: Content written separately for the website

Write website content independently in `apps/docs/content/*.md` files.

**Rejected.** This is the classic divergence trap. After six months, the website describes a subtly different product than the reference document. Positioning drifts. New engineers read the website and implement features based on the website version, not the engineering truth. The reference document becomes stale.

### Alt 2: CMS-driven content (Sanity, Contentful, etc.)

Store content in a headless CMS. The website pulls from the CMS API.

**Rejected.** Introduces an external dependency for what is a first-party document. A CMS creates a second place where content must be maintained. It separates content from the engineering discipline that keeps it accurate. It also requires CMS access for every content update, separating content ownership from the engineering team.

### Alt 3: CMS mirrors the markdown

Parse `BANZAMI_REFERENCE.md` into a CMS and publish from there.

**Rejected.** Adds complexity without benefit. The markdown file is already structured, versioned in git, and reviewable via pull request. A CMS adds a sync step that can drift.

### Alt 4: Dual source — markdown for engineering docs, CMS for marketing

Separate the technical reference from the marketing site.

**Rejected.** This is the root cause of inconsistent product positioning. The reference document deliberately serves all audiences. Its sections for consumers, merchants, investors, and developers must stay coherent with each other. Splitting them into separate systems guarantees drift.

---

## Consequences

### Positive

* **Single update point.** Any change to how Banza is described, positioned, or explained happens in one file. All surfaces update on next build.
* **Git-reviewed content.** All content changes are pull requests. Every change is auditable, reviewable, and traceable.
* **Positioning consistency.** The product is described the same way everywhere.
* **Engineering discipline.** Content is subject to the same engineering rigor as code.
* **Offline capability.** The full product definition exists as a file in the repository, readable without internet or CMS access.
* **No vendor dependency.** Content is not locked in a third-party CMS.

### Trade-offs

* **Build required for content updates.** A change to `BANZAMI_REFERENCE.md` requires a rebuild of `apps/docs` to be reflected on the website. Mitigation: CI/CD pipeline triggers a rebuild on any change to `docs/BANZAMI_REFERENCE.md`.
* **Non-technical editors must edit markdown.** Content authors need to understand markdown and use git. Mitigation: the document has clear section boundaries; a trained contributor can edit a section without understanding the full system.
* **Website design is constrained by markdown structure.** Highly custom landing page layouts may be difficult to derive from a flat markdown file. Mitigation: the rendering pipeline allows section-specific custom layouts via section-number routing logic in the renderer.

---

## Enforcement

Every engineer working on `apps/docs` must:

1. Never write website content that does not exist in `docs/BANZAMI_REFERENCE.md`.
2. Never update website content without updating `docs/BANZAMI_REFERENCE.md` first.
3. Never add a new section to the website without adding the corresponding H2 section to `BANZAMI_REFERENCE.md`.
4. Run the build validation step before merging any content PR.

---

## References

* [CLAUDE.md §15 — Documentation Source of Truth](../../CLAUDE.md)
* [docs/BANZAMI_REFERENCE.md](../BANZAMI_REFERENCE.md)
* [ADR-012 — SDK-First Ecosystem](ADR-012-sdk-first-ecosystem.md)
* [ADR-014 — Angola-First National Mission](ADR-014-angola-national-mission.md)
