// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTE_SEGMENTS, routePattern, safeUrl } from './safeUrl';

const ORIGIN = 'https://cms.example.com';
// The shape createShareLink produces: 24 random bytes, base64url.
const TOKEN = 'FAKEshareTOKENforTESTS00';

describe('safeUrl keeps capability tokens out of logs', () => {
  it('reduces a share URL to its route pattern', () => {
    for (const input of [
      `${ORIGIN}/share/${TOKEN}`,
      `${ORIGIN}/share/${TOKEN}?download`,
      `${ORIGIN}/share/${TOKEN}#section`,
      `/share/${TOKEN}`,
    ]) {
      const out = safeUrl(input, { origin: ORIGIN });
      expect(out, input).toBe('/share/[id]');
      expect(out).not.toContain(TOKEN);
    }
    expect(safeUrl(`${ORIGIN}/share/${TOKEN}/content?download`, { origin: ORIGIN })).toBe('/share/[id]/content');
  });

  it('never leaks the token even when the origin is unknown', () => {
    // No opts.origin: the URL reads as external, so only the origin survives.
    expect(safeUrl(`${ORIGIN}/share/${TOKEN}`)).toBe(`${ORIGIN}/…`);
  });

  it('drops the query string, where search terms live', () => {
    expect(safeUrl('/api/node-search?q=confidential%20project', { origin: ORIGIN })).toBe('/api/node-search');
  });

  it('drops userinfo from an absolute URL', () => {
    const out = safeUrl('https://user:hunter2@evil.example/a/b', { origin: ORIGIN });
    expect(out).toBe('https://evil.example/…');
    expect(out).not.toContain('hunter2');
  });
});

describe('safeUrl', () => {
  it('keeps CSP keywords, which are not URLs', () => {
    expect(safeUrl('inline')).toBe('inline');
    expect(safeUrl('eval')).toBe('eval');
    expect(safeUrl('Inline')).toBe('inline');
  });

  it('reduces a non-http scheme to the scheme alone', () => {
    expect(safeUrl('chrome-extension://abcdefghijklmnop/inject.js')).toBe('chrome-extension:…');
    expect(safeUrl('data:text/html,<b>x</b>')).toBe('data:…');
  });

  it('keeps build output verbatim — generated names, no authored value', () => {
    expect(safeUrl(`${ORIGIN}/_app/immutable/chunks/BpQ7x.js`, { origin: ORIGIN })).toBe(
      '/_app/immutable/chunks/BpQ7x.js'
    );
  });

  it('handles the empty and unusable cases without echoing the input', () => {
    expect(safeUrl('')).toBe('');
    expect(safeUrl(null)).toBe('');
    expect(safeUrl(42)).toBe('');
    expect(safeUrl('http://[oops')).toBe('(unparsable)');
  });

  it('bounds its output', () => {
    expect(safeUrl('/' + 'a/'.repeat(500), { origin: ORIGIN }).length).toBeLessThanOrEqual(200);
    expect(safeUrl(`https://${'x'.repeat(400)}.example/a`).length).toBeLessThanOrEqual(200);
  });
});

describe('routePattern', () => {
  it('keeps the literal segments of real routes', () => {
    expect(routePattern('/')).toBe('/');
    expect(routePattern('/settings/schema/properties')).toBe('/settings/schema/properties');
    expect(routePattern('/api/health')).toBe('/api/health');
    expect(routePattern('/api/media/avatar/6f1c-uuid')).toBe('/api/media/avatar/[id]');
    expect(routePattern('/api/pages/6f1c-uuid/lock/heartbeat')).toBe('/api/pages/[id]/lock/heartbeat');
  });

  it('rewrites authored segments — a page slug is content', () => {
    expect(routePattern('/quarterly-board-notes')).toBe('/[id]');
    expect(routePattern('/hr/salary-bands/edit')).toBe('/[id]/[id]/edit');
  });
});

// A missing segment is no leak (it becomes '[id]'), but it silently loses
// detail in every log line for that route.
describe('ROUTE_SEGMENTS covers the route tree', () => {
  it('holds every literal directory segment under src/routes', () => {
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        // '[' dynamic (incl. '[[namespace=namespace]]'), '(' layout group, '+' never a directory here.
        if (!entry.name.startsWith('[') && !entry.name.startsWith('(') && !entry.name.startsWith('+')) {
          found.add(entry.name);
        }
        walk(join(dir, entry.name));
      }
    };
    walk(join(process.cwd(), 'src', 'routes'));

    expect(found.size).toBeGreaterThan(20);
    for (const segment of found) {
      expect(ROUTE_SEGMENTS.has(segment), `src/routes/**/${segment} is missing from ROUTE_SEGMENTS`).toBe(true);
    }
  });
});
