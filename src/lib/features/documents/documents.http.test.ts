// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { parseCsp } from '$lib/platform/csp';
import { upsertRelationshipType } from '$lib/features/semantic/server';
import { call, createPage, startApp, type ServedApp } from '$tests/integration/http';
import { connectAs, textOf } from '$tests/integration/mcp';
import type { Role } from '$tests/integration/users';

// A redirect is read, never followed.

const app = await startApp();
const contentPath = (id: string) => `/api/documents/${id}/content`;

const GERMAN =
  'Die Studie untersucht, wie sich die Verteilung der Ressourcen in städtischen Gebieten in den letzten zehn ' +
  'Jahren verändert hat. Sie zeigt, dass die Effekte in Regionen mit einem hohen Anteil an Mietwohnungen ' +
  'stärker waren und dass die Maßnahmen, die von der Stadt eingeführt wurden, den Trend nicht umkehren ' +
  'konnten. Wir argumentieren, dass dies eine Folge der Art ist, wie die Programme gestaltet wurden.';

describe.skipIf(app.skipped)('documents, served', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  let n = 0;
  const post = (fields: Record<string, string>, file?: File, as: Role = 'editorA') => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (file) form.append('file', file);
    return call(served, '/api/documents', { as, body: form });
  };
  const upload = async (title = `Minutes ${++n}`, text = `text of ${title}`, as: Role = 'editorA') => {
    const res = await post({ title }, new File([text], `${title}.txt`, { type: 'text/plain' }), as);
    expect(res.status).toBe(200);
    return { ...((await res.json()) as { id: string; slug: string }), title, filename: `${title}.txt` };
  };
  const link = async (url: string, title = `Link ${++n}`) => {
    const res = await post({ source: 'link', externalUrl: url, title });
    expect(res.status).toBe(200);
    return { ...((await res.json()) as { id: string; slug: string }), title };
  };
  const expectRedirectsTo = async (path: string, url: string, as?: Role) => {
    const res = await call(served, path, { as });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(url);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toContain('no-store');
  };
  const documentCount = async () => Number((await db<{ n: string }[]>`select count(*) as n from documents`)[0].n);
  const dom = async (path: string, as?: Role) => new JSDOM(await (await call(served, path, { as })).text()).window.document;
  const block = (blockId: string, nodeId: string, attrs: Record<string, unknown> = {}) => ({ type: 'documentBlock', attrs: { blockId, nodeId, ...attrs } });

  describe('a link document', () => {
    it('is refused for a javascript: or file: address and for a blank title; a doi: address is stored as its https://doi.org URL, its content redirects there, and its page offers to open it', async () => {
      expect((await post({ source: 'link', externalUrl: 'javascript:alert(1)', title: 'Bad' })).status).toBe(400);
      expect((await post({ source: 'link', externalUrl: 'file:///etc/passwd', title: 'Bad' })).status).toBe(400);
      expect((await post({ source: 'link', externalUrl: 'https://example.org/paper.pdf', title: '  ' })).status).toBe(400);

      const created = await link('doi:10.1000/linked', 'Normalized DOI');
      await expectRedirectsTo(contentPath(created.id), 'https://doi.org/10.1000/linked', 'editorA');
      const open = (await dom(`/${created.slug}`, 'editorA')).querySelector('a[aria-label^="Open: "]')!;
      expect(open.getAttribute('aria-label')).toBe('Open: doi.org (new tab)');
      expect(open.getAttribute('href')).toBe(contentPath(created.id));
      expect(open.getAttribute('target')).toBe('_blank');
      expect(open.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('takes a new address by PUT, and nothing but a file or an address — a viewer gets 404 for a restricted one, never the redirect', async () => {
      const created = await link('https://example.org/a');
      expect((await call(served, contentPath(created.id), { as: 'editorA', method: 'PUT', body: 'https://example.org/b', headers: { 'content-type': 'text/plain' } })).status).toBe(415);
      expect((await call(served, contentPath(created.id), { as: 'editorA', method: 'PUT', json: { externalUrl: 'javascript:alert(1)' } })).status).toBe(400);
      expect((await call(served, contentPath(created.id), { as: 'editorA', method: 'PUT', json: { externalUrl: 'https://example.org/b' } })).ok).toBe(true);
      await expectRedirectsTo(contentPath(created.id), 'https://example.org/b', 'editorA');

      expect((await call(served, `/api/documents/${created.id}`, { as: 'editorA', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      expect((await call(served, contentPath(created.id), { as: 'viewer' })).status).toBe(404);
      expect((await call(served, contentPath(created.id), { as: 'viewer', method: 'PUT', json: { externalUrl: 'https://example.org/c' } })).ok).toBe(false);
    });

    it('switched to an upload by PUT serves the file’s bytes, no redirect, and its page offers Download and no Open', async () => {
      const created = await link('https://example.org/report');
      const form = new FormData();
      form.append('file', new File(['The report itself.'], 'report.txt', { type: 'text/plain' }));
      expect((await call(served, contentPath(created.id), { as: 'editorA', method: 'PUT', body: form })).ok).toBe(true);
      const content = await call(served, contentPath(created.id), { as: 'editorA' });
      expect(content.status).toBe(200);
      expect(await content.text()).toBe('The report itself.');
      const page = await dom(`/${created.slug}`, 'editorA');
      expect(page.querySelector('a[aria-label^="Open: "]')).toBeNull();
      expect([...page.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Download')).toBe(true);
    });

    it('read through a share link, shows its title and an Open action to the share’s content, which redirects to the address, no-store', async () => {
      const created = await link('https://example.org/shared', 'Shared link doc');
      const { token } = (await (await call(served, `/api/documents/${created.id}/share-links`, { as: 'editorA', json: { label: 'link doc' } })).json()) as { token: string };
      const page = await dom(`/share/${token}`);
      expect(page.querySelector('h1')?.textContent?.trim()).toBe('Shared link doc');
      const open = page.querySelector('a[aria-label^="Open: "]')!;
      expect(open.getAttribute('aria-label')).toBe('Open: example.org (new tab)');
      expect(open.getAttribute('href')).toBe(`/share/${token}/content`);
      expect(open.getAttribute('rel')).toBe('noopener noreferrer');
      await expectRedirectsTo(`/share/${token}/content`, 'https://example.org/shared');
    });

    it('is mapped by a query list following a page’s edges to documents with an external address: only the link, its address the href with its query intact, rel noopener', async () => {
      await upsertRelationshipType({ slug: 'cites-it', label: { en: 'Cites' } });
      const cited = await link('https://example.org/cited?x=1&y=2', 'Cited paper');
      const uploaded = await upload('Cited upload');
      const quickLink = (id: string, docId: string) => ({ type: 'quickLink', attrs: { blockId: id, refType: 'document', targetDocId: docId, label: id, relationshipType: 'cites-it' } });
      const page = await createPage(served, 'editorA', {
        doc: {
          type: 'doc',
          content: [
            quickLink('ref-linked', cited.id),
            quickLink('ref-uploaded', uploaded.id),
            {
              type: 'queryBlock',
              attrs: {
                blockId: 'literature',
                fromCurrentPage: true,
                traversal: { start: {}, steps: [{ edge: { type: 'cites-it', direction: 'OUTGOING' }, targetFilter: { intrinsic: { field: 'EXTERNAL_URL', operator: 'EXISTS' } }, repeat: 1 }] },
                first: 20,
              },
              content: [
                { type: 'grid', attrs: { columnWidths: [1] }, content: [{ type: 'gridCell', content: [{ type: 'htmlBlock', attrs: { html: '<a class="lit" href="{{{externalUrl}}}">{{{title}}}</a>' } }] }] },
              ],
            },
          ],
        },
      });
      const items = [...(await dom(`/${page.slug}`, 'editorA')).querySelectorAll('.query-block-instance a.lit')];
      expect(items).toHaveLength(1);
      expect(items[0].getAttribute('href')).toBe('https://example.org/cited?x=1&y=2');
      expect(items[0].getAttribute('rel')).toMatch(/noopener/);
    });

    it('never has its address fetched by the server — not when it is made or changed, not when its content is served, not when it is indexed or its page read', async () => {
      let requests = 0;
      const elsewhere: Server = createServer((_, res) => {
        requests++;
        res.end('fetched');
      });
      await new Promise<void>((done) => elsewhere.listen(0, '127.0.0.1', done));
      const at = (path: string) => `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}${path}`;
      try {
        const created = await link(at('/paper'), 'Never fetched');
        expect((await call(served, contentPath(created.id), { as: 'editorA', method: 'PUT', json: { externalUrl: at('/moved') } })).ok).toBe(true);
        expect((await call(served, contentPath(created.id), { as: 'editorA' })).status).toBe(302);
        expect((await call(served, `/${created.slug}`, { as: 'editorA' })).status).toBe(200);
        expect((await call(served, `/search?q=${encodeURIComponent('Never fetched')}`, { as: 'editorA' })).status).toBe(200);
        expect(requests).toBe(0);
      } finally {
        await new Promise((done) => elsewhere.close(done));
      }
    });

    it('whose stored address is no http(s) URL — a row written past the API — answers 404 for its content and through its share link, never a redirect', async () => {
      const created = await link('https://example.org/fine', 'Broken address');
      const { token } = (await (await call(served, `/api/documents/${created.id}/share-links`, { as: 'editorA', json: {} })).json()) as { token: string };
      await db`update documents set external_url = 'javascript:alert(1)' where id = ${created.id}`;
      expect((await call(served, contentPath(created.id), { as: 'editorA' })).status).toBe(404);
      expect((await call(served, `/share/${token}/content`)).status).toBe(404);
    });
  });

  describe('an upload', () => {
    it('of an unsupported type answers 415 naming it; a declared PDF without the %PDF- signature, or a text holding NUL bytes, answers 415 too; nothing is stored', async () => {
      const before = await documentCount();
      const zip = await post({ title: 'An archive' }, new File(['PK'], 'archive.zip', { type: 'application/zip' }));
      expect(zip.status).toBe(415);
      expect(await zip.text()).toContain('application/zip');
      expect((await post({ title: 'A disguise' }, new File(['<html><script>alert(1)</script></html>'], 'paper.pdf', { type: 'application/pdf' }))).status).toBe(415);
      expect((await post({ title: 'Binary text' }, new File(['plain\u0000text'], 'notes.txt', { type: 'text/plain' }))).status).toBe(415);
      expect(await documentCount()).toBe(before);
    });

    it('is read by an editor who does not own it, who can neither replace its content nor switch its source, and it stays as it was', async () => {
      const own = await upload('Owned by editorA', 'the original text');
      expect((await call(served, contentPath(own.id), { as: 'editorB' })).status).toBe(200);
      const form = new FormData();
      form.append('file', new File(['replaced'], 'replaced.txt', { type: 'text/plain' }));
      expect((await call(served, contentPath(own.id), { as: 'editorB', method: 'PUT', body: form })).ok).toBe(false);
      expect((await call(served, contentPath(own.id), { as: 'editorB', method: 'PUT', json: { externalUrl: 'https://example.org/elsewhere' } })).ok).toBe(false);
      const content = await call(served, contentPath(own.id), { as: 'editorA' });
      expect(content.status).toBe(200);
      expect(await content.text()).toBe('the original text');
    });

    it('served as text through a share link carries the same sandbox, default-src none and nosniff, and its download is an attachment', async () => {
      const text = await upload('Shared notes');
      const { token } = (await (await call(served, `/api/documents/${text.id}/share-links`, { as: 'editorA', json: {} })).json()) as { token: string };
      const res = await call(served, `/share/${token}/content`);
      expect(res.status).toBe(200);
      const csp = parseCsp(res.headers.get('content-security-policy') ?? '');
      expect(csp.get('default-src')).toEqual(["'none'"]);
      expect(csp.has('sandbox')).toBe(true);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect((await call(served, `/share/${token}/content?download`)).headers.get('content-disposition')).toMatch(/^attachment;/);
    });

    it('of German text on an English site stays English and carries German as its suggestion; taking it sets German, dismissing it keeps English, and either way the suggestion goes', async () => {
      const stateOf = async (id: string) => (await db<{ locale: string; detected_locale: string | null }[]>`select n.locale, d.detected_locale from nodes n join documents d on d.id = n.id where n.id = ${id}`)[0];
      const taken = await upload('Deutsche Studie', GERMAN);
      expect(await stateOf(taken.id)).toEqual({ locale: 'en', detected_locale: 'de' });
      expect((await call(served, `/api/documents/${taken.id}`, { as: 'editorA', method: 'PATCH', json: { locale: 'de' } })).ok).toBe(true);
      expect(await stateOf(taken.id)).toEqual({ locale: 'de', detected_locale: null });

      const dismissed = await upload('Deutsche Studie verworfen', GERMAN);
      expect((await call(served, `/api/documents/${dismissed.id}`, { as: 'editorA', method: 'PATCH', json: { dismissLocaleSuggestion: true } })).ok).toBe(true);
      expect(await stateOf(dismissed.id)).toEqual({ locale: 'en', detected_locale: null });
    });
  });

  describe('the document block', () => {
    it('draws a card by its node, and a link document beside the page with its host, never its address, and nothing to download', async () => {
      const minutes = await upload();
      const cited = await link('https://doi.org/10.1000/xyz123', 'Cited by block');
      const page = await createPage(served, 'admin', { doc: { type: 'doc', content: [block('card', minutes.id, { variant: 'card' }), block('link', cited.id)] } });
      const html = await (await call(served, `/${page.slug}`)).text();
      expect(html).not.toContain('10.1000/xyz123');
      const document = new JSDOM(html).window.document;
      const card = document.querySelector('[data-block-id="card"]')!;
      expect(card.querySelector('.de-title-text')?.textContent?.trim()).toBe(minutes.title);
      expect(card.querySelector('.de-tile-type')?.textContent?.trim()).toBe('TXT');
      const entry = document.querySelector('[data-block-id="link"] a.de-entry')!;
      expect(entry.getAttribute('rel')).toBe('noopener noreferrer');
      expect(entry.getAttribute('target')).toBe('_blank');
      const linkBlock = document.querySelector('[data-block-id="link"]')!;
      expect(linkBlock.textContent).toContain('External document');
      expect(linkBlock.textContent).toContain('doi.org');
      expect([...linkBlock.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Download')).toBe(false);
    });

    it('renders nothing of a document the reader may not read, on the page and through a share link; its owner sees it', async () => {
      const secret = await upload('Secret minutes');
      expect((await call(served, `/api/documents/${secret.id}`, { as: 'editorA', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      const open = await upload('Open minutes');
      const page = await createPage(served, 'editorA', { doc: { type: 'doc', content: [block('secret', secret.id), block('open', open.id)] } });
      const { token } = (await (await call(served, `/api/pages/${page.id}/share-links`, { as: 'editorA', json: {} })).json()) as { token: string };
      for (const path of [`/${page.slug}`, `/share/${token}`]) {
        const html = await (await call(served, path)).text();
        expect(html, path).not.toContain('data-block-id="secret"');
        expect(html, path).not.toContain(secret.title);
        expect(html, path).toContain('data-block-id="open"');
      }
      expect((await dom(`/${page.slug}`, 'editorA')).querySelector('[data-block-id="secret"] .de-title-text')?.textContent?.trim()).toBe(secret.filename);
    });

    it('is authored by an agent as a card and named in get_page; the page then shows the card', async () => {
      const minutes = await upload(undefined, undefined, 'admin');
      const page = await createPage(served, 'admin');
      const agent = await connectAs('admin');
      expect(textOf(await agent.callTool({ name: 'append_block', arguments: { pageId: page.id, block: { kind: 'document', nodeId: minutes.id, variant: 'card' } } }))).toMatch(/Appended block \S+/);
      expect(textOf(await agent.callTool({ name: 'get_page', arguments: { pageId: page.id } }))).toContain(`document \\"${minutes.title}\\" · ${minutes.filename}`);
      expect((await dom(`/${page.slug}`, 'admin')).querySelector('.document-block .de--card .de-title-text')?.textContent?.trim()).toBe(minutes.title);
    });
  });
});
