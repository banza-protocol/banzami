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
      const push = (kind, text) => {
        const t = plain(text);
        if (t.length < 20 || /^[{}()[\],;.\s]*$/.test(t)) return;
        const id = `${lang}:${page}:${createHash('sha256').update(t).digest('hex').slice(0, 10)}`;
        out.push({ id, lang, page, kind, n: i += 1, text: t });
      };
      for (const m of body.matchAll(/<(LI|P|Callout|PageLede)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) push(m[1], m[2]);
      for (const m of body.matchAll(/\[\s*'((?:[^'\\]|\\.){3,})',\s*'((?:[^'\\]|\\.)*)'(?:,\s*'((?:[^'\\]|\\.)*)')?\s*\]/g)) push('row', [m[1], m[2], m[3]].filter(Boolean).join(' | '));
    }
  }
  // The reference is one bilingual file: its descriptions and error notes are claims too.
  const ref = readFileSync(join(dir, 'reference.tsx'), 'utf8');
  for (const m of ref.matchAll(/\{\s*pt:\s*'((?:[^'\\]|\\.)*)',\s*en:\s*'((?:[^'\\]|\\.)*)'\s*\}/g)) {
    for (const [lang, t] of [['pt', m[1]], ['en', m[2]]]) {
      const text = plain(t);
      if (text.length < 20) continue;
      out.push({ id: `${lang}:Reference-spec:${createHash('sha256').update(text).digest('hex').slice(0, 10)}`, lang, page: 'Reference-spec', kind: 'spec', n: 0, text });
    }
  }
  const seen = new Set();
  return out.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
}
