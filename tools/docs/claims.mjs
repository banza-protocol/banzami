/**
 * The claims the public developer documentation makes, as units a person can
 * audit: every list item, paragraph, callout and table row, per page, in both
 * languages. A claim's id is its page, its kind and a hash of its text, so
 * editing a sentence produces a new, unaudited claim — which is the point.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const plain = (s) => s
  .replace(/raw=\{`([\s\S]*?)`\}/g, ' ')
  // <MailLink to="x@banzami.com" /> renders its address; keep it in the sentence.
  .replace(/<MailLink[^>]*\bto="([^"]+)"[^>]*\/>/g, '$1')
  .replace(/\{' '\}/g, ' ').replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '’').replace(/&apos;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#123;/g, '{').replace(/&#125;/g, '}')
  .replace(/\s+/g, ' ').trim();

const pages = (src, prefix) => {
  const out = {};
  const ms = [...src.matchAll(new RegExp(`export function ${prefix}(\\w+)\\(`, 'g'))];
  ms.forEach((m, i) => { out[m[1]] = src.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : src.length); });
  return out;
};

export function extractClaims(root) {
  const dir = join(root, 'apps/website/app/developers/docs');
  const out = [];
  for (const [lang, file, prefix] of [['pt', 'content-pt.tsx', 'Pt'], ['en', 'content-en.tsx', 'En']]) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const [page, body] of Object.entries(pages(src, prefix))) {
      let i = 0;
      const seenText = new Map();
      const push = (kind, text) => {
        const t = plain(text);
        // Steps, rows and scenarios are short by design ("None.", "Deduplicate."):
        // a length floor there would count a cell in one language and not the other.
        const floor = /^(row|step-|recipe-)/.test(kind) ? 3 : 20;
        if (t.length < floor || /^[{}()[\],;.\s‹›—–-]*$/.test(t)) return;
        // The same sentence twice on a page is two claims, not one.
        const nth = (seenText.get(t) ?? 0) + 1;
        seenText.set(t, nth);
        const id = `${lang}:${page}:${createHash('sha256').update(nth > 1 ? `${t}#${nth}` : t).digest('hex').slice(0, 10)}`;
        out.push({ id, lang, page, kind, n: i += 1, text: t });
      };
      for (const m of body.matchAll(/<(LI|P|Callout|PageLede)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) push(m[1], m[2]);
      // Table rows of two to five cells.
      for (const m of body.matchAll(/\[\s*'((?:[^'\\]|\\.){2,})'((?:,\s*'(?:[^'\\]|\\.)*'){1,4})\s*\]/g)) {
        push('row', [m[1], ...[...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1])].filter(Boolean).join(' | '));
      }
      // Step cards, test scenarios and tutorial chapters say what happens and what the reader sees.
      for (const m of body.matchAll(/\b(what|why|success|next|goal|app|banzami|result|failure)=(?:"([^"]*)"|\{<>([\s\S]*?)<\/>\})/g)) push(`step-${m[1]}`, m[2] ?? m[3]);
      for (const m of body.matchAll(/<StepCard[^>]*>([\s\S]*?)<\/StepCard>/g)) push('step-do', m[1].replace(/<CodeBlock[\s\S]*?\/>/g, ' '));
      for (const m of body.matchAll(/\b(trigger|api|event|console|cleanup|limits): (?:'((?:[^'\\]|\\.)*)'|<>([\s\S]*?)<\/>)/g)) push(`recipe-${m[1]}`, m[2] ?? m[3]);
    }
  }
  // Bilingual data files render on the pages too: their text is claims.
  const bilingual = (file, page) => {
    const src = readFileSync(join(dir, file), 'utf8');
    const nth = { pt: new Map(), en: new Map() };
    for (const m of src.matchAll(/\{\s*pt:\s*'((?:[^'\\]|\\.)*)',\s*en:\s*'((?:[^'\\]|\\.)*)',?\s*\}/g)) {
      // A pair counts in both languages or in neither.
      if (Math.max(plain(m[1]).length, plain(m[2]).length) < 20) continue;
      for (const [lang, t] of [['pt', m[1]], ['en', m[2]]]) {
        const text = plain(t);
        const k = (nth[lang].get(text) ?? 0) + 1;
        nth[lang].set(text, k);
        out.push({ id: `${lang}:${page}:${createHash('sha256').update(k > 1 ? `${text}#${k}` : text).digest('hex').slice(0, 10)}`, lang, page, kind: 'spec', n: 0, text });
      }
    }
  };
  bilingual('reference.tsx', 'Reference-spec');
  bilingual('endpoint-meta.ts', 'Endpoint-spec');
  bilingual('events.ts', 'Events-spec');
  bilingual('symptoms.ts', 'Symptoms-spec');
  {
    const cat = JSON.parse(readFileSync(join(dir, 'error-catalogue.json'), 'utf8'));
    for (const e of cat.errors) for (const lang of ['pt', 'en']) {
      const text = plain(`${e.code}: ${e.meaning[lang]} ${e.action[lang]}`);
      out.push({ id: `${lang}:Errors-spec:${createHash('sha256').update(text).digest('hex').slice(0, 10)}`, lang, page: 'Errors-spec', kind: 'spec', n: 0, text });
    }
  }
  const seen = new Set();
  return out.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
}
