#!/usr/bin/env node
/**
 * Editorial quality of the public documentation, in both languages.
 *
 * A technically correct sentence can still read as amateur, translated or
 * internal. This scans every piece of public prose — page text, table cells,
 * callouts, step cards, endpoint, event, error and symptom descriptions, glossary,
 * navigation and page metadata — with code, identifiers and source comments
 * removed, for wording a mature financial API platform does not publish:
 *
 *   UNPROFESSIONAL      casual or patronising phrasing ("a sério", "just", "simply")
 *   AWKWARD_TRANSLATION English left in Portuguese prose, or calques ("inquilino")
 *   MARKETING           claims instead of capability ("seamless", "revolucionário")
 *   INTERNAL            assurance and implementation language ("mutation", "gate")
 *   AI_SOUNDING         filler ("É importante destacar", "robust and secure")
 *   LINK_COPY           link text that names no destination ("clique aqui", "learn more")
 *   INTRO               "Esta página explica…" instead of saying the thing
 *   REGIONAL            Brazilian consumer vocabulary in PT-PT/Angolan docs
 *   OVERSIZED_CALLOUTS  a callout long enough to be an article of its own
 *
 * Patterns are contextual: a hit that is deliberate goes in
 * docs/quality/docs-editorial-allowlist.json with the reason, and the gate
 * reports allowlist entries that no longer match anything.
 *
 *   node tools/check-docs-editorial.mjs
 */
process.removeAllListeners('warning');
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BZ_DOCS_ROOT ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR = join(ROOT, 'apps/website/app/developers/docs');
const read = (f) => readFileSync(join(DIR, f), 'utf8');

