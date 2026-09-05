/**
 * The `request_id` a developer is told to keep must be the one the operator
 * actually emits.
 *
 * The docs' error envelope showed `req_XXXXXXXX`. The gateway emits 32 hex
 * characters with no prefix (services/common/obs newID). The mismatch was not
 * cosmetic: the Console's Logs search decided "is this an id or a path?" by
 * looking for the `req_` prefix, so pasting a REAL request_id searched the path
 * instead and found nothing — the one workflow the whole feature exists for.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(process.cwd(), '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

const REAL_SHAPE = /^[0-9a-f]{32}$/;

describe('request_id shape', () => {
  it('the gateway really emits 32 lowercase hex characters', () => {
    // The generator is the source of truth for the shape the docs promise.
    const obs = read('services/common/obs/obs.go');
    expect(obs).toContain('b := make([]byte, 16)');
    expect(obs).toContain('hex.EncodeToString(b)');
  });

  it('every documented sample uses that shape, not an invented prefix', () => {
    const surfaces = [
      'apps/website/app/developers/docs/content-pt.tsx',
      'apps/website/app/developers/docs/content-en.tsx',
      'apps/website/public/developers/openapi/banzami-sandbox.openapi.json',
      'docs/developer/openapi/banzami-sandbox.openapi.json',
    ];
    for (const f of surfaces) {
      const src = read(f);
      for (const m of src.matchAll(/"request_id"\s*:\s*"([^"]*)"/g)) {
        expect(m[1], `${f} documents request_id "${m[1]}", which the operator never emits`)
          .toMatch(REAL_SHAPE);
      }
    }
  });

  it('the Console search recognises a request_id by shape, not by prefix', () => {
    const src = read('apps/website/components/developers/portal/RequestLog.tsx');
    expect(src).toContain('[0-9a-f]{16,64}');
    expect(src, 'a `req_` prefix test would reject every real id')
      .not.toContain("startsWith('req_')");
  });
});
