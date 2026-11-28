// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { setSpaceMembers } from '#lib/features/spaces/server.ts';
import { call, createPage, createSpace, startApp, type CallOptions, type ServedApp } from '#tests/integration/http.ts';
import { userOf } from '#tests/integration/users.ts';

// 002.21 over HTTP: what an address under a restricted space answers, beside
// what one under no space answers. Spaces are made through the settings, where
// the served app's route matcher learns of them.

const app = await startApp();

describe.skipIf(app.skipped)('an address under a restricted space', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  /**
   * Everything an answer says — its status, its redirect, its headers, its
   * page — with the values each response makes afresh set aside (its nonces,
   * its error's id, the ids its menus generate, its date and length), and the
   * first segment of `path` read as SPACE wherever it shows.
   */
  const said = async (path: string, options: CallOptions) => {
    const res = await call(served, path, options);
    let text = `${res.status} ${res.headers.get('location') ?? ''}\n`;
    for (const [name, value] of [...res.headers].sort()) if (!['date', 'content-length', 'etag'].includes(name)) text += `${name}: ${value}\n`;
    text += await res.text();
    const fresh = [
      // The response's nonces: in its style policy, on its elements, in its data.
      ...[...text.matchAll(/'nonce-([^']+)'|\bnonce="([^"]+)"|\bstyleNonce:"([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? m[3]),
      // An error's id, in a page's script or a data address's JSON.
      ...[...text.matchAll(/\berror:\s*\{[^}]*\bid:"([^"]+)"/g)].map((m) => m[1]),
      ...[...text.matchAll(/^\{"status":\d+,"message":"[^"]*","id":"([^"]+)"\}$/gm)].map((m) => m[1]),
    ];
    for (const value of fresh) text = text.replaceAll(value, 'FRESH');
    return text.replace(/\bbits-\d+/g, 'bits-N').replaceAll(path.split('/')[1], 'SPACE');
  };

  it('002.21 an address under a restricted space answers a visitor, a viewer and an editor it does not admit exactly as an address under no space', async () => {
    const closed = 'closed-garden';
    const nowhere = 'nowhere-garden';
    const spaceId = await createSpace(served, { name: 'Closed garden', slug: closed, accessLevel: 'restricted' });
    await setSpaceMembers(spaceId, [(await userOf('editorA')).id]);
    const inside = await createPage(served, 'admin', { spaceId, title: 'Behind the wall' });

    const tails = ['/x', '/x/', '/edit', '/x/edit', '/x/__data.json', '/x/edit/__data.json', `/${inside.slug}`, `/${inside.slug}/edit`];
    for (const asker of [{}, { as: 'viewer' }, { as: 'editorC' }] as CallOptions[]) {
      for (const tail of tails) {
        const what = `${tail} as ${asker.as ?? 'a visitor'}`;
        expect(await said(`/${closed}${tail}`, asker), what).toBe(await said(`/${nowhere}${tail}`, asker));
      }
    }
  });

  it('002.21 an address under a restricted space opens to whoever it admits or who may read a node in it, and an internal space’s to everyone', async () => {
    const [editorA, editorB, editorC] = [await userOf('editorA'), await userOf('editorB'), await userOf('editorC')];
    const garden = 'members-garden';
    const spaceId = await createSpace(served, { name: 'Members garden', slug: garden, accessLevel: 'restricted' });
    await setSpaceMembers(spaceId, [editorA.id, editorC.id]);
    const inherits = await createPage(served, 'admin', { spaceId, title: 'For the members' });
    const owned = await createPage(served, 'editorC', { spaceId, title: 'Kept by its owner' });
    const shared = await createPage(served, 'admin', { spaceId, title: 'Shared beyond', visibility: 'restricted', shares: [editorB.id] });
    // editorC leaves the space and keeps their own page; editorB never was in it.
    await setSpaceMembers(spaceId, [editorA.id]);

    const opens: [CallOptions['as'], { slug: string }, string][] = [
      ['editorA', inherits, 'a member'],
      ['admin', inherits, 'an admin'],
      ['editorC', owned, 'its owner, no member now'],
      ['editorB', shared, 'one it is shared with, never a member'],
    ];
    for (const [as, page, who] of opens) {
      expect((await call(served, `/${garden}/${page.slug}`, { as })).status, `${who}, reading`).toBe(200);
      expect((await call(served, `/${garden}/${page.slug}/edit`, { as })).status, `${who}, editing`).toBe(200);
    }

    // An internal space routes for everyone: a signed-out visitor is sent to
    // sign in, the one exception criterion 5 names.
    const hall = 'open-hall';
    const page = await createPage(served, 'admin', { spaceId: await createSpace(served, { name: 'Open hall', slug: hall, accessLevel: 'internal' }) });
    const visitor = await call(served, `/${hall}/${page.slug}`);
    expect(visitor.status).toBe(303);
    expect(new URL(visitor.headers.get('location')!, served.origin).pathname).toBe('/login');
  });
});
