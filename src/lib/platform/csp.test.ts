// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  allowSelfFraming,
  applyStylePolicy,
  generateNonce,
  parseCsp,
  serializeCsp,
  summarizeCspReport,
  HASHED_STYLE_ATTRIBUTES,
} from './csp';

const STRICT_TAIL = (nonce: string) => [`'nonce-${nonce}'`, "'unsafe-hashes'", ...HASHED_STYLE_ATTRIBUTES.map((a) => `'${a.hash}'`)];

// SvelteKit's build header, before this module decides about inline styles.
const BASE =
  "default-src 'self'; script-src 'self' 'unsafe-hashes' 'sha256-abc=' 'nonce-SCRIPT'; style-src 'self'; img-src 'self' https: http: data:; frame-ancestors 'none'";

const NONCE = 'c3R5bGVub25jZQ==';

describe('parseCsp / serializeCsp', () => {
  it('round-trips a header, keeping directive order', () => {
    expect(serializeCsp(parseCsp(BASE))).toBe(BASE);
  });
  it('tolerates stray separators and whitespace', () => {
    const parsed = parseCsp("  style-src   'self' ;; img-src 'self' ; ");
    expect(parsed.get('style-src')).toEqual(["'self'"]);
    expect(parsed.get('img-src')).toEqual(["'self'"]);
  });
});

