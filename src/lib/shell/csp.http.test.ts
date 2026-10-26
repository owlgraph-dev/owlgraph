// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { STYLE_SRC_PHASE, parseCsp } from '$lib/platform/csp';
import { call, createPage, startApp, type ServedApp } from '$tests/integration/http';
import { txt } from '$tests/e2e/doc';

// The strict style-src as the production build serves it (docs/architecture/overview.md,
// "Content Security Policy"); what a browser does with it is csp-style-src.spec.ts's.

const app = await startApp();
const seed = inject('seed');

const NONCE_SOURCE = /^'nonce-([A-Za-z0-9+/=]+)'$/;

afterAll(async () => {
  if (!app.skipped) await app.close();
});

function styleSrc(header: string | null): string[] {
  expect(header, 'a page response carries a Content-Security-Policy').toBeTruthy();
  return parseCsp(header!).get('style-src') ?? [];
}

function nonceOf(sources: string[]): string | null {
  for (const s of sources) {
    const m = NONCE_SOURCE.exec(s);
    if (m) return m[1];
  }
  return null;
}

async function served(res: Response) {
  return { headers: res.headers, html: await res.text() };
}

function expectStrict({ headers, html }: { headers: Headers; html: string }) {
  const enforced = styleSrc(headers.get('content-security-policy'));
  const reportOnly = headers.get('content-security-policy-report-only');
  const nonces = Array.from(html.matchAll(/<style nonce="([^"]+)"/g), (m) => m[1]);
  expect(nonces.length, 'the theme <style> carries a nonce').toBeGreaterThan(0);
  expect(new Set(nonces).size, 'one nonce per response').toBe(1);

  if (STYLE_SRC_PHASE === 'enforce') {
    expect(enforced).not.toContain("'unsafe-inline'");
    expect(nonceOf(enforced)).toBe(nonces[0]);
    expect(reportOnly).toBeNull();
  } else {
    expect(enforced).toContain("'unsafe-inline'");
    expect(nonceOf(enforced)).toBeNull();
    const reported = styleSrc(reportOnly);
    expect(reported).not.toContain("'unsafe-inline'");
    expect(nonceOf(reported)).toBe(nonces[0]);
    expect(parseCsp(reportOnly!).get('report-uri')).toEqual(['/api/csp-report']);
  }
  // The script half is SvelteKit's: its own nonce, no 'unsafe-inline'.
  const scriptSrc = parseCsp(headers.get('content-security-policy')!).get('script-src') ?? [];
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(nonceOf(scriptSrc)).toBeTruthy();
}

function expectNoStyleAttribute({ html }: { html: string }) {
  expect(html.match(/<[^>]*\sstyle\s*=/g) ?? [], 'style attributes in the served markup').toEqual([]);
}

/** A violation report as a browser sends it. */
const report = (blockedUri = 'inline') => JSON.stringify({ 'csp-report': { 'effective-directive': 'style-src-attr', 'blocked-uri': blockedUri, 'document-uri': 'http://owlgraph.test/' } });
const postReport = (app: ServedApp, from: string, body = report()) =>
  call(app, '/api/csp-report', { method: 'POST', from, headers: { 'content-type': 'application/csp-report' }, body });

describe.skipIf(app.skipped)('strict routes: headers', () => {
  const server = app as ServedApp;

  const strictRoutes: { name: string; path: string; status?: number }[] = [
    { name: 'the login page', path: '/login' },
    { name: 'a public page', path: `/${seed.publicSlug}`, status: 200 },
    { name: 'the home page', path: '/' },
    { name: 'a 404 rendered by the error page', path: '/no-such-page-anywhere', status: 404 },
    { name: 'the About page', path: '/-/about', status: 200 },
  ];
  for (const { name, path, status } of strictRoutes) {
    it(name, async () => {
      const res = await call(server, path);
      if (status) expect(res.status).toBe(status);
      const page = await served(res);
      expectStrict(page);
      expectNoStyleAttribute(page);
    });
  }

  it('the report endpoint takes a report without a session', async () => {
    expect((await postReport(server, '203.0.113.1')).status).toBe(204);
  });
});

describe.skipIf(app.skipped)('the report endpoint’s limits', () => {
  const server = app as ServedApp;

  it('answers a report over 16 KB with a 413', async () => {
    const res = await postReport(server, '203.0.113.11', report('x'.repeat(16 * 1024)));
    expect(res.status).toBe(413);
    // A report within the limit, from the same address, is still taken.
    expect((await postReport(server, '203.0.113.11')).status).toBe(204);
  });

  it('answers the 31st report within a minute from one address with a 429, and another address still with a 204', async () => {
    for (let n = 1; n <= 30; n++) expect((await postReport(server, '203.0.113.12')).status, `report ${n}`).toBe(204);
    expect((await postReport(server, '203.0.113.12')).status).toBe(429);
    expect((await postReport(server, '203.0.113.13')).status).toBe(204);
  });
});

