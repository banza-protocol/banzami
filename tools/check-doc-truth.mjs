#!/usr/bin/env node
/**
 * DOCS-TRUTH-PREMIUM-001 — documentation truth guard.
 *
 * A fast, high-signal grep gate that fails the build if public copy or docs
 * reintroduce a claim the product has moved past. It is deliberately narrow:
 * only unambiguous, product-copy-level violations, so it never fights a doc that
 * legitimately explains the correct model. Complements PUBLIC_TRUTH /
 * check-public-site-truth.mjs (status facts) with terminology/claim truth.
 *
 *   node tools/check-doc-truth.mjs
 *   make check-doc-truth
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// BZ_DOC_TRUTH_ROOT lets a test run the same rules over a copy of the tree (mutation proofs).
const ROOT = process.env.BZ_DOC_TRUTH_ROOT ?? new URL('..', import.meta.url).pathname;

// Directories scanned for public-facing / current documentation copy.
const SCAN_DIRS = ['apps/website/app', 'apps/website/components', 'apps/website/public', 'docs', 'README.md'];
// Never scan generated, vendored, or genuinely-historical evidence.
const SKIP = [
  'node_modules', '.next', 'dist', 'build', '.git',
  'docs/readiness', 'docs/audit', 'docs/quality/REPAIR_LOG.md', 'docs/validation',
  // Accepted decision records are preserved history (§18/§79) — the guard enforces
  // current-facing surfaces, it does not rewrite past decisions and their examples.
  'docs/adr', 'docs/rfc',
  'apps/website/app/verificar', // verifier renders live ledger data, not product claims
];
const EXTS = new Set(['.md', '.mdx', '.tsx', '.ts', '.txt', '.json']);

// [pattern, human message, exemptIfLineMatches?]. Case-insensitive. Kept
// unambiguous on purpose; the optional third element skips lines where the
// phrase is used CORRECTLY (e.g. "rail-decoupled, not rail-free").
const FORBIDDEN = [
  [/\brail[-\s]?free\b/i, 'say "rail-decoupled", never "rail-free"', /rail[-\s]?decoupled|not\s+rail[-\s]?free|n[aã]o\s+rail[-\s]?free/i],
  [/bypass(am|amos|ar)?\s+(the\s+)?(banks?|bancos?|emis)\b/i, 'do not claim Banzami bypasses banks/EMIS — they are interoperability rails', /not\s+bypass|does\s+not\s+bypass|n[aã]o\s+.{0,12}bypass|sem\s+contornar/i],
  // The stale CANONICAL PERSONA is identified by its handle, not by the common
  // name "João Silva" (fine as a demo counterparty). Forbid the old handle forms.
  [/@joaosilva\b|@joao\b|\bjoaosilva\b|\bjoao_silva\b|"handle":\s*"joao/i, 'the canonical example persona is @ana / Ana Maria — retire the @joao/joao_silva handle'],
  [/nome\s+opcional/i, 'the declared full name is REQUIRED, not optional'],
  [/nome\s+conforme\s+(o\s+)?documento/i, 'the declared name is user-declared, not verified-from-a-document'],
  [/canvaskit[^.]{0,40}(no dom|cannot|can'?t)\s+(be\s+)?automat/i, 'App Web IS automatable via Flutter Semantics — remove the obsolete claim'],
  [/migra(tion|ç[aã]o)\s+015[12][^.\n]{0,60}(pending|pendente|por aplicar|not (yet )?(applied|validated))/i, '0151/0152 are APPLIED to banzami_staging — remove pending language'],
];

function walk(p, out) {
  const rel = p.slice(ROOT.length);
  if (SKIP.some((s) => rel === s || rel.startsWith(s + '/') || rel.endsWith('/' + s))) return;
  let st;
  try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e), out);
  } else if (EXTS.has(extname(p))) {
    out.push(p);
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);
// The guard itself and this milestone's own spec legitimately quote the phrases.
const SELF = ['tools/check-doc-truth.mjs'];

const violations = [];
for (const f of files) {
  const rel = f.slice(ROOT.length);
  if (SELF.includes(rel)) continue;
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const [re, msg, exempt] of FORBIDDEN) {
      if (re.test(line) && !(exempt && exempt.test(line))) {
        violations.push({ rel, line: i + 1, msg, text: line.trim().slice(0, 120) });
      }
    }
  });
}


// ── Business identity selection and verified @banza linking (ADR-060) ──────────
//
// The developer documentation states one model: the @banza belongs to the BUSINESS,
// not the project; a project LINKS to a business; control is confirmed by an email
// code sent to a previously verified contact, never to an address typed at linking
// time; that confirmation is not KYB; the Sandbox is fictitious money and
// real-money operations are unavailable. The rules below fail the build if the
// documentation ever says the opposite, and the positive assertions fail if the
// canonical statements disappear. Each rule is proven against a bad and a good
// sample on every run, so a rule that stops firing cannot go unnoticed.

/** The files that carry the developer-documentation prose, in both languages. */
const DOCS_PROSE = [
  'apps/website/app/developers/docs/content-pt.tsx',
  'apps/website/app/developers/docs/content-en.tsx',
  'apps/website/app/developers/docs/glossary.ts',
  'apps/website/app/developers/docs/HomePage.tsx',
  'apps/website/app/developers/docs/docs-meta.ts',
];

