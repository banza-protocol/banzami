/**
 * assurance-manifest-lib.mjs
 *
 * Shared parser for quality/operator-assurance-manifest.yaml.
 *
 * The manifest deliberately uses a strict, flat subset of YAML (2-space
 * indent, no anchors/aliases/flow-collections except none) so it can be
 * parsed without external dependencies. If the file drifts outside this
 * subset the parser throws — that is intentional: the manifest is a
 * governed artifact, not free-form YAML.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export const MANIFEST_PATH = 'quality/operator-assurance-manifest.yaml';

export const VALID_STATUS = ['verified', 'in-audit', 'blocked', 'deprecated', 'removed'];
export const VALID_AUTHORITY = ['protocol', 'operator-extension', 'internal'];
export const VALID_PUBLIC_STATUS = ['public-sandbox', 'public-live', 'internal', 'preview-disabled', 'not-exposed'];
export const VALID_DISPOSITION = ['active-required', 'active-needs-remediation', 'legacy-compat-justified', 'obsolete-candidate', 'removed'];
export const VALID_GATE = ['sandbox-e2e-required', 'integration-required', 'static-only', 'none-docs-only'];

const LIST_FIELDS = ['implementation', 'api_surface', 'evidence'];
const TEST_KINDS = ['unit', 'integration', 'e2e_sandbox', 'negative_security'];

export function parseManifest(root) {
  const raw = readFileSync(join(root, MANIFEST_PATH), 'utf-8');
  const lines = raw.split('\n');
  const capabilities = [];
  let meta = {};
  let cap = null;
  let listField = null;   // current list being filled: 'implementation' | ... or tests.<kind>
  let inTests = false;
  let inEnv = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line) || line.trim() === '') continue;

    const indent = line.length - line.trimStart().length;
    const t = line.trim();

    if (indent === 0) {
      const m = t.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (m && m[1] !== 'capabilities') meta[m[1]] = m[2];
      continue;
    }

    // New capability entry
    if (/^-\s+id:\s*/.test(t) && indent === 2) {
      cap = { _line: i + 1, tests: {}, environments: {} };
      TEST_KINDS.forEach(k => (cap.tests[k] = []));
      LIST_FIELDS.forEach(k => (cap[k] = []));
      cap.id = t.replace(/^-\s+id:\s*/, '').trim();
      capabilities.push(cap);
      listField = null; inTests = false; inEnv = false;
      continue;
    }
    if (!cap) continue;

    // List items ("- value")
    if (/^-\s+/.test(t)) {
      const val = t.replace(/^-\s+/, '').trim();
      if (listField) {
        if (inTests) cap.tests[listField].push(val);
        else cap[listField].push(val);
      }
      continue;
    }

    const kv = t.match(/^([a-z0-9_]+):\s*(.*)$/);
    if (!kv) throw new Error(`Manifest parse error at line ${i + 1}: "${t}"`);
    const [, key, valRaw] = kv;
    const val = valRaw.replace(/\s+#.*$/, '').trim();

    if (key === 'tests') { inTests = true; inEnv = false; listField = null; continue; }
    if (key === 'environments') { inEnv = true; inTests = false; listField = null; continue; }

    if (inTests && TEST_KINDS.includes(key)) {
      listField = key;
      if (val && val !== '' && val !== '[]') {
        // inline list: [a, b]
        const items = val.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
        cap.tests[key].push(...items);
        listField = null;
      } else if (val === '[]') {
        listField = null;
      }
      continue;
    }
    if (inEnv && (key === 'sandbox' || key === 'live')) {
      cap.environments[key] = val === 'true';
      continue;
    }

    inTests = false; inEnv = false;
    if (LIST_FIELDS.includes(key)) {
      listField = key;
      if (val === '[]') listField = null;
      continue;
    }
    listField = null;

    // multi-line folded strings (>) — consume continuation lines
    if (val === '>' || val === '>-' || val === '|') {
      let folded = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        const nIndent = next.length - next.trimStart().length;
        if (next.trim() === '' || nIndent > indent) { folded.push(next.trim()); i++; }
        else break;
      }
      cap[key] = folded.join(' ');
      continue;
    }
    cap[key] = val;
  }

  return { meta, capabilities };
}