describe.skipIf(app.skipped)('loose routes: headers', () => {
  const server = app as ServedApp;

  it('settings keep unsafe-inline, with no nonce beside it and nothing reported', async () => {
    const res = await call(server, '/settings/profile', { as: 'admin' });
    expect(res.status).toBe(200);
    const enforced = styleSrc(res.headers.get('content-security-policy'));
    expect(enforced).toContain("'unsafe-inline'");
    expect(nonceOf(enforced)).toBeNull();
    expect(res.headers.get('content-security-policy-report-only')).toBeNull();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('the editor is loose too', async () => {
    const res = await call(server, `/${seed.publicSlug}/edit`, { as: 'admin' });
    expect(res.status).toBe(200);
    expect(styleSrc(res.headers.get('content-security-policy'))).toContain("'unsafe-inline'");
  });

  it('the Mermaid render frame is loose and framable by this origin only', async () => {
    const res = await call(server, '/api/embed/mermaid', { as: 'admin' });
    expect(res.status).toBe(200);
    const csp = parseCsp(res.headers.get('content-security-policy')!);
    expect(csp.get('style-src')).toContain("'unsafe-inline'");
    expect(csp.get('frame-ancestors')).toEqual(["'self'"]);
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
});

// Every block kind and emitter: the content tests/e2e/probe-doc.ts gives the
// browser lanes, on this file's seed.
const para = (text: string, attrs?: Record<string, unknown>) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [txt(text)] });
const item = (text: string) => ({ type: 'listItem', content: [para(text)] });
const cell = (attrs: Record<string, unknown>, isHeader: boolean, text: string) => ({ type: 'tableCell', attrs: { isHeader, ...attrs }, content: [txt(text)] });

const probeDoc = () => ({
  type: 'doc',
  attrs: { spacing: { desktop: { blockSpace: 28 } } },
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [txt('Cascade probe')] },
    {
      type: 'heading',
      attrs: { level: 2, typography: { desktop: { size: 'scale:4xl', color: '#b45309', letterSpacing: 0.02 }, phone: { size: 'scale:2xl' } } },
      content: [txt('A heading with its own size, colour and tracking')],
    },
    para('A plain paragraph in the paragraph style the theme gives it.'),
    para('A paragraph set in serif at 20px, semibold, with generous leading.', { typography: { desktop: { family: 'serif', size: 20, lineHeight: 1.8, weight: 'semibold' } } }),
    {
      type: 'paragraph',
      content: [
        txt('Marks: '),
        txt('blue', [{ type: 'typographyColor', attrs: { color: '#2563eb' } }]),
        txt(', '),
        txt('larger', [{ type: 'typographySize', attrs: { size: 'scale:xl' } }]),
        txt(', '),
        txt('bold', [{ type: 'typographyWeight', attrs: { weight: 'bold' } }]),
        txt(', '),
        txt('mono', [{ type: 'typographyFamily', attrs: { family: 'mono' } }]),
        txt(', '),
        txt('tall', [{ type: 'typographyLineHeight', attrs: { lineHeight: 2 } }]),
        txt(', '),
        txt('spaced', [{ type: 'typographyLetterSpacing', attrs: { letterSpacing: 0.1 } }]),
        txt(', and '),
        txt('blue again', [{ type: 'typographyColor', attrs: { color: '#2563eb' } }]),
        txt(' — the same set twice.'),
      ],
    },
    para('This paragraph sits 64px below the one before it.', { spacing: { desktop: { spaceAbove: 64 } } }),
    { type: 'bulletList', attrs: { listStyle: 'square', spacing: 'loose' }, content: [item('Square bullets'), item('Loosely spaced')] },
    { type: 'orderedList', attrs: { listStyle: 'lower-roman' }, content: [item('Roman one'), item('Roman two')] },
    { type: 'blockquote', content: [para('A quoted paragraph.')] },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [txt('const answer: number = 42;\nexport { answer };')] },
    { type: 'horizontalRule' },
    { type: 'callout', attrs: { variant: 'warn' }, content: [txt('A warning callout.')] },
    {
      type: 'htmlBlock',
      attrs: {
        html:
          '<p style="margin:0;color:#dc2626;font-size:var(--type-lg)">Author-styled <span style="background-color:#fde68a;padding:2px 6px;border-radius:4px">inline</span> text</p>' +
          '<div style="display:flex;gap:12px;margin-top:8px"><div style="flex:1;border:1px solid #94a3b8;padding:8px">Left</div><div style="flex:1;padding:8px;text-align:right">Right</div></div>',
      },
    },
    { type: 'htmlBlock', attrs: { scheme: 'dark', html: '<p style="margin:0">A block pinned dark, with <em style="color:#93c5fd">an emphasised run</em>.</p>' } },
    {
      type: 'grid',
      attrs: {
        columnWidths: [1, 2],
        gap: 'lg',
        spacing: { desktop: { pad: 24 }, phone: { pad: 8 } },
        surface: { desktop: { bg: '#f1f5f9', radius: 12, border: '#cbd5e1', shadow: 'md' } },
      },
      content: [
        {
          type: 'gridCell',
          attrs: { surface: { desktop: { bg: '#1e293b' } }, spacing: { desktop: { pad: 16 } }, typography: { desktop: { color: '#f8fafc' } }, alignX: 'center' },
          content: [para('Dark cell')],
        },
        { type: 'gridCell', attrs: { spacing: { desktop: { top: 32 } } }, content: [para('Wide cell, extra top padding')] },
        { type: 'gridCell', attrs: { colSpan: 2, surface: { desktop: { radius: 4, border: '#94a3b8' } } }, content: [para('Spanning cell')] },
      ],
    },
    {
      type: 'flexContainer',
      attrs: {
        layout: { desktop: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }, phone: { flexDirection: 'column' } },
        surface: { desktop: { radius: 8 } },
      },
      content: [1, 2, 3].map((n) => ({ type: 'flexCell', attrs: { surface: { desktop: { bg: '#fee2e2' } }, spacing: { desktop: { pad: 12 } } }, content: [para(`Flex cell ${n}`)] })),
    },
    {
      type: 'table',
      attrs: { columnWidths: [1, 1, 2], surface: { desktop: { bg: '#eef2ff', radius: 8 } } },
      content: [
        { type: 'tableRow', attrs: { isHeader: true }, content: [cell({}, true, 'Name'), cell({}, true, 'Kind'), cell({}, true, 'Notes')] },
        {
          type: 'tableRow',
          attrs: { height: 56 },
          content: [cell({ spacing: { desktop: { pad: 12 } } }, false, 'Padded'), cell({ surface: { desktop: { bg: '#fef3c7' } } }, false, 'Tinted'), cell({}, false, 'A taller row')],
        },
        { type: 'tableRow', content: [cell({}, false, 'Plain'), cell({}, false, 'Plain'), cell({}, false, 'Plain')] },
      ],
    },
    { type: 'image', attrs: { assetId: seed.publicAssetId, alt: 'Seed image', width: 60, widthPhone: 100, boxMode: 'aspect', boxAspect: '16/9', objectFit: 'cover', align: 'left' } },
    { type: 'quickLink', attrs: { refType: 'page', targetPageId: seed.publicId, label: 'A link reference', variant: 'link' } },
    { type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'An outlined reference', variant: 'outlined', surface: { desktop: { border: '#0f766e', radius: 999 } } } },
    {
      type: 'quickLink',
      attrs: { refType: 'document', targetDocId: seed.publicDocId, label: 'A button reference', variant: 'button', surface: { desktop: { bg: '#7c3aed' } }, typography: { desktop: { weight: 'bold' } } },
    },
    {
      type: 'queryBlock',
      attrs: { blockId: 'probe-query', filter: { property: { name: seed.propStatus, operator: 'EQ', value: 'active' } }, first: 5 },
      content: [
        {
          type: 'grid',
          attrs: { columnWidths: [1], surface: { desktop: { border: '#cbd5e1', radius: 6 } } },
          content: [
            {
              type: 'gridCell',
              attrs: { spacing: { desktop: { pad: 12 } } },
              content: [
                { type: 'paragraph', content: [txt('status', [{ type: 'semanticProperty', attrs: { propName: seed.propStatus } }])] },
                { type: 'htmlBlock', attrs: { html: `<p style="margin:0;color:#475569">Status: {{{${seed.propStatus}}}}</p>` } },
              ],
            },
          ],
        },
      ],
    },
    { type: 'diagram', attrs: { code: 'graph LR\n  A[Start] --> B{Decision}\n  B -->|yes| C[Done]\n  B -->|no| D[Retry]' } },
    para('The end.'),
  ],
});

describe.skipIf(app.skipped)('strict routes: the document', () => {
  const server = app as ServedApp;
  let shareToken = '';

  beforeAll(async () => {
    const probe = await createPage(server, 'admin', { doc: probeDoc(), contentScheme: 'adaptive', visibility: 'public' });
    const res = await call(server, `/api/pages/${probe.id}/share-links`, { as: 'admin', json: { label: 'csp gate' } });
    expect(res.ok, await res.clone().text()).toBe(true);
    shareToken = ((await res.json()) as { token: string }).token;
  });

  it('the share link: header and no style attribute', async () => {
    const res = await call(server, `/share/${shareToken}`);
    expect(res.status).toBe(200);
    const page = await served(res);
    expectStrict(page);
    expectNoStyleAttribute(page);
    // The same renderDoc as the page, the quick link's island marker included.
    expect(page.html).toMatch(/data-island="quickLink"[^>]*><!--\[-->.*?class="quick-link quick-link--button/s);
  });
});
