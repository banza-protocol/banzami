/**
 * Syntax highlighting for the Developer Documentation and the Console's API
 * Explorer (DOCS-VISUAL-DX-002).
 *
 * A small set of lexers over the SOURCE TEXT — never over HTML — for exactly the
 * languages the public docs use: shell with first-class cURL, JSON, TypeScript /
 * JavaScript and raw HTTP. Each returns tokens whose values, concatenated, are
 * the input byte for byte (`tokens.map(t => t.v).join('') === source`), which
 * the tests hold for every documented example. Copying never reads the
 * rendered tokens: it copies the source string.
 *
 * Why not a general highlighter:
 *   · every documentation page is a client component, so a highlighter used at
 *     render time ships to every browser. Shiki's grammars and engine are far
 *     larger than the documentation's own code; Prism is smaller but installs a
 *     global and its bash grammar cannot tell a cURL header name from its value
 *     or see the JSON inside `-d '{…}'`, which is most of what the reference shows.
 *   · these lexers are synchronous and deterministic, so the server renders the
 *     coloured HTML and hydration produces the same tree — no unstyled flash.
 */

export type TokenType =
  | 'comment' | 'keyword' | 'string' | 'number' | 'boolean' | 'null' | 'property'
  | 'function' | 'class' | 'constant' | 'operator' | 'punctuation' | 'variable'
  | 'flag' | 'method' | 'url' | 'header' | 'regex' | 'plain';

export type Token = { t: TokenType; v: string };

export type CodeLang = 'curl' | 'shell' | 'json' | 'ts' | 'js' | 'http' | 'text';

/** The label shown for each language. */
export const LANG_LABEL: Record<CodeLang, string> = {
  curl: 'cURL', shell: 'Shell', json: 'JSON', ts: 'TypeScript', js: 'JavaScript', http: 'HTTP', text: 'Texto',
};

/** Languages the documentation highlights; `text` is plain on purpose. */
export const HIGHLIGHTED_LANGS: CodeLang[] = ['curl', 'shell', 'json', 'ts', 'js', 'http'];

export function highlight(source: string, lang: CodeLang): Token[] {
  const out: Token[] =
    lang === 'json' ? lexJson(source)
      : lang === 'ts' || lang === 'js' ? lexScript(source)
        : lang === 'curl' || lang === 'shell' ? lexShell(source)
          : lang === 'http' ? lexHttp(source)
            : [{ t: 'plain', v: source }];
  return merge(out);
}

/** Adjacent tokens of the same type become one — fewer spans, same text. */
function merge(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const tk of tokens) {
    if (!tk.v) continue;
    const last = out[out.length - 1];
    if (last && last.t === tk.t) last.v += tk.v;
    else out.push({ t: tk.t, v: tk.v });
  }
  return out;
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /[A-Za-z_$À-ɏ]/.test(c);
const isIdent = (c: string) => /[A-Za-z0-9_$À-ɏ]/.test(c);

/** Index just past the string that starts at `i` (a quote), honouring backslash escapes. */
function stringEnd(s: string, i: number): number {
  const q = s[i];
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s[j] === q) return j + 1;
    if (s[j] === '\n' && q !== '`') return j; // an unterminated line string stops at the line
    j += 1;
  }
  return s.length;
}

// ── JSON ─────────────────────────────────────────────────────────────────────

export function lexJson(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (isSpace(c)) { let j = i; while (j < s.length && isSpace(s[j])) j += 1; out.push({ t: 'plain', v: s.slice(i, j) }); i = j; continue; }
    // Comments appear in documentation JSON (`/* the event object */`, `# Response`).
    if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); const end = j < 0 ? s.length : j + 2; out.push({ t: 'comment', v: s.slice(i, end) }); i = end; continue; }
    if ((c === '/' && s[i + 1] === '/') || (c === '#' && (i === 0 || s[i - 1] === '\n' || isSpace(s[i - 1])))) {
      const j = s.indexOf('\n', i); const end = j < 0 ? s.length : j; out.push({ t: 'comment', v: s.slice(i, end) }); i = end; continue;
    }
    if (c === '"') {
      const end = stringEnd(s, i);
      let k = end; while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k += 1;
      out.push({ t: s[k] === ':' ? 'property' : 'string', v: s.slice(i, end) });
      i = end; continue;
    }
    if (c === '-' || isDigit(c)) {
      const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i));
      if (m) { out.push({ t: 'number', v: m[0] }); i += m[0].length; continue; }
    }
    if ('{}[],:'.includes(c)) { out.push({ t: 'punctuation', v: c }); i += 1; continue; }
    if (isIdentStart(c)) {
      let j = i; while (j < s.length && isIdent(s[j])) j += 1;
      const w = s.slice(i, j);
      out.push({ t: w === 'true' || w === 'false' ? 'boolean' : w === 'null' ? 'null' : 'plain', v: w });
      i = j; continue;
    }
    out.push({ t: 'plain', v: c }); i += 1;
  }
  return out;
}

