// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getNamespaceMembers, listNamespaces, setNamespaceMembers } from '#lib/features/namespaces/server.ts';
import { call, createNamespace, createPage, formAction, startApp, type CallOptions, type ServedApp } from '#tests/integration/http.ts';
import { userOf } from '#tests/integration/users.ts';

// Who may manage namespaces, and which namespaces a browser is told of
// (docs/features/002-visibility-and-namespaces.md, "Acceptance criteria").
// Namespaces are made through the settings, so the served app routes by them.

const app = await startApp();

describe.skipIf(app.skipped)('namespaces, as the app serves them', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  it('002.14 creating, renaming and deleting a namespace, setting its level and changing its members are each refused to an editor and change nothing; an admin does each', async () => {
    const id = await createNamespace(served, { name: 'Kept as it is', slug: 'kept-as-it-is', accessLevel: 'restricted' });
    const editor = await userOf('editorA');
    const state = async () => ({ namespaces: (await listNamespaces()).map(({ id, name, slug, access_level }) => ({ id, name, slug, access_level })), members: await getNamespaceMembers(id) });
    const attempts: [string, Record<string, string>][] = [
      ['create', { name: 'Made by an editor', slug: 'made-by-an-editor', accessLevel: 'public' }],
      ['update', { id, name: 'Renamed by an editor', slug: 'renamed-by-an-editor', accessLevel: 'public' }],
      ['setMembers', { id, members: editor.id }],
      ['delete', { id }],
    ];

    const before = await state();
    for (const [action, fields] of attempts) {
      const result = await formAction(served, `/settings/namespaces?/${action}`, fields, { as: 'editorA' });
      expect({ status: result.status, type: result.type }, `an editor's ${action}`).toEqual({ status: 403, type: 'error' });
    }
    expect(await state()).toEqual(before);

    for (const [action, fields] of attempts) {
      const result = await formAction(served, `/settings/namespaces?/${action}`, fields, { as: 'admin' });
      expect(result.type, `an admin's ${action}`).toBe('success');
      const after = await state();
      if (action === 'create') expect(after.namespaces.map((n) => n.slug)).toContain('made-by-an-editor');
      if (action === 'update') expect(after.namespaces.find((n) => n.id === id)).toMatchObject({ name: 'Renamed by an editor', slug: 'renamed-by-an-editor', access_level: 'public' });
      if (action === 'setMembers') expect(after.members).toEqual([editor.id]);
      if (action === 'delete') expect(after.namespaces.map((n) => n.id)).not.toContain(id);
    }
  });

  describe('a restricted namespace and who is told of it', () => {
    // Words that occur nowhere else in what the app serves.
    const hidden = { name: 'Quartz Council', slug: 'quartz-council', accessLevel: 'restricted' as const };
    const VISITOR: CallOptions = {};
    const NOT_MEMBER: CallOptions = { as: 'editorC' };
    const MEMBER: CallOptions = { as: 'editorB' };
    let namespaceId: string;
    /** The address of a public page that links to a page in the restricted namespace. */
    let linking: string;

    beforeAll(async () => {
      namespaceId = await createNamespace(served, hidden);
      await setNamespaceMembers(namespaceId, [(await userOf('editorB')).id]);
      const inside = await createPage(served, 'admin', { namespaceId, title: 'Minutes of the council' });
      const link = { type: 'text', text: 'the minutes', marks: [{ type: 'pageLink', attrs: { targetPageId: inside.id, targetSlug: inside.slug } }] };
      const doc = { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: 'links' }, content: [{ type: 'text', text: 'See ' }, link] }] };
      // A new page inherits the default namespace, which the suite's seed makes public.
      const page = await createPage(served, 'admin', { title: 'A page anyone reads', doc });
      linking = `/${page.slug}`;
      expect(await (await call(served, linking, VISITOR)).text()).toContain('the minutes');
    });

    it('002.15 a restricted namespace is in nothing a non-member’s browser receives — not a page’s namespace list, not the slugs it routes by, not the search page, not a link into it — and in what its member receives', async () => {
      const own = await createPage(served, 'editorC', { title: 'An editor’s own page' });
      /** Whether what the app sends for `path` names the namespace, by its name or its slug. */
      const named = async (path: string, asker: CallOptions) => {
        const res = await call(served, path, asker);
        expect(res.status, `${path} as ${asker.as ?? 'a visitor'}`).toBe(200);
        const body = await res.text();
        return body.includes(hidden.name) || body.includes(hidden.slug);
      };
      for (const asker of [VISITOR, NOT_MEMBER]) {
        // The front page carries the list every page's layout is sent; the search page its filters.
        for (const path of ['/', '/search', '/api/namespaces/slugs']) expect(await named(path, asker), `${path} as ${asker.as ?? 'a visitor'}`).toBe(false);
      }
      // The editor's move picker, on a page of the non-member's own.
      expect(await named(`/${own.slug}/edit`, NOT_MEMBER)).toBe(false);
      // A public page that links to a page in the namespace.
      for (const asker of [VISITOR, NOT_MEMBER]) expect(await named(linking, asker), `the linking page as ${asker.as ?? 'a visitor'}`).toBe(false);

      for (const path of ['/', '/search', '/api/namespaces/slugs', linking]) expect(await named(path, MEMBER), `${path} as its member`).toBe(true);
    });
  });
});