/** Source → public prose: no code blocks, no inline code, no styles, no comments, no imports. */
function prose(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^import .*$/gm, ' ')
    .replace(/const SAMPLE_[A-Z0-9_]+\s*=\s*`(?:\\`|[^`])*`;?/g, ' ')
    .replace(/raw=\{`(?:\\`|[^`])*`\}/g, ' ')
    .replace(/sample: `(?:\\`|[^`])*`,/g, ' ')
    .replace(/response: `(?:\\`|[^`])*`,/g, ' ')
    .replace(/curl: `(?:\\`|[^`])*`,/g, ' ')
    .replace(/<Code>[\s\S]*?<\/Code>/g, ' ‹code› ')
    .replace(/style=\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/\b(?:id|href|slug|name|type|source|endpoint|guide|k|h|scope|sdk|in|example|code|family|retry|idempotency_key)\s*[:=]\s*(['"])[^'"]*\1/g, ' ')
    .replace(/\b[a-zA-Z_]+:\s*(?=['"`])/g, ' ');
}

/** Bilingual data: the pt strings and the en strings, separately. */
function bilingual(src) {
  const out = { pt: [], en: [] };
  for (const m of src.matchAll(/\bpt: '((?:[^'\\]|\\.)*)',\s*en: '((?:[^'\\]|\\.)*)'/g)) { out.pt.push(m[1]); out.en.push(m[2]); }
  for (const m of src.matchAll(/"pt": "((?:[^"\\]|\\.)*)",\s*"en": "((?:[^"\\]|\\.)*)"/g)) { out.pt.push(m[1]); out.en.push(m[2]); }
  return out;
}

const texts = { pt: [], en: [] };
const push = (lang, where, text) => texts[lang].push({ where, text });
push('pt', 'content-pt.tsx', prose(read('content-pt.tsx')));
push('en', 'content-en.tsx', prose(read('content-en.tsx')));
push('pt', 'glossary.ts', [...read('glossary.ts').matchAll(/def: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).join('\n'));
for (const f of ['endpoint-meta.ts', 'events.ts', 'symptoms.ts', 'reference.tsx', 'ErrorCatalogue.tsx', 'EventReference.tsx', 'Troubleshooting.tsx', 'dx.tsx', 'HomePage.tsx', 'CapabilityCards.tsx', 'docs-meta.ts', 'shell.tsx', 'error-catalogue.json', 'GuidesMoved.tsx']) {
  const src = read(f);
  const b = bilingual(src);
  push('pt', f, b.pt.join('\n'));
  push('en', f, b.en.join('\n'));
  // Label helpers: t('pt', 'en') / tr(lang, 'pt', 'en') / label(lang, 'pt', 'en').
  for (const m of src.matchAll(/\b(?:t|tr|label)\((?:lang, )?'((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'\)/g)) { push('pt', f, m[1]); push('en', f, m[2]); }
}
{
  const shell = read('shell.tsx');
  for (const [name, lang] of [['AREAS_PT', 'pt'], ['AREAS_EN', 'en']]) {
    const block = shell.slice(shell.indexOf(`export const ${name}`), shell.indexOf('];', shell.indexOf(`export const ${name}`)));
    push(lang, `shell.tsx ${name}`, [...block.matchAll(/label: '([^']+)', desc: '([^']+)'/g)].map((m) => `${m[1]}. ${m[2]}`).join('\n'));
  }
  for (const m of shell.matchAll(/lang === 'pt' \? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'/g)) { push('pt', 'shell.tsx', m[1]); push('en', 'shell.tsx', m[2]); }
}

const RULES = {
  UNPROFESSIONAL: {
    pt: [/\ba sério\b/i, /\bquem quiser\b/i, /\bvaquinhas?\b/i, /\bcoisas?\b/i, /\bé só\b/i, /\bbasta\b/i, /\bsimplesmente\b/i, /\bbasicamente\b/i, /\bobviamente\b/i, /\bcomo vimos\b/i, /\bcomo já sabe\b/i, /\bnão se preocupe\b/i, /\bde qualquer maneira\b/i, /\bà vontade\b/i, /\bum desconhecido\b/i, /\bpor arrasto\b/i],
    en: [/\bjust\b/i, /\bsimply\b/i, /\bobviously\b/i, /\bbasically\b/i, /\breal app\b/i, /\breal users\b/i, /\ball you need to do\b/i, /\beasy\b/i, /\beasily\b/i, /\bdon'?t worry\b/i, /\bfor real\b/i],
  },
  AWKWARD_TRANSLATION: {
    pt: [/\binquilino\b/i, /\bbinding\b/i, /\bowner\b(?! |s\b)/, /\bmerchant\b/i, /\bruntime\b/i, /\breadiness\b/i, /\bworkflow\b/i, /(?<![.\w])settlement(?![.\w])/, /\bretry\b(?!-after)/i, /\bfinancial setup\b/i, /\bpayment session\b/i, /\bpayment link\b/i, /\bwallet account\b(?!\))/i, /\bprojeto sem titular\b/i],
    en: [/\bcobrança\b/i, /\bconfiguração\b/i],
  },
  MARKETING: {
    pt: [/\brevolucion\w+/i, /\bpoderos[oa]\b/i, /\bsem esforço\b/i, /\binovador\w*/i, /\bde nova geração\b/i, /\bo melhor\b/i, /\bmais rápid[oa] do mercado\b/i, /\bperfeit[oa]\b/i],
    en: [/\brevolutionary\b/i, /\bpowerful\b/i, /\bseamless(ly)?\b/i, /\beffortless(ly)?\b/i, /\bnext-generation\b/i, /\binnovative\b/i, /\bbest-in-class\b/i, /\bblazing\b/i, /\bworld-class\b/i, /\bperfect\b/i],
  },
  INTERNAL: {
    pt: [/\bmutation\b/i, /\bmuta[çc][ãa]o\b/i, /\bgate\b/i, /\binvariante\b/i, /\bassurance\b/i, /\bevid[êe]ncia\b/i, /\bE2E\b/, /\bbinding\b/i, /\broot wallet\b/i, /\bdeveloper\.audit_events\b/, /\bmatriz de implementa[çc][ãa]o\b/i, /\bRA-\d+/, /\bADR-\d+/],
    en: [/\bmutation\b/i, /\bgate\b/i, /\binvariant\b/i, /\bassurance\b/i, /\bevidence vector\b/i, /\bE2E\b/, /\bbinding\b/i, /\broot wallet\b/i, /\bdeveloper\.audit_events\b/, /\bimplementation matrix\b/i, /\bRA-\d+/, /\bADR-\d+/],
  },
  AI_SOUNDING: {
    pt: [/\bde forma simples\b/i, /\bé importante destacar\b/i, /\bvale ressaltar\b/i, /\bneste contexto\b/i, /\bem suma\b/i, /\bem outras palavras\b/i, /\bnão só .* mas também\b/i],
    en: [/\bit is important to note\b/i, /\bin this context\b/i, /\bin summary\b/i, /\bin other words\b/i, /\brobust and secure\b/i, /\bdesigned to empower\b/i, /\bleverage\b/i, /\bunlock\b/i],
  },
  INTRO: {
    pt: [/\besta página (explica|mostra|descreve)\b/i, /\bnesta sec[çc][ãa]o\b/i, /\ba seguir veremos\b/i],
    en: [/\bthis page explains\b/i, /\bin this section\b/i, /\bwe will (see|cover)\b/i],
  },
  REGIONAL: {
    pt: [/\busuári[oa]s?\b/i, /\barquivos?\b/i, /\btelas?\b/i, /\bcelular\b/i, /\bcadastr\w+/i, /\bgerenciar\b/i, /\bsenha\b/i],
    en: [],
  },
};
const LINK_COPY = [/>\s*(clique aqui|aqui|saiba mais|leia mais|ver mais|click here|here|learn more|read more|more)\s*<\/a>/i];

const allowFile = join(ROOT, 'docs/quality/docs-editorial-allowlist.json');
const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : [];
const used = new Set();
const allowed = (rule, lang, line) => allow.findIndex((a) => a.rule === rule && a.lang === lang && line.includes(a.contains));

const hits = Object.fromEntries(Object.keys(RULES).map((k) => [k, []]));
for (const lang of ['pt', 'en']) {
  for (const { where, text } of texts[lang]) {
    const lines = text.split(/\n|(?<=[.!?])\s+/).map((l) => l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter((l) => /[a-zà-ú]{3,}/i.test(l));
    for (const line of lines) {
      for (const [rule, byLang] of Object.entries(RULES)) {
        for (const re of byLang[lang]) {
          if (!re.test(line)) continue;
          const a = allowed(rule, lang, line);
          if (a >= 0) { used.add(a); continue; }
          hits[rule].push(`${lang} ${where}: “${line.slice(0, 140)}” — ${re}`);
        }
      }
    }
  }
}

// Link copy, on the raw sources (the anchor text is what matters).
const linkHits = [];
for (const f of ['content-pt.tsx', 'content-en.tsx', 'HomePage.tsx', 'shell.tsx', 'dx.tsx']) {
  for (const re of LINK_COPY) for (const m of read(f).matchAll(new RegExp(re.source, 'gi'))) linkHits.push(`${f}: link text “${m[1]}”`);
}

// Callouts: one idea, not an article.
const oversized = [];
for (const f of ['content-pt.tsx', 'content-en.tsx']) {
  for (const m of read(f).matchAll(/<Callout(?: tone="\w+")?>([\s\S]*?)<\/Callout>/g)) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\{' '\}/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 260) oversized.push(`${f}: ${text.length} characters — “${text.slice(0, 90)}…”`);
  }
}

const stale = allow.map((a, i) => (used.has(i) ? null : `allowlist entry no longer matches: ${a.rule} ${a.lang} “${a.contains}”`)).filter(Boolean);

let failures = 0;
const report = (name, list) => {
  failures += list.length;
  if (list.length) { console.error(`  ✗ ${name}=${list.length}`); for (const x of list.slice(0, 40)) console.error(`      ${x}`); } else console.log(`  ✓ ${name}=0`);
};
console.log('documentation editorial quality — PT and EN\n');
report('DOCS_UNPROFESSIONAL_COPY_HITS', hits.UNPROFESSIONAL);
report('DOCS_AWKWARD_TRANSLATION_HITS', hits.AWKWARD_TRANSLATION);
report('DOCS_MARKETING_COPY_HITS', hits.MARKETING);
report('DOCS_INTERNAL_LANGUAGE_HITS', hits.INTERNAL);
report('DOCS_AI_SOUNDING_COPY_HITS', hits.AI_SOUNDING);
report('DOCS_WEAK_INTRO_HITS', hits.INTRO);
report('DOCS_REGIONAL_VOCABULARY_HITS', hits.REGIONAL);
report('DOCS_LINK_COPY_HITS', linkHits);
report('DOCS_OVERSIZED_CALLOUTS', oversized);
report('DOCS_EDITORIAL_ALLOWLIST_STALE', stale);
console.log(`\nDOCS_LINK_COPY_QUALITY=${linkHits.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`DOCS_PAGE_INTRO_QUALITY=${hits.INTRO.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`DOCS_EDITORIAL_LINT=${failures === 0 ? 'PASS' : 'FAIL'}`);
process.exit(failures ? 1 : 0);
