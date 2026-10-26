// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, createPage, startApp, type ServedApp } from '$tests/integration/http';
import { userOf, type Role } from '$tests/integration/users';

// The routes check the permission themselves: the Create button is UX only.
// The dialog itself is the browser's (e2e/create-content.spec.ts).

// adapter-node reads the body limit when the handler is imported: the one the
// e2e servers and production set (docs/guides/testing.md, "Servers").
process.env.BODY_SIZE_LIMIT = '26M';
const app = await startApp();

afterAll(async () => {
  if (!app.skipped) await app.close();
});

function upload(name: string, type: string, bytes: BlobPart): FormData {
  const form = new FormData();
  form.append('file', new File([bytes], name, { type }));
  return form;
}

const nodeCount = async () => (await db<{ n: number }[]>`select count(*)::int as n from nodes`)[0].n;

describe.skipIf(app.skipped)('creating content through the Create dialog’s routes', () => {
  const served = app as ServedApp;
  const createPageAs = (as?: Role) => call(served, '/api/pages', { as, method: 'POST' });
  const uploadAs = (as?: Role, form = upload('note.txt', 'text/plain', 'hi')) => call(served, '/api/documents', { as, body: form });

  describe('without a session', () => {
    it('answers POST /api/pages with 401 and makes no page', async () => {
      const before = await nodeCount();
      const res = await createPageAs();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } });
      expect(await nodeCount()).toBe(before);
    });

    it('answers a multipart POST /api/documents with 401 and makes no document', async () => {
      const before = await nodeCount();
      const res = await uploadAs();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } });
      expect(await nodeCount()).toBe(before);
    });
  });

  describe('as a viewer', () => {
    it('answers POST /api/pages with 403 forbidden and makes no page', async () => {
      const before = await nodeCount();
      const res = await createPageAs('viewer');
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('forbidden');
      expect(await nodeCount()).toBe(before);
    });

    it('answers a multipart POST /api/documents with 403 forbidden and makes no document', async () => {
      const before = await nodeCount();
      const res = await uploadAs('viewer');
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('forbidden');
      expect(await nodeCount()).toBe(before);
    });
  });

  describe('as an editor', () => {
    it('answers POST /api/pages with 200 and the new page’s id, a blank page of theirs', async () => {
      const res = await createPageAs('editorA');
      expect(res.status).toBe(200);
      const { id } = (await res.json()) as { id: unknown };
      expect(typeof id).toBe('string');
      const [stored] = await db<{ type: string; created_by: string; title: string }[]>`select type, created_by, title from nodes where id = ${id as string}`;
      expect(stored).toEqual({ type: 'page', created_by: (await userOf('editorA')).id, title: 'Untitled' });
    });

    it('answers a multipart POST /api/documents of a text file with 200 and the new document’s id, the file stored as theirs', async () => {
      const res = await uploadAs('editorA');
      expect(res.status).toBe(200);
      const { id } = (await res.json()) as { id: unknown };
      expect(typeof id).toBe('string');
      const [stored] = await db<{ type: string; created_by: string; filename: string; mime: string; bytes: Buffer }[]>`
        select n.type, n.created_by, d.filename, d.mime, d.bytes from nodes n join documents d on d.id = n.id where n.id = ${id as string}`;
      expect(stored).toMatchObject({ type: 'document', created_by: (await userOf('editorA')).id, filename: 'note.txt', mime: 'text/plain' });
      expect(Buffer.from(stored.bytes).toString('utf8')).toBe('hi');
    });

    it('answers an upload over the body limit production sets with 413, and one under it — past the adapter’s own default — with 200', async () => {
      const before = await nodeCount();
      const oversized = await uploadAs('editorA', upload('big.txt', 'text/plain', new Uint8Array(26 * 1024 * 1024)));
      expect(oversized.status).toBe(413);
      expect(await nodeCount()).toBe(before);
      // 1 MB: above adapter-node's 512K default, so the limit set is the one read.
      const fits = await uploadAs('editorA', upload('fits.txt', 'text/plain', 'a'.repeat(1024 * 1024)));
      expect(fits.status, await fits.clone().text()).toBe(200);
    });
  });
});

describe.skipIf(app.skipped)('the app bar a page is served with', () => {
  const served = app as ServedApp;

  /** The server-rendered app bar's Edit links; anonymous without a role. */
  async function editLinks(slug: string, role?: Role) {
    const res = await call(served, `/${slug}`, { as: role });
    expect(res.status, `/${slug} as ${role ?? 'anonymous'}`).toBe(200);
    const nav = new JSDOM(await res.text()).window.document.querySelector('nav[aria-label="Primary"]');
    expect(nav, 'the app bar').not.toBeNull();
    return [...nav!.querySelectorAll<HTMLAnchorElement>('a[aria-label="Edit"]')].map((a) => a.getAttribute('href'));
  }

  it('offers Edit only to a viewer who may write the page: none for a viewer or a visitor, one for its owner', async () => {
    // Public (the test seed's default namespace), so every role may read it.
    const { slug } = await createPage(served, 'editorA', { title: 'App bar edit probe' });
    expect(await editLinks(slug, 'viewer')).toEqual([]);
    expect(await editLinks(slug)).toEqual([]);
    expect(await editLinks(slug, 'editorA')).toEqual([`/${slug}/edit`]);
  });
});
