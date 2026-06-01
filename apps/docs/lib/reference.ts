/**
 * Content parsing engine — BANZA_REFERENCE.md as single source of truth.
 *
 * Reads docs/BANZA_REFERENCE.md at build time and returns a structured
 * representation of all sections and subsections. The website derives every
 * piece of public content from this output.
 *
 * Per ADR-015: the markdown file is canonical. This file only reads it.
 */
import fs from 'fs'
import path from 'path'
import type { Reference, ReferenceSection, ReferenceSubsection, ReferenceMeta } from './types'

// Resolution order (ADR-015 — BANZA_REFERENCE.md is canonical):
//   1. data/BANZA_REFERENCE.md          — generated artifact, local or synced by deploy.sh
//   2. ../../../banza/BANZA_REFERENCE.md — sibling repo path (local development)
//   3. ../../docs/BANZA_REFERENCE.md     — VM legacy path (/srv/banzami/src/docs/) synced by deploy.sh
function resolveReferencePath(): string {
  const candidates = [
    path.join(process.cwd(), 'data/BANZA_REFERENCE.md'),
    path.join(process.cwd(), '../../../banza/BANZA_REFERENCE.md'),
    path.join(process.cwd(), '../../docs/BANZA_REFERENCE.md'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(`BANZA_REFERENCE.md not found. Searched:\n${candidates.join('\n')}`)
}

const REFERENCE_PATH = resolveReferencePath()

// ----- Public API ------------------------------------------------------------

export function getReference(): Reference {
  const raw = fs.readFileSync(REFERENCE_PATH, 'utf-8')
  validateRaw(raw)
  return parse(raw)
}

export function getSection(slug: string): ReferenceSection | undefined {
  return getReference().sections.find((s) => s.slug === slug)
}

export function getSectionByNumber(n: number): ReferenceSection | undefined {
  return getReference().sections.find((s) => s.number === n)
}

export function getAllSectionSlugs(): string[] {
  return getReference().sections.map((s) => s.slug)
}

// ----- Parser ----------------------------------------------------------------

function parse(raw: string): Reference {
  return {
    meta: parseMeta(raw),
    tagline: parseTagline(raw),
    sections: parseSections(raw),
  }
}

function parseMeta(raw: string): ReferenceMeta {
  const field = (label: string) => {
    const m = raw.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)\\s*$`, 'm'))
    return m?.[1]?.trim() ?? ''
  }
  return {
    version: field('Version'),
    date: field('Date'),
    author: field('Author') || field('Authority'),
    status: field('Status'),
  }
}

function parseTagline(raw: string): string {
  const m = raw.match(/^>\s+\*\*(.+?)\*\*\s*$/m)
  return m?.[1] ?? "Angola's QR-native instant payment network."
}

function parseSections(raw: string): ReferenceSection[] {
  const h2Pattern = /^## (\d+)\. (.+)$/gm
  const matches: Array<{ index: number; number: number; title: string }> = []

  let m: RegExpExecArray | null
  while ((m = h2Pattern.exec(raw)) !== null) {
    matches.push({
      index: m.index,
      number: parseInt(m[1], 10),
      title: m[2].trim(),
    })
  }

  return matches.map((match, i) => {
    const start = match.index
    const end = matches[i + 1]?.index ?? raw.length
    const content = raw.slice(start, end).trim()
    const slug = toSlug(match.title)
    const anchor = `${match.number}-${slug}`

    return {
      id: `section-${match.number}`,
      number: match.number,
      title: match.title,
      slug,
      anchor,
      content,
      subsections: parseSubsections(content),
    }
  })
}

function parseSubsections(sectionContent: string): ReferenceSubsection[] {
  const h3Pattern = /^### (.+)$/gm
  const matches: Array<{ index: number; title: string }> = []

  let m: RegExpExecArray | null
  while ((m = h3Pattern.exec(sectionContent)) !== null) {
    matches.push({ index: m.index, title: m[1].trim() })
  }

  return matches.map((match, i) => {
    const start = match.index
    const end = matches[i + 1]?.index ?? sectionContent.length
    const content = sectionContent.slice(start, end).trim()
    const slug = toSlug(match.title)

    return {
      id: `sub-${slug}`,
      title: match.title,
      slug,
      anchor: slug,
      content,
    }
  })
}

// ----- Validation ------------------------------------------------------------

function validateRaw(raw: string): void {
  const requiredFields: string[] = ['Version', 'Date', 'Status']
  for (const field of requiredFields) {
    if (!raw.includes(`**${field}:**`)) {
      throw new Error(`BANZA_REFERENCE.md is missing required metadata field: ${field}`)
    }
  }
  // Accept either Author or Authority (protocol reference uses Authority)
  if (!raw.includes('**Author:**') && !raw.includes('**Authority:**')) {
    throw new Error('BANZA_REFERENCE.md is missing required metadata field: Author or Authority')
  }

  const sectionNumbers: number[] = []
  const h2Pattern = /^## (\d+)\. /gm
  let m: RegExpExecArray | null
  while ((m = h2Pattern.exec(raw)) !== null) {
    sectionNumbers.push(parseInt(m[1], 10))
  }

  if (sectionNumbers.length === 0) {
    throw new Error('BANZA_REFERENCE.md contains no H2 sections')
  }

  for (let i = 0; i < sectionNumbers.length; i++) {
    if (sectionNumbers[i] !== i + 1) {
      throw new Error(
        `BANZA_REFERENCE.md section numbering is not sequential at index ${i}: expected ${i + 1}, got ${sectionNumbers[i]}`
      )
    }
  }
}

// ----- Utilities -------------------------------------------------------------

export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip combining diacritical marks (é→e, ã→a, ç→c)
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
