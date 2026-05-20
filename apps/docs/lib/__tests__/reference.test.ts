import { describe, it, expect } from 'vitest'
import { getReference, getSection, getSectionByNumber, getAllSectionSlugs, toSlug } from '@/lib/reference'

// ─── toSlug — pure function ───────────────────────────────────────────────────

describe('toSlug', () => {
  it('lowercases the input', () => {
    expect(toSlug('Hello World')).toBe('hello-world')
  })

  it('replaces spaces with hyphens', () => {
    expect(toSlug('instant payments')).toBe('instant-payments')
  })

  it('strips accented characters (é → e)', () => {
    expect(toSlug('Visão')).toBe('visao')
  })

  it('strips cedilla (ç → c)', () => {
    expect(toSlug('Funcionalidades')).toBe('funcionalidades')
  })

  it('strips tilde-nasal (ã → a, õ → o)', () => {
    expect(toSlug('Integração')).toBe('integracao')
    expect(toSlug('Programação')).toBe('programacao')
  })

  it('handles full Portuguese section titles', () => {
    expect(toSlug('O que é o Banzami?')).toBe('o-que-e-o-banzami')
    expect(toSlug('A Visão')).toBe('a-visao')
    expect(toSlug('Declaração de Visão Final')).toBe('declaracao-de-visao-final')
  })

  it('collapses multiple spaces into a single hyphen', () => {
    expect(toSlug('a  b   c')).toBe('a-b-c')
  })

  it('collapses multiple hyphens into a single hyphen', () => {
    expect(toSlug('a--b---c')).toBe('a-b-c')
  })

  it('trims leading and trailing whitespace', () => {
    expect(toSlug('  wallet native  ')).toBe('wallet-native')
  })

  it('removes non-alphanumeric characters except hyphens', () => {
    expect(toSlug('Banza! @handle #QR')).toBe('banza-handle-qr')
  })

  it('produces a URL-safe string matching [a-z0-9-]+', () => {
    const slug = toSlug('Uma Manhã em Luanda — Pagamentos QR')
    expect(slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('is idempotent on already-slugged strings', () => {
    const slug = toSlug('instant-payments')
    expect(toSlug(slug)).toBe(slug)
  })
})

// ─── getReference — overall structure ────────────────────────────────────────

describe('getReference — overall structure', () => {
  it('returns an object with meta, tagline and sections', () => {
    const ref = getReference()
    expect(ref).toHaveProperty('meta')
    expect(ref).toHaveProperty('tagline')
    expect(ref).toHaveProperty('sections')
  })

  it('returns exactly 20 sections', () => {
    expect(getReference().sections).toHaveLength(20)
  })

  it('sections are numbered sequentially from 1 to 20', () => {
    const numbers = getReference().sections.map((s) => s.number)
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('each section has all required fields', () => {
    for (const s of getReference().sections) {
      expect(s.id).toBeTruthy()
      expect(s.number).toBeGreaterThan(0)
      expect(s.title).toBeTruthy()
      expect(s.slug).toBeTruthy()
      expect(s.anchor).toBeTruthy()
      expect(s.content).toBeTruthy()
      expect(Array.isArray(s.subsections)).toBe(true)
    }
  })

  it('all section slugs are unique', () => {
    const slugs = getReference().sections.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('all section slugs match URL-safe pattern', () => {
    for (const s of getReference().sections) {
      expect(s.slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('all anchors follow the "{number}-{slug}" format', () => {
    for (const s of getReference().sections) {
      expect(s.anchor).toBe(`${s.number}-${s.slug}`)
    }
  })

  it('section ids follow the "section-{number}" format', () => {
    for (const s of getReference().sections) {
      expect(s.id).toBe(`section-${s.number}`)
    }
  })
})

// ─── getReference — metadata (IDT-001: BANZAMI_REFERENCE.md structure) ───────

describe('getReference — document metadata', () => {
  it('meta.version is non-empty', () => {
    expect(getReference().meta.version).toBeTruthy()
  })

  it('meta.date is non-empty', () => {
    expect(getReference().meta.date).toBeTruthy()
  })

  it('meta.author is non-empty', () => {
    expect(getReference().meta.author).toBeTruthy()
  })

  it('meta.status is non-empty', () => {
    expect(getReference().meta.status).toBeTruthy()
  })

  it('meta.status is "Official"', () => {
    expect(getReference().meta.status).toBe('Official')
  })

  it('meta.version is "1.0"', () => {
    expect(getReference().meta.version).toBe('1.0')
  })

  it('tagline is non-empty', () => {
    expect(getReference().tagline.length).toBeGreaterThan(0)
  })
})

// ─── getReference — subsections (DOC-002: rendering subsections) ──────────────

describe('getReference — subsections', () => {
  it('total subsection count across all sections is ≥ 100', () => {
    const total = getReference().sections.reduce((sum, s) => sum + s.subsections.length, 0)
    expect(total).toBeGreaterThanOrEqual(100)
  })

  it('each subsection has id, title, slug, anchor and content', () => {
    for (const s of getReference().sections) {
      for (const sub of s.subsections) {
        expect(sub.id).toBeTruthy()
        expect(sub.title).toBeTruthy()
        expect(sub.slug).toBeTruthy()
        expect(sub.anchor).toBeTruthy()
        expect(sub.content).toBeTruthy()
      }
    }
  })

  it('subsection slugs match URL-safe pattern', () => {
    for (const s of getReference().sections) {
      for (const sub of s.subsections) {
        expect(sub.slug).toMatch(/^[a-z0-9-]+$/)
      }
    }
  })

  it('sections with many H3 headings produce correct subsection count', () => {
    const sections = getReference().sections
    const withSubs = sections.filter((s) => s.subsections.length > 0)
    expect(withSubs.length).toBeGreaterThan(5)
  })
})

// ─── getSection — navigation by slug (DOC-003) ────────────────────────────────

describe('getSection — navigation by slug', () => {
  it('returns the correct section for a known slug', () => {
    const s = getSection('a-visao')
    expect(s).toBeDefined()
    expect(s?.number).toBe(4)
    expect(s?.title).toBe('A Visão')
  })

  it('returns undefined for an unknown slug', () => {
    expect(getSection('nonexistent-slug')).toBeUndefined()
  })

  it('returns the first section when queried by its slug', () => {
    const first = getReference().sections[0]
    const found = getSection(first.slug)
    expect(found?.number).toBe(1)
  })

  it('returns the last section when queried by its slug', () => {
    const sections = getReference().sections
    const last = sections[sections.length - 1]
    const found = getSection(last.slug)
    expect(found?.number).toBe(20)
  })

  it('every slug from getAllSectionSlugs resolves via getSection', () => {
    for (const slug of getAllSectionSlugs()) {
      expect(getSection(slug)).toBeDefined()
    }
  })
})

// ─── getSectionByNumber — navigation by number (DOC-003) ─────────────────────

describe('getSectionByNumber — navigation by number', () => {
  it('returns section 1 correctly', () => {
    const s = getSectionByNumber(1)
    expect(s?.number).toBe(1)
    expect(s?.title).toBe('O que é o Banzami?')
  })

  it('returns section 20 correctly', () => {
    const s = getSectionByNumber(20)
    expect(s?.number).toBe(20)
    expect(s?.title).toBe('Declaração de Visão Final')
  })

  it('returns undefined for section 0', () => {
    expect(getSectionByNumber(0)).toBeUndefined()
  })

  it('returns undefined for section 21 (out of range)', () => {
    expect(getSectionByNumber(21)).toBeUndefined()
  })

  it('is consistent with getSection — same object for same section', () => {
    for (let n = 1; n <= 20; n++) {
      const byNum = getSectionByNumber(n)
      const bySlug = getSection(byNum!.slug)
      expect(byNum?.number).toBe(bySlug?.number)
    }
  })
})

// ─── getAllSectionSlugs (DOC-003 navigation index) ────────────────────────────

describe('getAllSectionSlugs', () => {
  it('returns an array of 20 slugs', () => {
    expect(getAllSectionSlugs()).toHaveLength(20)
  })

  it('all slugs are strings and non-empty', () => {
    for (const slug of getAllSectionSlugs()) {
      expect(typeof slug).toBe('string')
      expect(slug.length).toBeGreaterThan(0)
    }
  })

  it('all slugs are unique', () => {
    const slugs = getAllSectionSlugs()
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('slugs are in section number order (1 → 20)', () => {
    const slugs = getAllSectionSlugs()
    const sections = getReference().sections
    slugs.forEach((slug, i) => {
      expect(slug).toBe(sections[i].slug)
    })
  })
})

// ─── BANZAMI_REFERENCE.md — content integrity (IDT-001) ──────────────────────

describe('BANZAMI_REFERENCE.md — content integrity', () => {
  it('contains the section "O que é o Banzami?" as section 1', () => {
    const s = getSectionByNumber(1)
    expect(s?.title).toBe('O que é o Banzami?')
  })

  it('contains a section about the wallet-native philosophy', () => {
    const sections = getReference().sections
    const found = sections.some(
      (s) => s.title.toLowerCase().includes('wallet') || s.content.toLowerCase().includes('wallet-native'),
    )
    expect(found).toBe(true)
  })

  it('contains a section about QR payments', () => {
    const sections = getReference().sections
    const found = sections.some(
      (s) => s.title.toLowerCase().includes('qr') || s.content.toLowerCase().includes('qr'),
    )
    expect(found).toBe(true)
  })

  it('contains a section about the developer ecosystem (SDKs)', () => {
    const sections = getReference().sections
    const found = sections.some(
      (s) => s.title.toLowerCase().includes('programador') || s.content.toLowerCase().includes('sdk'),
    )
    expect(found).toBe(true)
  })

  it('section content is never empty', () => {
    for (const s of getReference().sections) {
      expect(s.content.trim().length).toBeGreaterThan(0)
    }
  })

  it('section numbering has no gaps (sequential 1–20)', () => {
    const numbers = getReference().sections.map((s) => s.number)
    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(i + 1)
    }
  })
})