/** Where a JSON value that starts at `i` (`{` or `[`) ends, string-aware. */
function jsonEnd(s: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < s.length) {
    const c = s[j];
    if (c === '"') { j = stringEnd(s, j); continue; }
    if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') { depth -= 1; if (depth === 0) return j + 1; }
    j += 1;
  }
  return s.length;
}

// ── shell and cURL ───────────────────────────────────────────────────────────

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--json']);
const HEADER_FLAGS = new Set(['-H', '--header']);
const METHOD_FLAGS = new Set(['-X', '--request']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/** Variables inside a double-quoted shell string. */
function shellInterpolated(v: string, base: TokenType): Token[] {
  const out: Token[] = [];
  let i = 0;
  let start = 0;
  while (i < v.length) {
    if (v[i] === '$' && (v[i + 1] === '{' || isIdentStart(v[i + 1] ?? ''))) {
      if (i > start) out.push({ t: base, v: v.slice(start, i) });
      let j = i + 1;
      if (v[j] === '{') { const k = v.indexOf('}', j); j = k < 0 ? v.length : k + 1; } else { while (j < v.length && /[A-Za-z0-9_]/.test(v[j])) j += 1; }
      out.push({ t: 'variable', v: v.slice(i, j) });
      i = j; start = j; continue;
    }
    i += 1;
  }
  if (start < v.length) out.push({ t: base, v: v.slice(start) });
  return out;
}

export function lexShell(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let commandPos = true;     // the next word is a command
  let pendingFlag = '';      // the flag whose argument comes next
  let lineStart = true;      // only whitespace since the last newline (or a continuation)
  let continued = false;     // the previous line ended with a backslash
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') {
      out.push({ t: 'plain', v: c });
      i += 1;
      lineStart = true;
      if (!continued) { commandPos = true; pendingFlag = ''; }
      continued = false;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { let j = i; while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\r')) j += 1; out.push({ t: 'plain', v: s.slice(i, j) }); i = j; continue; }
    // A JSON document standing on its own lines — a response shown after the request.
    if (lineStart && !continued && (c === '{' || c === '[')) {
      const end = jsonEnd(s, i);
      out.push(...lexJson(s.slice(i, end)));
      i = end; lineStart = false; continue;
    }
    if (c === '#' && (i === 0 || isSpace(s[i - 1]))) {
      const j = s.indexOf('\n', i); const end = j < 0 ? s.length : j;
      out.push({ t: 'comment', v: s.slice(i, end) }); i = end; continue;
    }
    lineStart = false;
    if (c === '\\' && (s[i + 1] === '\n' || (s[i + 1] === '\r' && s[i + 2] === '\n'))) {
      out.push({ t: 'punctuation', v: '\\' }); i += 1; continued = true; continue;
    }
    if (c === "'") {
      const j = s.indexOf("'", i + 1); const end = j < 0 ? s.length : j + 1;
      const inner = s.slice(i + 1, end - 1);
      if (DATA_FLAGS.has(pendingFlag) && /^\s*[[{]/.test(inner)) {
        out.push({ t: 'punctuation', v: "'" }, ...lexJson(inner), { t: 'punctuation', v: end - 1 > i && s[end - 1] === "'" ? "'" : '' });
      } else {
        out.push({ t: 'string', v: s.slice(i, end) });
      }
      pendingFlag = ''; commandPos = false; i = end; continue;
    }
    if (c === '"') {
      const end = stringEnd(s, i);
      const body = s.slice(i, end);
      if (HEADER_FLAGS.has(pendingFlag)) {
        const colon = body.indexOf(':');
        if (colon > 1) {
          out.push({ t: 'punctuation', v: '"' }, { t: 'header', v: body.slice(1, colon) }, { t: 'punctuation', v: ':' },
            ...shellInterpolated(body.slice(colon + 1, body.endsWith('"') && body.length > 1 ? -1 : undefined), 'string'),
            { t: 'punctuation', v: body.endsWith('"') && body.length > 1 ? '"' : '' });
        } else {
          out.push(...shellInterpolated(body, 'string'));
        }
      } else {
        out.push(...shellInterpolated(body, 'string'));
      }
      pendingFlag = ''; commandPos = false; i = end; continue;
    }
    if (c === '$' && (s[i + 1] === '{' || isIdentStart(s[i + 1] ?? ''))) {
      let j = i + 1;
      if (s[j] === '{') { const k = s.indexOf('}', j); j = k < 0 ? s.length : k + 1; } else { while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j += 1; }
      out.push({ t: 'variable', v: s.slice(i, j) }); i = j; commandPos = false; pendingFlag = ''; continue;
    }
    if (c === '|' || c === ';' || c === '&' || c === '>' || c === '<') {
      let j = i; while (j < s.length && '|;&><'.includes(s[j])) j += 1;
      out.push({ t: 'operator', v: s.slice(i, j) }); i = j;
      commandPos = s.slice(i - (j - i), j) !== '>' && s.slice(i - (j - i), j) !== '<';
      pendingFlag = ''; continue;
    }
    // A word.
    let j = i;
    while (j < s.length && !isSpace(s[j]) && !"'\"|;&<>".includes(s[j]) && !(s[j] === '$' && j > i)) j += 1;
    if (j === i) { out.push({ t: 'plain', v: c }); i += 1; continue; }
    const w = s.slice(i, j);
    let t: TokenType = 'plain';
    if (commandPos && !w.includes('=')) { t = 'function'; commandPos = false; }
    else if (METHOD_FLAGS.has(pendingFlag) && HTTP_METHODS.has(w)) t = 'method';
    else if (w.startsWith('-')) t = 'flag';
    else if (/^https?:\/\//.test(w)) t = 'url';
    else if (/^\d+$/.test(w)) t = 'number';
    if (commandPos && w.includes('=')) { t = 'variable'; }
    pendingFlag = t === 'flag' ? w : '';
    out.push({ t, v: w });
    i = j;
  }
  return out;
}

// ── TypeScript / JavaScript ──────────────────────────────────────────────────

const KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'const', 'let', 'var', 'function', 'async', 'await', 'return', 'if', 'else',
  'try', 'catch', 'finally', 'throw', 'new', 'for', 'of', 'in', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'class', 'extends', 'typeof', 'instanceof', 'void', 'delete', 'yield', 'type', 'interface', 'as', 'satisfies',
  'enum', 'implements', 'readonly', 'public', 'private', 'protected', 'static', 'declare', 'keyof', 'this', 'super',
]);
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

export function lexScript(s: string): Token[] {
  const out: Token[] = [];
  lexScriptInto(s, 0, s.length, out, false);
  return out;
}

/** Lexes s[from, to). In a template expression it stops at the closing brace and returns its index. */
function lexScriptInto(s: string, from: number, to: number, out: Token[], inTemplate: boolean): number {
  let i = from;
  let depth = 0;
  const significant = () => { for (let k = out.length - 1; k >= 0; k -= 1) if (out[k].t !== 'plain' || out[k].v.trim()) return out[k]; return null; };
  while (i < to) {
    const c = s[i];
    if (isSpace(c)) { let j = i; while (j < to && isSpace(s[j])) j += 1; out.push({ t: 'plain', v: s.slice(i, j) }); i = j; continue; }
    if (c === '/' && s[i + 1] === '/') { const j = s.indexOf('\n', i); const end = j < 0 || j > to ? to : j; out.push({ t: 'comment', v: s.slice(i, end) }); i = end; continue; }
    if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); const end = j < 0 ? to : Math.min(j + 2, to); out.push({ t: 'comment', v: s.slice(i, end) }); i = end; continue; }
    if (c === "'" || c === '"') { const end = Math.min(stringEnd(s, i), to); out.push({ t: 'string', v: s.slice(i, end) }); i = end; continue; }
    if (c === '`') {
      let j = i + 1;
      let start = i;
      while (j < to) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '`') { j += 1; break; }
        if (s[j] === '$' && s[j + 1] === '{') {
          out.push({ t: 'string', v: s.slice(start, j) }, { t: 'punctuation', v: '${' });
          const close = lexScriptInto(s, j + 2, to, out, true);
          if (close < to) out.push({ t: 'punctuation', v: '}' });
          j = close + 1; start = j; continue;
        }
        j += 1;
      }
      out.push({ t: 'string', v: s.slice(start, Math.min(j, to)) });
      i = Math.min(j, to); continue;
    }
    if (c === '/') {
      const prev = significant();
      const regexContext = !prev || (prev.t === 'punctuation' || prev.t === 'operator' ? REGEX_AFTER.has(prev.v.slice(-1)) : prev.t === 'keyword' && ['return', 'typeof', 'case', 'in', 'of'].includes(prev.v));
      if (regexContext) {
        let j = i + 1; let cls = false;
        while (j < to && s[j] !== '\n') {
          if (s[j] === '\\') { j += 2; continue; }
          if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; else if (s[j] === '/' && !cls) break;
          j += 1;
        }
        if (j < to && s[j] === '/') {
          j += 1; while (j < to && /[a-z]/.test(s[j])) j += 1;
          out.push({ t: 'regex', v: s.slice(i, j) }); i = j; continue;
        }
      }
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1] ?? ''))) {
      const m = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)n?/.exec(s.slice(i, to));
      if (m && m[0]) { out.push({ t: 'number', v: m[0] }); i += m[0].length; continue; }
    }
    if (isIdentStart(c)) {
      let j = i; while (j < to && isIdent(s[j])) j += 1;
      const w = s.slice(i, j);
      let k = j; while (k < to && (s[k] === ' ' || s[k] === '\t')) k += 1;
      const prev = significant();
      const afterDot = prev?.v === '.' || prev?.v === '?.';
      let t: TokenType = 'plain';
      if (!afterDot && KEYWORDS.has(w)) t = 'keyword';
      else if (w === 'true' || w === 'false') t = 'boolean';
      else if (w === 'null' || w === 'undefined') t = 'null';
      else if (s[k] === '(' || (s[k] === '<' && /^<[A-Z]/.test(s.slice(k, k + 2)))) t = 'function';
      else if (afterDot) t = 'property';
      else if (s[k] === ':' && s[k + 1] !== ':' && (prev?.v === '{' || prev?.v === ',')) t = 'property';
      else if (/^[A-Z][A-Z0-9_]{2,}$/.test(w)) t = 'constant';
      else if (/^[A-Z]/.test(w)) t = 'class';
      out.push({ t, v: w }); i = j; continue;
    }
    if (inTemplate) {
      if (c === '{') depth += 1;
      else if (c === '}') { if (depth === 0) return i; depth -= 1; }
    }
    if ('{}()[];,.'.includes(c)) {
      if (c === '.' && s[i + 1] === '.' && s[i + 2] === '.') { out.push({ t: 'operator', v: '...' }); i += 3; continue; }
      out.push({ t: 'punctuation', v: c }); i += 1; continue;
    }
    const op = /^(?:\?\?=|\?\?|\?\.|=>|===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|[=+\-*/%<>!&|^~?:@#])/.exec(s.slice(i, to));
    if (op) { out.push({ t: 'operator', v: op[0] }); i += op[0].length; continue; }
    out.push({ t: 'plain', v: c }); i += 1;
  }
  return to;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

export function lexHttp(s: string): Token[] {
  const out: Token[] = [];
  const blank = s.search(/\r?\n\r?\n/);
  const head = blank < 0 ? s : s.slice(0, blank);
  const body = blank < 0 ? '' : s.slice(blank);
  const lines = head.split('\n');
  lines.forEach((line, n) => {
    if (n > 0) out.push({ t: 'plain', v: '\n' });
    const req = /^([A-Z]+)(\s+)(\S+)(.*)$/.exec(line);
    const status = /^(HTTP\/[\d.]+)(\s+)(\d{3})(.*)$/.exec(line);
    const header = /^([A-Za-z0-9-]+)(:)(.*)$/.exec(line);
    if (n === 0 && req && HTTP_METHODS.has(req[1])) out.push({ t: 'method', v: req[1] }, { t: 'plain', v: req[2] }, { t: 'url', v: req[3] }, { t: 'plain', v: req[4] });
    else if (n === 0 && status) out.push({ t: 'plain', v: status[1] }, { t: 'plain', v: status[2] }, { t: 'number', v: status[3] }, { t: 'plain', v: status[4] });
    else if (header) out.push({ t: 'header', v: header[1] }, { t: 'punctuation', v: header[2] }, ...shellInterpolated(header[3], 'string'));
    else out.push({ t: 'plain', v: line });
  });
  if (body) {
    const lead = /^\s*/.exec(body)![0];
    out.push({ t: 'plain', v: lead }, ...lexJson(body.slice(lead.length)));
  }
  return out;
}

/** The language a legacy label names: "curl · …", "ts · …", "json · …". */
export function langFromLabel(label: string): CodeLang {
  const head = label.split('·')[0].trim().toLowerCase();
  if (head === 'curl') return 'curl';
  if (head === 'ts' || head === 'typescript') return 'ts';
  if (head === 'js' || head === 'javascript') return 'js';
  if (head === 'json') return 'json';
  if (head === 'bash' || head === 'shell' || head === 'sh') return 'shell';
  if (head === 'http') return 'http';
  return 'text';
}

/** The label without its language prefix: "curl · POST /v1/x" → "POST /v1/x". */
export function contextFromLabel(label: string): string {
  const parts = label.split('·');
  return parts.length > 1 && langFromLabel(label) !== 'text' ? parts.slice(1).join('·').trim() : label;
}
