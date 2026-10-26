// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import sharp from 'sharp';
import { db } from '$lib/platform/db.server';
import { call, createNamespace, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';
import { userOf } from '$tests/integration/users';
import type { Role } from '$tests/integration/users';

// editorA owns the seeded restricted page and document; editorB is shared on
// both; editorC on neither.

const app = await startApp();
const seed = inject('seed');

/** A 1600 × 900 photo as a phone saves it: with the camera and the position it was taken at. */
const photo = () =>
  sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 70, g: 100, b: 140 } } })
    .withExif({ IFD0: { Make: 'PhoneCo', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 8/1 0/1' } })
    .jpeg()
    .toBuffer();

const multipart = async (fields: Record<string, string>, file: File) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', file);
  return form;
};

describe.skipIf(app.skipped)('serving media', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  const upload = (as: Role, pageId: string) =>
    photo().then(async (bytes) => call(served, '/api/media', { as, body: await multipart({ pageId }, new File([bytes], 'photo.jpg', { type: 'image/jpeg' })) }));
  const uploaded = async (as: Role, pageId: string) => {
    const res = await upload(as, pageId);
    expect(res.status, 'upload a photo').toBe(200);
    return (await res.json()) as { id: string; size: { width: number; height: number; variants: boolean } | null };
  };
  const bytesOf = async (res: Response) => Buffer.from(await res.arrayBuffer());

  describe('an uploaded image', () => {
    it('is stored without its metadata and measured; its copies are WebP at the widths of the ladder', async () => {
      const { id: pageId } = await createPage(served, 'editorA');
      const image = await uploaded('editorA', pageId);
      expect(image.size).toEqual({ width: 1600, height: 900, variants: true });

      const original = await call(served, `/api/media/${image.id}`, { as: 'editorA' });
      expect(original.headers.get('content-type')).toBe('image/jpeg');
      expect((await sharp(await bytesOf(original)).metadata()).exif).toBeUndefined();

      const copy = await call(served, `/api/media/${image.id}?w=640`, { as: 'editorA' });
      expect(copy.headers.get('content-type')).toBe('image/webp');
      const m = await sharp(await bytesOf(copy)).metadata();
      expect({ width: m.width, height: m.height }).toEqual({ width: 640, height: 360 });

      // A width off the ladder is refused; one as wide as the image or wider is the image itself.
      expect((await call(served, `/api/media/${image.id}?w=500`, { as: 'editorA' })).status).toBe(400);
      expect((await call(served, `/api/media/${image.id}?w=2560`, { as: 'editorA' })).headers.get('content-type')).toBe('image/jpeg');
    });

    it('a revisit with the ETag of the original or of a copy is told 304 with the same ETag, the content hash', async () => {
      const { id: pageId } = await createPage(served, 'editorA');
      const image = await uploaded('editorA', pageId);
      for (const path of [`/api/media/${image.id}`, `/api/media/${image.id}?w=640`]) {
        const etag = (await call(served, path, { as: 'editorA' })).headers.get('etag');
        expect(etag, path).toMatch(/^"[0-9a-f]{64}(-w640)?"$/);
        const again = await call(served, path, { as: 'editorA', headers: { 'if-none-match': etag! } });
        expect(again.status, path).toBe(304);
        expect(again.headers.get('etag')).toBe(etag);
      }
    });

    it('is refused with 403 to an uploader who may not write the page, and no asset is stored', async () => {
      const assetsOf = async (pageId: string) => Number((await db<{ n: string }[]>`select count(*) as n from assets where owner_page_id = ${pageId}`)[0].n);
      const before = { restricted: await assetsOf(seed.restrictedId), public: await assetsOf(seed.publicId) };
      expect((await upload('editorC', seed.restrictedId)).status).toBe(403);
      expect((await upload('viewer', seed.publicId)).status).toBe(403);
      expect({ restricted: await assetsOf(seed.restrictedId), public: await assetsOf(seed.publicId) }).toEqual(before);
    });
  });

  describe('who is served an image', () => {
    it('anyone gets a public page’s image, cacheable', async () => {
      const res = await call(served, `/api/media/${seed.publicAssetId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('public');
    });

    it('an anonymous visitor gets 404 for a restricted page’s image', async () => {
      expect((await call(served, `/api/media/${seed.restrictedAssetId}`)).status).toBe(404);
    });

    it('an editor the restricted page is not shared with gets 404 for its image', async () => {
      expect((await call(served, `/api/media/${seed.restrictedAssetId}`, { as: 'editorC' })).status).toBe(404);
    });

    it('the editor the restricted page is shared with gets its image, never stored (no-store)', async () => {
      const res = await call(served, `/api/media/${seed.restrictedAssetId}`, { as: 'editorB' });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('a restricted page’s copy is its owner’s, no-store, and 404 to an anonymous visitor', async () => {
      const { id: pageId } = await createPage(served, 'editorA', { visibility: 'restricted' });
      const image = await uploaded('editorA', pageId);
      const own = await call(served, `/api/media/${image.id}?w=640`, { as: 'editorA' });
      expect(own.status).toBe(200);
      expect(own.headers.get('cache-control')).toContain('no-store');
      expect((await call(served, `/api/media/${image.id}?w=640`)).status).toBe(404);
    });

    it('a reader who may not see an image gets 404 even when sending its ETag, never a 304', async () => {
      const etag = (await call(served, `/api/media/${seed.restrictedAssetId}`, { as: 'editorA' })).headers.get('etag')!;
      expect(etag).toBeTruthy();
      for (const as of [undefined, 'editorC'] as const) {
        expect((await call(served, `/api/media/${seed.restrictedAssetId}`, { as, headers: { 'if-none-match': etag } })).status).toBe(404);
      }
    });

    it('a page inheriting public from its namespace has its image served cacheable; one inheriting internal, no-store', async () => {
      const cacheFor = async (accessLevel: 'public' | 'internal', reader?: Role) => {
        const namespaceId = await createNamespace(served, { name: `Media ${accessLevel}`, slug: `media-${accessLevel}`, accessLevel });
        const { id: pageId } = await createPage(served, 'editorA', { namespaceId });
        const image = await uploaded('editorA', pageId);
        const res = await call(served, `/api/media/${image.id}`, { as: reader });
        expect(res.status, accessLevel).toBe(200);
        return res.headers.get('cache-control') ?? '';
      };
      expect(await cacheFor('public')).toContain('public');
      expect(await cacheFor('internal', 'viewer')).toContain('no-store');
    });

    it('a user’s avatar is served at /api/media/avatar/<userId> to anyone, never by its asset id, even to its owner', async () => {
      const viewer = await userOf('viewer');
      const avatar = new File([await photo()], 'me.jpg', { type: 'image/jpeg' });
      expect((await formAction(served, '/settings/profile?/uploadAvatar', {}, { as: 'viewer', files: { file: avatar } })).type).toBe('success');
      const [asset] = await db<{ id: string }[]>`select id from assets where owner_user_id = ${viewer.id} and kind = 'avatar'`;

      const byUser = await call(served, `/api/media/avatar/${viewer.id}`);
      expect(byUser.status).toBe(200);
      expect(byUser.headers.get('content-type')).toMatch(/^image\//);
      expect((await call(served, `/api/media/${asset.id}`, { as: 'viewer' })).status).toBe(404);
    });
  });

  describe('a document’s bytes and its read view', () => {
    it('an anonymous visitor opening an internal document’s read view is sent to sign in', async () => {
      const res = await call(served, `/${seed.docSlug}`);
      expect(res.status).toBe(303);
      expect(new URL(res.headers.get('location')!, served.origin).pathname).toBe('/login');
    });

    it('an anonymous visitor gets 404 for an internal document’s bytes', async () => {
      expect((await call(served, `/api/documents/${seed.docId}/content`)).status).toBe(404);
    });

    it('an anonymous visitor gets the public document’s read view, its title the heading', async () => {
      const res = await call(served, `/${seed.publicDocSlug}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toMatch(/<h1[^>]*>\s*Public Document\s*<\/h1>/);
    });

    it('an anonymous visitor gets the public document’s bytes, cacheable', async () => {
      const res = await call(served, `/api/documents/${seed.publicDocId}/content`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('public');
    });

    it('an anonymous visitor gets 404 for the restricted document’s bytes', async () => {
      expect((await call(served, `/api/documents/${seed.restrictedDocId}/content`)).status).toBe(404);
    });

    it('a signed-in viewer gets an internal document’s bytes, no-store', async () => {
      const res = await call(served, `/api/documents/${seed.docId}/content`, { as: 'viewer' });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('a viewer, and an editor the restricted document is not shared with, get 404 for its bytes', async () => {
      expect((await call(served, `/api/documents/${seed.restrictedDocId}/content`, { as: 'viewer' })).status).toBe(404);
      expect((await call(served, `/api/documents/${seed.restrictedDocId}/content`, { as: 'editorC' })).status).toBe(404);
    });

    it('the editor the restricted document is shared with gets its bytes, no-store', async () => {
      const res = await call(served, `/api/documents/${seed.restrictedDocId}/content`, { as: 'editorB' });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('the owner of a restricted document is offered its editor; an editor it is not shared with gets 404 for the read view and is sent home from the editor', async () => {
      // The test's own document: opening the editor takes its edit lock.
      const file = new File(['integration: owner doc'], 'Owner doc.txt', { type: 'text/plain' });
      const created = await call(served, '/api/documents', { as: 'editorA', body: await multipart({ title: 'Owner doc' }, file) });
      expect(created.status).toBe(200);
      const { id, slug } = (await created.json()) as { id: string; slug: string };
      expect((await call(served, `/api/documents/${id}`, { as: 'editorA', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);

      const view = await call(served, `/${slug}`, { as: 'editorA' });
      expect(view.status).toBe(200);
      expect(await view.text()).toMatch(new RegExp(`<a[^>]*href="/${slug}/edit"`));
      expect((await call(served, `/${slug}/edit`, { as: 'editorA' })).status).toBe(200);

      expect((await call(served, `/${slug}`, { as: 'editorC' })).status).toBe(404);
      const edit = await call(served, `/${slug}/edit`, { as: 'editorC' });
      expect(edit.status).toBe(303);
      expect(new URL(edit.headers.get('location')!, served.origin).pathname).toBe('/');
    });
  });
});
