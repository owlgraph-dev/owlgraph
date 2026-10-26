// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { createLinkDocument } from '$lib/features/documents/server';
import { createNamespace } from '$lib/features/namespaces/server';
import { searchNodesForUser } from '$lib/features/nodes/server';
import { createPage, saveDoc } from '$lib/features/pages/server';
import { setNodeClass, setNodeTags, upsertNodeClass } from '$lib/features/semantic/server';
import { db } from '$lib/platform/db.server';
import { parseNodeSearchParams } from './nodeSearchParams';
import { HL_START, HL_STOP } from './searchSnippet';
import { load } from './routes/searchPage.server';
import { userOf, type Role } from '$tests/integration/users';

// Each test's rows carry a tag or a term of their own; the search page's
// loader is called as the route calls it.

const seed = inject('seed');

type Loaded = {
  applied: { sort: string | null; view: string; page: number; type: string | null; class: string | null; namespace: string | null };
  results: { title: string; excerpt: string; highlighted: boolean }[];
  total: number;
  classOptions: { id: string; slug: string }[];
  tagOptions: string[];
  namespaces: { slug: string | null; name: string }[];
};

async function searchAs(role: Role | 'anonymous', query: string): Promise<Loaded> {
  const user = role === 'anonymous' ? null : await userOf(role);
  return (await load({ url: new URL(`http://owlgraph.test/search?${query}`), locals: { user } } as unknown as ServerLoadEvent)) as unknown as Loaded;
}
const titlesOf = (loaded: Loaded) => loaded.results.map((r) => r.title);

async function listedPage(setup: { title: string; tags?: string[]; visibility?: 'public' | 'internal' | 'restricted'; namespaceId?: string; body?: string; classId?: string }) {
  // A page in a namespace of its own inherits it; one at the root is opened to the signed-in.
  const visibility = setup.visibility ?? (setup.namespaceId ? undefined : 'internal');
  const page = await createPage(setup.title, await userOf('admin'), { visibility, namespaceId: setup.namespaceId });
  if (setup.tags) await setNodeTags(page.id, setup.tags);
  if (setup.body) await saveDoc(page.id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: setup.body }] }] });
  if (setup.classId) await setNodeClass(page.id, setup.classId);
  return page;
}