describe('applyStylePolicy', () => {
  it('strict + enforce: the nonce and the announcer hash, no report-only header', () => {
    const { csp, reportOnly } = applyStylePolicy(BASE, { kind: 'strict', nonce: NONCE, phase: 'enforce' });
    expect(parseCsp(csp).get('style-src')).toEqual(["'self'", ...STRICT_TAIL(NONCE)]);
    expect(reportOnly).toBeNull();
    expect(parseCsp(csp).get('script-src')).toEqual(parseCsp(BASE).get('script-src'));
    expect(parseCsp(csp).get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('strict + report-only: loose enforced, strict reported', () => {
    const { csp, reportOnly } = applyStylePolicy(BASE, { kind: 'strict', nonce: NONCE, phase: 'report-only' });
    expect(parseCsp(csp).get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(reportOnly).toBe(`style-src 'self' ${STRICT_TAIL(NONCE).join(' ')}; report-uri /api/csp-report`);
  });

  it('loose: unsafe-inline and never a nonce beside it (a nonce would disable it)', () => {
    for (const phase of ['report-only', 'enforce'] as const) {
      const { csp, reportOnly } = applyStylePolicy(BASE, { kind: 'loose', nonce: NONCE, phase });
      expect(parseCsp(csp).get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
      expect(csp).not.toContain(`nonce-${NONCE}`);
      expect(reportOnly).toBeNull();
    }
  });

  it('frame: loose and framable by this origin', () => {
    const { csp } = applyStylePolicy(BASE, { kind: 'frame', nonce: NONCE, phase: 'enforce' });
    expect(parseCsp(csp).get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(parseCsp(csp).get('frame-ancestors')).toEqual(["'self'"]);
  });

  it('drops an inline mechanism the base header already carried', () => {
    const relaxed = BASE.replace("style-src 'self'", "style-src 'self' 'unsafe-inline' 'unsafe-hashes' 'nonce-OLD'");
    const { csp } = applyStylePolicy(relaxed, { kind: 'strict', nonce: NONCE, phase: 'enforce' });
    expect(parseCsp(csp).get('style-src')).toEqual(["'self'", ...STRICT_TAIL(NONCE)]);
  });

  it('falls back to default-src when style-src is absent', () => {
    const { csp } = applyStylePolicy("default-src 'self' https://cdn.example", { kind: 'strict', nonce: NONCE, phase: 'enforce' });
    expect(parseCsp(csp).get('style-src')).toEqual(["'self'", 'https://cdn.example', ...STRICT_TAIL(NONCE)]);
  });
});

describe('allowSelfFraming', () => {
  // The dev header: the style rewrite is skipped there, but the frame must
  // still be framable, or no diagram draws.
  const DEV = "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'";
  it("lets this origin frame the page and changes nothing else", () => {
    const csp = parseCsp(allowSelfFraming(DEV));
    expect(csp.get('frame-ancestors')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

// A hash permits one exact string of a dependency, so both halves are pinned:
// an upgrade that changes the string fails here, not as a blocked style.
describe('hashed style attributes', () => {
  for (const { what, source, style, hash } of HASHED_STYLE_ATTRIBUTES) {
    it(`${what}: the hash is the sha256 of its string`, () => {
      expect(hash).toBe(`sha256-${createHash('sha256').update(style).digest('base64')}`);
    });
    it(`${what}: the installed dependency still writes that string`, () => {
      const text = readFileSync(resolve(__dirname, '../../..', source), 'utf8');
      expect(text, `${source} no longer contains the hashed style — drop or update the entry`).toContain(`style="${style}"`);
    });
  }
});

describe('styleRouteKindForPath / crossesStylePolicy', () => {
  it('classes paths the way cspRoutes classes route ids', async () => {
    const { styleRouteKindForPath, crossesStylePolicy } = await import('./csp');
    expect(styleRouteKindForPath('/')).toBe('strict');
    expect(styleRouteKindForPath('/some-page')).toBe('strict');
    expect(styleRouteKindForPath('/ns/some-page?x=1#h')).toBe('strict');
    expect(styleRouteKindForPath('/some-page/edit')).toBe('loose');
    expect(styleRouteKindForPath('/ns/some-page/edit/')).toBe('loose');
    expect(styleRouteKindForPath('/settings')).toBe('loose');
    expect(styleRouteKindForPath('/settings/profile')).toBe('loose');
    expect(styleRouteKindForPath('/settingsx')).toBe('strict');
    expect(styleRouteKindForPath('/dev/design-system')).toBe('loose');
    expect(styleRouteKindForPath('/api/embed/mermaid')).toBe('frame');
    expect(crossesStylePolicy('/some-page', '/some-page/edit')).toBe(true);
    expect(crossesStylePolicy('/settings', '/some-page')).toBe(true);
    expect(crossesStylePolicy('/a', '/b')).toBe(false);
    expect(crossesStylePolicy('/settings/a', '/settings/b')).toBe(false);
  });
});

describe('generateNonce', () => {
  it('is 16 bytes of base64, fresh each time', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});

describe('summarizeCspReport', () => {
  const ORIGIN = 'http://localhost:4173';
  const one = (body: unknown, origin = ORIGIN) => summarizeCspReport(body, { origin })[0];

  it('reads the legacy report-uri shape', () => {
    expect(
      one({
        'csp-report': {
          'document-uri': `${ORIGIN}/public-page`,
          'effective-directive': 'style-src-attr',
          'blocked-uri': 'inline',
          'source-file': `${ORIGIN}/_app/immutable/chunks/x.js`,
          'line-number': 12,
        },
      })
    ).toEqual({
      directive: 'style-src-attr',
      blocked: 'inline',
      source: '/_app/immutable/chunks/x.js:12',
      document: '/[id]',
      referrer: '-',
    });
  });

  it('reads the Reporting API shape, one record per report', () => {
    const records = summarizeCspReport(
      [
        { type: 'csp-violation', body: { effectiveDirective: 'style-src-elem', blockedURL: 'inline', documentURL: 'http://x/settings' } },
        { type: 'csp-violation', body: { effectiveDirective: 'style-src-attr', blockedURL: 'inline', documentURL: 'http://x/graph' } },
      ],
      { origin: 'http://x' }
    );
    expect(records).toHaveLength(2);
    expect(records[0].directive).toBe('style-src-elem');
    expect(records[1].document).toBe('/graph');
  });

  it('never emits a share token, in any URL-bearing field', () => {
    const TOKEN = 'FAKEshareTOKENforTESTS00';
    const record = one({
      'csp-report': {
        'document-uri': `${ORIGIN}/share/${TOKEN}`,
        referrer: `${ORIGIN}/share/${TOKEN}`,
        'blocked-uri': `${ORIGIN}/share/${TOKEN}/content`,
        'source-file': `${ORIGIN}/share/${TOKEN}`,
        'effective-directive': 'style-src-attr',
      },
    });
    expect(JSON.stringify(record)).not.toContain(TOKEN);
    expect(record).toEqual({
      directive: 'style-src-attr',
      blocked: '/share/[id]/content',
      source: '/share/[id]:-',
      document: '/share/[id]',
      referrer: '/share/[id]',
    });
  });

  it('never emits the script sample or the original policy', () => {
    const record = one({
      'csp-report': {
        'effective-directive': 'style-src-attr',
        'script-sample': 'color: red; background: url(secret)',
        'original-policy': "style-src 'self' 'nonce-c3R5bGVub25jZQ=='",
      },
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('nonce-');
  });

  it('flattens whitespace and caps field length', () => {
    const record = one({ 'csp-report': { 'blocked-uri': 'a\nb\n' + 'x'.repeat(500) } });
    const serialized = JSON.stringify(record);
    // A newline would appear in JSON as the two characters \ and n.
    expect(serialized).not.toContain('\\n');
    expect(serialized.length).toBeLessThan(400);
  });

  it('is empty for anything that is not a report', () => {
    for (const body of [null, 'text', {}, [{ type: 'other' }]]) {
      expect(summarizeCspReport(body)).toEqual([]);
    }
  });
});