/** Source -> sentences a reader sees: comments and tags removed, whitespace collapsed. */
const sentencesOf = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\{' '\}/g, ' ').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .split(/(?<=[.!?»”])\s+|\s*\|\s*|',\s*'|",\s*"/)
  .map((x) => x.trim()).filter(Boolean);

const NEGATED = /\b(?:not|never|n't|nor|without|cannot)\b|\bn[aã]o\b|\bnunca\b|\bnem\b|\bsem\b|\bjamais\b|[nN]ot\s+KYB/i;

/**
 * id, human message, patterns, an exemption (a sentence that states the rule's
 * subject correctly), and the samples that prove the rule: `bad` must fire,
 * `good` must not.
 */
const IDENTITY_RULES = [
  {
    id: 'AUTO_GENERATED_HANDLE_PER_PROJECT',
    msg: 'a project does not automatically receive a generated @banza; the developer chooses the @banza of a Business',
    re: [
      /\b(?:cada|todos?\s+os|qualquer)\s+projetos?\b[^.]{0,60}\b(?:recebe|ganha|tem|obt[eé]m|fica\s+com)\b[^.]{0,40}\bautom[aá]tic\w*[^.]{0,40}@banza/i,
      /\ba\s+Banzami\s+(?:gera|atribui|cria)\s+(?:automaticamente\s+)?um\s+@banza\s+(?:para|a)\s+(?:cada|todos?\s+os)\s+projetos?/i,
      /@banza\s+(?:gerado|autom[aá]tico)\s+(?:para|a)\s+cada\s+projeto/i,
      /\b(?:every|each)\s+project\b[^.]{0,40}\b(?:automatically\s+)?(?:gets|receives)\b[^.]{0,30}\b(?:automatic|generated|an?)\s+@banza/i,
      /\bevery\s+project\s+(?:automatically\s+)?(?:gets|receives)\s+an?\s+(?:automatic\s+|generated\s+)?@banza/i,
      /\bBanzami\s+(?:generates|assigns|creates)\s+(?:an?\s+)?(?:automatic\s+|generated\s+)?@banza\s+(?:for|to)\s+(?:every|each)\s+project/i,
    ],
    exempt: NEGATED,
    bad: ['Cada projeto recebe automaticamente um @banza gerado.', 'Every project automatically gets a generated @banza.', 'Banzami generates an @banza for every project.'],
    good: ['Um projeto não recebe um @banza: liga-se a um negócio.', 'A project does not receive an @banza; it links to a Business.', 'Cada projeto mantém as suas chaves.'],
  },
  {
    id: 'HANDLE_BELONGS_TO_PROJECT',
    msg: 'the @banza belongs to the Business, never to the Project',
    re: [
      /\bo\s+@banza\s+(?:pertence|é)\s+(?:ao|do)\s+projeto\b/i,
      /\bo\s+projeto\s+(?:é\s+(?:o\s+)?(?:dono|titular|propriet[aá]rio)|possui|det[eé]m)\s+(?:d[oe]\s+)?(?:o\s+)?@\w+/i,
      /\bDoa\s+Payments\s+(?:owns|possui|det[eé]m|é\s+(?:o\s+)?(?:dono|titular)\s+d[oe])\s+(?:the\s+|o\s+)?@doa/i,
      /\bthe\s+@banza\s+belongs\s+to\s+the\s+project\b/i,
      /\b(?:a|the)\s+project\s+(?:owns|holds)\s+(?:the\s+|its\s+|an?\s+)?@banza/i,
    ],
    exempt: null,
    bad: ['O @banza pertence ao projeto.', 'Doa Payments owns @doa.', 'The @banza belongs to the project.', 'O projeto é o dono do @banza.'],
    good: ['O @banza pertence ao negócio, não ao projeto.', 'The @banza belongs to the Business, not to the Project.', 'Nome do projeto: o projeto não tem @banza.', 'A project has no @banza.'],
  },
  {
    id: 'ANY_EMAIL_PROVES_HANDLE_OWNERSHIP',
    msg: 'control of an @banza is never proven with an email the user provides at linking time',
    re: [
      /\b(?:pode|podem)\s+(?:indicar|usar|introduzir)\s+qualquer\s+email\b/i,
      /\bqualquer\s+email\s+(?:serve|[eé]\s+aceite|vale)\s+para\s+(?:provar|confirmar|ligar)/i,
      /\b(?:you\s+)?(?:can|may)\s+(?:provide|use|enter)\s+any\s+email\b/i,
      /\bany\s+email\s+(?:works|is\s+accepted|will\s+do)\s+(?:to|for)\s+(?:prove|confirm|link)/i,
      /\b(?:send|sends)\s+(?:the\s+)?(?:code|confirmation)\s+to\s+(?:any|whichever)\s+email\b/i,
    ],
    exempt: NEGATED,
    bad: ['Pode indicar qualquer email para provar o @banza.', 'You can provide any email to prove ownership of the @banza.', 'Any email works to link the Business.'],
    good: ['Não pode indicar outro email: a confirmação vai para o contacto verificado.', 'You cannot provide any email at linking time.'],
  },
  {
    id: 'EMAIL_CONFIRMATION_IS_KYB',
    msg: 'a confirmed email is not KYB and does not prove the legal ownership of a company',
    re: [
      /\b(?:confirma[çc][ãa]o|verifica[çc][ãa]o)\s+(?:de|por)\s+email\s+(?:[eé]|equivale\s+a|substitui|conta\s+como|corresponde\s+a)\s+(?:uma\s+|o\s+)?(?:verifica[çc][ãa]o\s+)?KYB/i,
      /\bemail\s+(?:confirmado|verificado)\s+(?:[eé]|equivale\s+a|substitui|conta\s+como)\s+(?:um\s+|o\s+)?KYB/i,
      /\bemail\s+(?:verification|confirmation)\s+(?:is|equals|replaces|counts\s+as)\s+(?:a\s+|the\s+same\s+as\s+)?(?:KYB|business\s+verification)/i,
      /\b(?:confirmed|verified)\s+email\s+(?:is|equals|replaces|counts\s+as)\s+(?:a\s+)?KYB/i,
    ],
    exempt: NEGATED,
    bad: ['A confirmação por email é KYB.', 'Email verification is KYB.', 'Um email confirmado substitui o KYB.', 'A confirmed email equals KYB.'],
    good: ['Um email confirmado não é KYB.', 'A confirmed email is not KYB, and it does not prove legal ownership.', 'Nenhuma delas é uma verificação KYB.'],
  },
  {
    id: 'REAL_MONEY_AVAILABLE',
    msg: 'real-money operations are unavailable; the documentation must never say they are available',
    re: [
      /\b(?:opera[çc][õo]es\s+com\s+dinheiro\s+real|Live)\s+(?:j[aá]\s+)?(?:est[aã]o|est[aá]|s[aã]o)\s+(?:j[aá]\s+)?(?:dispon[ií]ve(?:l|is)|ativ[ao]s?|abert[ao]s?|operacion(?:al|ais))/i,
      /\b(?:real-money\s+operations|Live)\s+(?:is|are)\s+(?:now\s+)?(?:available|open|live|active|operational)\b/i,
    ],
    exempt: /\bindispon|unavailable|not\s+(?:yet\s+)?(?:available|open|active)|\bn[aã]o\s+(?:est[aã]o|est[aá]|s[aã]o)/i,
    bad: ['As operações com dinheiro real estão disponíveis.', 'Real-money operations are available.', 'Live is now open.'],
    good: ['As operações com dinheiro real estão indisponíveis.', 'Real-money operations are unavailable.', 'O Sandbox é o único ambiente disponível.'],
  },
  {
    id: 'LINKING_CREATES_SECOND_WALLET',
    msg: 'linking a project to an existing Business reuses it: no second Business, wallet or @banza',
    re: [
      /\bliga(?:r|[çc][ãa]o)\b[^.]{0,80}\bcria\b[^.]{0,20}(?:uma\s+)?(?:segunda|outra|nova)\s+carteira/i,
      /\blink(?:ing)?\b[^.]{0,80}\bcreates?\b[^.]{0,20}(?:a\s+)?(?:second|another|new)\s+wallet/i,
    ],
    exempt: NEGATED,
    bad: ['Ligar um negócio existente cria uma segunda carteira.', 'Linking an existing Business creates a second wallet.'],
    good: ['Ligar um negócio existente não cria uma segunda carteira.', 'Linking does not create a second wallet.'],
  },
  {
    id: 'PROTECTED_NAMESPACE_REASON_EXPOSED',
    msg: 'availability is only available or not available: never expose why a name is unavailable (reserved, protected or system classes, or the protected inventory)',
    re: [
      /\b(?:RESERVED|PROTECTED|SYSTEM)\s+(?:namespace|handle)/i,
      /\bnamespace\s+(?:RESERVED|PROTECTED|SYSTEM)\b/i,
      /\bHANDLE_(?:RESERVED|PROTECTED|TAKEN|OWNED_BY_BUSINESS|NOT_A_BUSINESS)\b/,
      /\bhandles?\s+(?:reservados?|protegidos?)\s+(?:pelo|pela|por|porque|para)\b/i,
      /@banza\s+(?:est[aá]|fica)\s+(?:reservad[oa]|protegid[oa])\s+(?:porque|por|para)\b/i,
      /\b(?:handle|@banza)\s+is\s+(?:reserved|protected)\s+(?:because|for|by)\b/i,
      /\bprotected[-\s]handles?\s+(?:list|inventory)|invent[aá]rio\s+de\s+handles\s+protegidos/i,
    ],
    exempt: null,
    bad: ['O @banza está reservado porque pertence a um banco.', 'The handle is reserved because it is a bank name.', 'HANDLE_RESERVED', 'PROTECTED namespace'],
    good: ['Este @banza não está disponível. Escolha outro.', 'The Console says only that the @banza is not available.', 'Candidaturas e @banza já reservado'],
  },
];

/** The statements that must stay in the canonical pages, and where. */
const CANONICAL = [
  { file: 'apps/website/app/developers/docs/content-pt.tsx', fn: 'PtFinancialSetup', must: [
    'O @banza pertence ao negócio, não ao projeto.',
    'Um email indicado numa candidatura não é considerado confirmado até concluir a verificação.',
    'Ao ligar um @banza existente, a Banzami não utiliza um email indicado nesse momento pelo utilizador. A confirmação é enviada para um contacto previamente verificado associado ao negócio.',
    'Porque não pode indicar outro email?',
    'todos os valores são fictícios',
    'as operações com dinheiro real estão indisponíveis',
    'Um email confirmado prova acesso a um contacto. Não é KYB',
  ], box: /<Callout[^>]*>\s*<strong>Porque não pode indicar outro email\?<\/strong>/ },
  { file: 'apps/website/app/developers/docs/content-en.tsx', fn: 'EnFinancialSetup', must: [
    'The @banza belongs to the Business, not to the Project.',
    'An email provided in an application is not considered confirmed until verification is complete.',
    'When you link an existing @banza, Banzami does not use an email that the user provides at that moment. The confirmation is sent to a previously verified contact associated with the Business.',
    'Why can’t you provide another email?',
    'every value is fictitious',
    'real-money operations are unavailable',
    'A confirmed email proves access to a contact. It is not KYB',
  ], box: /<Callout[^>]*>\s*<strong>Why can’t you provide another email\?<\/strong>/ },
  { file: 'apps/website/app/developers/docs/glossary.ts', fn: null, must: [
    'Identificador único de um negócio na Banzami. O @banza pertence ao negócio, não ao projeto.',
  ] },
  { file: 'apps/website/app/developers/docs/content-en.tsx', fn: null, must: [
    'The unique identifier of a Business on Banzami. The @banza belongs to the Business, not to the Project.',
  ] },
];

const identityFailures = [];
const identityReadable = (rel) => { try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return null; } };