describe('the search page', () => {
  it('drops a class no class has and falls back on an invalid sort, page, view and type, listing the tagged page under the default sort and the list view', async () => {
    await listedPage({ title: 'Lenient page', tags: ['lenient'] });
    const loaded = await searchAs('editorA', 'tag=lenient&sort=sideways&page=-3&view=table&type=folder&class=no-such-class&bogus=1');
    expect(titlesOf(loaded)).toEqual(['Lenient page']);
    expect(loaded.applied).toMatchObject({ sort: null, view: 'list', page: 1, type: null, class: null });
  });

  it('lists for class=parent the parent’s and the child’s pages but not the sibling’s, and with exact=1 only the parent’s', async () => {
    const pageType = (await db<{ id: string }[]>`select id from node_classes where slug = 'page'`)[0].id;
    const parent = await upsertNodeClass({ slug: 's-parent', label: { en: 'S Parent' }, parentId: pageType });
    const child = await upsertNodeClass({ slug: 's-child', label: { en: 'S Child' }, parentId: parent.id });
    const sibling = await upsertNodeClass({ slug: 's-sibling', label: { en: 'S Sibling' }, parentId: pageType });
    await listedPage({ title: 'Parent kind', tags: ['classes'], classId: parent.id });
    await listedPage({ title: 'Child kind', tags: ['classes'], classId: child.id });
    await listedPage({ title: 'Sibling kind', tags: ['classes'], classId: sibling.id });

    expect(titlesOf(await searchAs('admin', 'tag=classes')).sort()).toEqual(['Child kind', 'Parent kind', 'Sibling kind']);
    expect(titlesOf(await searchAs('admin', 'tag=classes&class=s-parent')).sort()).toEqual(['Child kind', 'Parent kind']);
    expect(titlesOf(await searchAs('admin', 'tag=classes&class=s-parent&exact=1'))).toEqual(['Parent kind']);
  });

  it('lists for two tags every readable node carrying either, a document included', async () => {
    await listedPage({ title: 'Tagged A', tags: ['tagx'] });
    await listedPage({ title: 'Tagged B', tags: ['tagy'] });
    await listedPage({ title: 'Tagged C', tags: ['tagz'] });
    const admin = await userOf('admin');
    const doc = await createLinkDocument({ url: 'https://example.org/tagged', title: 'Tagged document', createdBy: admin.id, user: admin });
    await setNodeTags(doc.id, ['tagx']);

    const loaded = await searchAs('editorA', 'tag=tagx&tag=tagy');
    expect(titlesOf(loaded).sort()).toEqual(['Tagged A', 'Tagged B', 'Tagged document']);
    expect(loaded.total).toBe(3);
  });

  it('lists for a term the title match above the body match, gives the body match an excerpt with the term marked, and with sort=title orders the two by title', async () => {
    const term = 'zqterm';
    await listedPage({ title: `Zulu ${term}` });
    await listedPage({ title: 'Aardvark notes', body: `Somewhere in this text the word ${term} turns up.` });

    const ranked = await searchAs('editorA', `q=${term}`);
    expect(titlesOf(ranked)).toEqual([`Zulu ${term}`, 'Aardvark notes']);
    expect(ranked.results[1].highlighted).toBe(true);
    expect(ranked.results[1].excerpt).toContain(`${HL_START}${term}${HL_STOP}`);
    expect(titlesOf(await searchAs('editorA', `q=${term}&sort=title`))).toEqual(['Aardvark notes', `Zulu ${term}`]);
  });

  it('for a viewer, drops a namespace parameter naming a restricted namespace they are not in, lists the readable tagged page elsewhere, and offers no such namespace', async () => {
    const ns = await createNamespace({ name: 'Hidden for search', slug: 'hidden-for-search', accessLevel: 'restricted' });
    await listedPage({ title: 'Hidden in namespace', tags: ['nsdrop'], namespaceId: ns.id });
    await listedPage({ title: 'Visible elsewhere', tags: ['nsdrop'] });

    const loaded = await searchAs('viewer', 'namespace=hidden-for-search&tag=nsdrop');
    expect(loaded.applied.namespace).toBeNull();
    expect(titlesOf(loaded)).toEqual(['Visible elsewhere']);
    expect(loaded.namespaces.map((n) => n.slug)).not.toContain('hidden-for-search');
  });

  it('offers in its pickers only the tags and classes of nodes the viewer can read', async () => {
    const pageType = (await db<{ id: string }[]>`select id from node_classes where slug = 'page'`)[0].id;
    const hiddenClass = await upsertNodeClass({ slug: 's-hidden-only', label: { en: 'Hidden only' }, parentId: pageType });
    await listedPage({ title: 'Hidden picks', tags: ['only-on-hidden'], visibility: 'restricted', classId: hiddenClass.id });

    const viewer = await searchAs('viewer', '');
    expect(viewer.tagOptions).not.toContain('only-on-hidden');
    expect(viewer.classOptions.map((c) => c.slug)).not.toContain('s-hidden-only');
    const admin = await searchAs('admin', '');
    expect(admin.tagOptions).toContain('only-on-hidden');
    expect(admin.classOptions.map((c) => c.slug)).toContain('s-hidden-only');
  });
});

describe('the node picker’s link search', () => {
  const titlesFor = async (role: Role, q: string) => {
    const typed = parseNodeSearchParams(new URLSearchParams({ q, types: 'page' }))!;
    return (await searchNodesForUser(await userOf(role), typed.q, typed)).hits.map((h) => h.title);
  };

  it('lists no node the viewer cannot read, nor one in a namespace they may not see', async () => {
    const ns = await createNamespace({ name: 'Members of the picker', slug: 'picker-members', accessLevel: 'restricted' });
    await listedPage({ title: 'Pickable in namespace', namespaceId: ns.id });

    expect(await titlesFor('editorC', seed.restrictedTitle)).not.toContain(seed.restrictedTitle);
    expect(await titlesFor('editorB', seed.restrictedTitle)).toContain(seed.restrictedTitle);
    expect(await titlesFor('editorC', 'Pickable in namespace')).toEqual([]);
    expect(await titlesFor('admin', 'Pickable in namespace')).toEqual(['Pickable in namespace']);
  });
});
