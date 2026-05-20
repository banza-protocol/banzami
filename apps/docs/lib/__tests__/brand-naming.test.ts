import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import path from 'path'

const REPO_ROOT = path.resolve(__dirname, '../../../../')

function grep(pattern: string, globs: string[], excludes: string[] = []): string[] {
  const includeArgs = globs.map(g => `--include="${g}"`).join(' ')
  const excludeArgs = excludes.map(e => `--exclude="${e}"`).join(' ')
  const excludeDirArgs = [
    '--exclude-dir=node_modules',
    '--exclude-dir=.next',
    '--exclude-dir=.git',
    '--exclude-dir=dist',
    '--exclude-dir=build',
  ].join(' ')
  try {
    const result = execSync(
      `grep -rn "${pattern}" ${includeArgs} ${excludeArgs} ${excludeDirArgs} .`,
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    return result.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

// ─── Forbidden product names using "Banzami" prefix ───────────────────────────
// Per CLAUDE.md §16: Banza = product. "Banzami Business", "Banzami Pay",
// "Banzami Checkout", "Banzami QR", "Banzami SDK", "Banzami Wallet" are wrong.

describe('Brand naming — forbidden "Banzami" product names', () => {
  const SOURCE_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.dart']
  const DOC_GLOBS   = ['*.md']

  // ADRs, CLAUDE.md, and forbidden-list sections are allowed to reference
  // these names as negative examples. Memory files are excluded too.
  const ALLOW_FILES = [
    'CLAUDE.md',
    'ADR-016*',
    'ADR-013*',
    'ADR-014*',
    'ADR-015*',
    'MEMORY.md',
    'brand-naming.test.ts',
  ]

  it('no source file contains "Banzami Business"', () => {
    const hits = grep('Banzami Business', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "Banzami Business" in source:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no source file contains "Banzami Pay"', () => {
    const hits = grep('Banzami Pay', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "Banzami Pay" in source:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no source file contains "Banzami Checkout"', () => {
    const hits = grep('Banzami Checkout', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "Banzami Checkout" in source:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no source file contains "Banzami app"', () => {
    const hits = grep('Banzami app', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "Banzami app" in source:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no doc contains "Banzami Business" in product context', () => {
    const raw = grep('Banzami Business', DOC_GLOBS, ALLOW_FILES)
    // Permitted: ADR-016 comparisons, positioning forbidden-list tables,
    // and strategy/positioning "What Banzami Is NOT" sections.
    const hits = raw.filter(line =>
      !line.includes('ADR-016') &&
      !line.includes('Wrong') &&
      !line.includes('WRONG') &&
      !line.includes('forbidden') &&
      !line.includes('prohibited') &&
      !line.includes('Never') &&
      !line.match(/docs\/adr\//)
    )
    expect(hits, `Found "Banzami Business" in docs:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no doc contains "Banzami app"', () => {
    const raw = grep('Banzami app', DOC_GLOBS, ALLOW_FILES)
    const hits = raw.filter(line => !line.match(/docs\/adr\//))
    expect(hits, `Found "Banzami app" in docs:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no doc contains "Banzami QR" in product context', () => {
    const raw = grep('Banzami QR', DOC_GLOBS, ALLOW_FILES)
    const hits = raw.filter(line => !line.match(/docs\/adr\//))
    expect(hits, `Found "Banzami QR" in docs:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no doc contains "Banzami Pay" as product name', () => {
    const raw = grep('Banzami Pay', DOC_GLOBS, ALLOW_FILES)
    const hits = raw.filter(line => !line.match(/docs\/adr\//))
    expect(hits, `Found "Banzami Pay" in docs:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no doc contains "Banzami SDK" (should be "Banza SDK")', () => {
    const raw = grep('Banzami SDK', DOC_GLOBS, ALLOW_FILES)
    const hits = raw.filter(line =>
      !line.match(/docs\/adr\//) &&
      !line.includes('WRONG') &&
      !line.includes('forbidden') &&
      !line.includes('prohibited')
    )
    expect(hits, `Found "Banzami SDK" in docs:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no doc contains "Banzami Checkout"', () => {
    const raw = grep('Banzami Checkout', DOC_GLOBS, ALLOW_FILES)
    const hits = raw.filter(line => !line.match(/docs\/adr\//))
    expect(hits, `Found "Banzami Checkout" in docs:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no doc contains "Banzami network" (should be "Banza network")', () => {
    const raw = grep('Banzami network', DOC_GLOBS, ALLOW_FILES)
    const hits = raw.filter(line => !line.match(/docs\/adr\//))
    expect(hits, `Found "Banzami network" in docs:\n${hits.join('\n')}`).toHaveLength(0)
  })
})

// ─── Forbidden gender agreement (§16.7 — Portuguese) ─────────────────────────
// "a Banza", "a Banzami", "da Banza", "da Banzami", "pela Banzami" are wrong.

describe('Brand naming — forbidden gender agreements (Portuguese)', () => {
  const ALL_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.dart', '*.md']
  const ALLOW_FILES = [
    'CLAUDE.md',
    'ADR-016*',
    'brand-naming.test.ts',
    'MEMORY.md',
  ]

  it('no file contains "pela Banzami"', () => {
    const hits = grep('pela Banzami', ALL_GLOBS, ALLOW_FILES)
    expect(hits, `Found "pela Banzami":\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no file contains "da Banzami" (wrong feminine article)', () => {
    const hits = grep('da Banzami', ALL_GLOBS, ALLOW_FILES)
    expect(hits, `Found "da Banzami":\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no file contains "na Banzami" (wrong feminine article)', () => {
    const hits = grep('na Banzami', ALL_GLOBS, ALLOW_FILES)
    expect(hits, `Found "na Banzami":\n${hits.join('\n')}`).toHaveLength(0)
  })
})

// ─── Forbidden SDK naming (§16.5 — SDK class and package names) ───────────────
// @banza/sdk, BanzaClient, BanzaPay, BanzaColors are the correct names.

describe('Brand naming — forbidden SDK class and package names', () => {
  const SOURCE_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.dart', '*.py', '*.md']
  const ALLOW_FILES = ['CLAUDE.md', 'ADR-016*', 'brand-naming.test.ts', 'MEMORY.md']

  it('no file uses "@banzami/sdk" (should be "@banza/sdk")', () => {
    const hits = grep('@banzami/sdk', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "@banzami/sdk":\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no file uses "BanzamiClient" class name (should be "BanzaClient")', () => {
    const hits = grep('BanzamiClient', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "BanzamiClient":\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no file uses "BanzamiPay" class name (should be "BanzaPay")', () => {
    const hits = grep('BanzamiPay', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "BanzamiPay":\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no file uses "BanzamiColors" class name (should be "BanzaColors")', () => {
    const hits = grep('BanzamiColors', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "BanzamiColors":\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no file uses "from banzami import" (should be "from banza import")', () => {
    const hits = grep('from banzami import', SOURCE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "from banzami import":\n${hits.join('\n')}`).toHaveLength(0)
  })
})

// ─── Forbidden webhook header naming (§16.5 — Banza-Signature) ───────────────
// Canonical: Banza-Signature. Forbidden: Banzami-Signature, X-Banzami-Signature.

describe('Brand naming — webhook header canonical form', () => {
  const ALL_GLOBS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.md', '*.go', '*.rs']
  const ALLOW_FILES = ['CLAUDE.md', 'ADR-016*', 'brand-naming.test.ts', 'MEMORY.md']

  it('no file contains "Banzami-Signature" (should be "Banza-Signature")', () => {
    const hits = grep('Banzami-Signature', ALL_GLOBS, ALLOW_FILES)
    expect(hits, `Found "Banzami-Signature":\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no file contains "X-Banzami-Signature"', () => {
    const hits = grep('X-Banzami-Signature', ALL_GLOBS, ALLOW_FILES)
    expect(hits, `Found "X-Banzami-Signature":\n${hits.join('\n')}`).toHaveLength(0)
  })
})

// ─── Forbidden positioning descriptions (§1.5 — CLAUDE.md) ───────────────────
// "pan-African", "Stripe for Africa" must not appear in affirmative context.

describe('Brand naming — forbidden positioning descriptions', () => {
  const SITE_GLOBS = ['*.ts', '*.tsx', '*.jsx']
  const ALLOW_FILES = ['brand-naming.test.ts']

  it('no site source file contains "pan-African" in affirmative context', () => {
    const hits = grep('pan-African', SITE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "pan-African" in site source:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('no site source file contains "Stripe for Africa"', () => {
    const hits = grep('Stripe for Africa', SITE_GLOBS, ALLOW_FILES)
    expect(hits, `Found "Stripe for Africa" in site source:\n${hits.join('\n')}`).toHaveLength(0)
  })
})