// (a) the rules are alive: each fires on its bad samples and stays silent on its good ones.
const fires = (rule, sentence) => rule.re.some((r) => r.test(sentence)) && !(rule.exempt && rule.exempt.test(sentence));
for (const rule of IDENTITY_RULES) {
  for (const b of rule.bad) if (!fires(rule, b)) identityFailures.push(`${rule.id}: the rule no longer fires on "${b}"`);
  for (const g of rule.good) if (fires(rule, g)) identityFailures.push(`${rule.id}: the rule wrongly fires on "${g}"`);
}

// (b) the documentation does not say any of it.
for (const rel of DOCS_PROSE) {
  const src = identityReadable(rel);
  if (src === null) { identityFailures.push(`${rel}: documentation file is missing`); continue; }
  for (const sentence of sentencesOf(src)) {
    for (const rule of IDENTITY_RULES) {
      if (fires(rule, sentence)) identityFailures.push(`${rel}: ${rule.id} - ${rule.msg}\n    > ${sentence.slice(0, 140)}`);
    }
  }
}

// (c) the canonical statements are still there.
for (const c of CANONICAL) {
  const src = identityReadable(c.file);
  if (src === null) { identityFailures.push(`${c.file}: documentation file is missing`); continue; }
  let body = src;
  if (c.fn) {
    const at = src.indexOf(`export function ${c.fn}(`);
    if (at < 0) { identityFailures.push(`${c.file}: ${c.fn} (the Financial setup page) is missing`); continue; }
    const next = src.indexOf('\nexport function ', at + 10);
    body = src.slice(at, next < 0 ? src.length : next);
  }
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\{' '\}/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,:;?!])/g, '$1');
  // The security box is a box (a Callout that opens with its question), not only a heading.
  if (c.box && !c.box.test(body)) identityFailures.push(`${c.file} (${c.fn}): the "why can't you provide another email" security box is not a Callout`);
  for (const phrase of c.must) {
    if (!text.includes(phrase)) identityFailures.push(`${c.file}${c.fn ? ` (${c.fn})` : ''}: the canonical statement is missing: "${phrase.slice(0, 90)}"`);
  }
}

if (violations.length || identityFailures.length) {
  if (violations.length) {
    console.error(`✗ doc-truth guard: ${violations.length} violation(s)\n`);
    for (const v of violations) console.error(`  ${v.rel}:${v.line} — ${v.msg}\n    > ${v.text}`);
  }
  if (identityFailures.length) {
    console.error(`✗ doc-truth guard: ${identityFailures.length} identity-model failure(s)\n`);
    for (const f of identityFailures) console.error(`  ${f}`);
  }
  process.exit(1);
}
console.log(`✓ doc-truth guard: ${files.length} files scanned, no stale product claims.`);
console.log(`✓ doc-truth guard: identity model holds (${IDENTITY_RULES.length} rules proven live, ${CANONICAL.reduce((n, c) => n + c.must.length, 0)} canonical statements present).`);
