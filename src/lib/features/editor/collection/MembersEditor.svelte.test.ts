// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { page } from '$app/state';
import type { CollectionMember } from '$lib/features/collections';
import type { NodeSearchResult } from '$lib/features/search';
import MembersEditor from './MembersEditor.svelte';
import { stubFetch, type Call } from '$tests/component/fetch';

// The members API, the title search and the create routes are a stand-in;
// what the members API stores is members.http.test.ts's.

const COLLECTION = 'c0000000-0000-4000-8000-000000000001';
const NAMESPACE = { id: 'ns-default', name: 'Default', slug: null };

function member(id: string, title: string, extra: Partial<CollectionMember> = {}): CollectionMember {
  return { id, type: 'page', title, url: `/${id}`, position: 1, label: null, labelText: null, plugin: null, pluginLabel: null, ...extra };
}

function node(id: string, title: string, type: NodeSearchResult['type'] = 'collection'): NodeSearchResult {
  return { type, id, title, slug: id, href: `/${id}`, namespace: NAMESPACE.name, plugin: null, pluginLabel: null };
}


const membersAnswer = (members: CollectionMember[], basis = 'b2') => Response.json({ members, basis, existed: false });
const searchParams = (call: Call) => new URL(call.url, 'http://localhost').searchParams;

function editor(members: CollectionMember[]) {
  render(MembersEditor, { collectionId: COLLECTION, members, basis: 'b1', namespace: NAMESPACE });
  return screen.getByRole('region', { name: 'Contents' });
}

async function openPicker() {
  await screen.getByRole('button', { name: 'Add entry' }).click();
  const picker = screen.getByRole('dialog', { name: 'Add to collection' });
  await expect.element(picker).toBeVisible();
  return { picker, field: picker.getByRole('combobox') };
}

afterEach(() => {
  vi.unstubAllGlobals();
  page.data = {};
});

describe('a curated collection in its editor', () => {
  it('labels a member from its menu, which the collection then calls it by, and lets one go', async () => {
    const a = member('p-a', 'Alpha page');
    const b = member('p-b', 'Beta page');
    const calls = stubFetch((call) => {
      if (call.method === 'PATCH' && call.url === `/api/collections/${COLLECTION}/members/p-a`)
        return membersAnswer([{ ...a, label: 'Chapter one', labelText: { en: 'Chapter one' } }, b]);
      if (call.method === 'DELETE' && call.url === `/api/collections/${COLLECTION}/members/p-b`)
        return membersAnswer([{ ...a, label: 'Chapter one', labelText: { en: 'Chapter one' } }]);
    });
    const section = editor([a, b]);

    await section.getByRole('button', { name: 'Actions for Alpha page' }).click();
    await screen.getByRole('menuitem', { name: 'Label…' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Label in this collection' });
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Label English', exact: true }), 'Chapter one');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(section.getByText('Label: Chapter one')).toBeVisible();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ label: { en: 'Chapter one' } });

    await section.getByRole('button', { name: 'Actions for Beta page' }).click();
    await screen.getByRole('menuitem', { name: 'Remove from collection' }).click();
    await expect.element(section.getByText('Beta page', { exact: true })).not.toBeInTheDocument();
    await expect.element(section.getByText('1 entry', { exact: false })).toBeVisible();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([`/api/collections/${COLLECTION}/members/p-b`]);
  });
});

describe("the members editor's picker", () => {
  it('opens on a hint and finds by title, a page at a time, while only its list scrolls', async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    const token = 'Paged token';
    const all = Array.from({ length: 13 }, (_, i) => node(`c-${i}`, `${token} ${i}`));
    const calls = stubFetch((call) => {
      if (!call.url.startsWith('/api/node-search')) return undefined;
      const offset = Number(searchParams(call).get('offset') ?? 0);
      return offset === 0 ? Response.json({ results: all.slice(0, 12), more: true, exact: [] }) : Response.json({ results: all.slice(12), more: false, exact: [] });
    });
    editor([]);
    const { picker, field } = await openPicker();

    await expect.element(field).toHaveFocus();
    await expect.element(picker.getByText('Type part of a title to find it.')).toBeVisible();
    expect(picker.getByRole('option').elements()).toHaveLength(0);

    await userEvent.type(field, token);
    const rows = picker.getByRole('option').filter({ hasText: /Collection · / });
    await vi.waitFor(() => expect(rows.elements()).toHaveLength(12));
    await expect.element(picker.getByText(`Title contains “${token}” · 12+ matches`)).toBeVisible();
    const asked = searchParams(calls.find((c) => c.url.startsWith('/api/node-search'))!);
    expect(asked.get('q')).toBe(token);
    expect(asked.get('types')).toBe('page,document,collection');
    expect(asked.get('exclude')).toBe(COLLECTION);

    // The list scrolls under the search field; neither the field nor the page moves.
    const top = field.element().getBoundingClientRect().top;
    const last = rows.elements().at(-1)!;
    last.scrollIntoView({ block: 'end' });
    const list = last.closest('.np-results')!;
    await vi.waitFor(() => expect(list.scrollTop).toBeGreaterThan(0));
    const shown = list.getBoundingClientRect();
    expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(shown.bottom + 1);
    expect(field.element().getBoundingClientRect().top).toBe(top);
    expect(document.scrollingElement?.scrollTop ?? 0).toBe(0);

    await picker.getByRole('button', { name: 'Show more' }).click();
    await vi.waitFor(() => expect(rows.elements()).toHaveLength(13));
    await expect.element(picker.getByText(`Title contains “${token}” · 13 matches`)).toBeVisible();
    await expect.element(picker.getByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    expect(searchParams(calls.filter((c) => c.url.startsWith('/api/node-search')).at(-1)!).get('offset')).toBe('12');
  });

  it("offers to make what nobody's title is — a page, a collection, a document — in the collection's namespace", async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    const token = 'Made token';
    const fresh = `${token} fresh`;
    const paper = `${token} paper`;
    let members: CollectionMember[] = [];
    const calls = stubFetch((call) => {
      if (call.url.startsWith('/api/node-search')) {
        const q = searchParams(call).get('q');
        const types = searchParams(call).get('types')!.split(',');
        // A page is titled as the first term: it is listed, and its type is an exact match.
        if (q === token && types.includes('page')) return Response.json({ results: [node('p-made', token, 'page')], more: false, exact: ['page'] });
        return Response.json({ results: [], more: false, exact: [] });
      }
      if (call.method === 'POST' && call.url === '/api/pages') return Response.json({ id: 'p-fresh', slug: 'made-token-fresh', namespaceSlug: null });
      if (call.method === 'POST' && call.url === '/api/documents') return Response.json({ id: 'd-paper', slug: 'made-token-paper' });
      if (call.method === 'POST' && call.url === `/api/collections/${COLLECTION}/members`) {
        const id = (call.body as { nodeId: string }).nodeId;
        members = [...members, id === 'p-fresh' ? member('p-fresh', fresh) : member('d-paper', paper, { type: 'document' })];
        return membersAnswer(members);
      }
    });
    const section = editor([]);
    const { picker, field } = await openPicker();
    const newRows = picker.getByRole('option', { name: /^New / });

    // A page with this exact title exists, so no new page is offered.
    await userEvent.type(field, token);
    await expect.element(picker.getByRole('option').first()).toHaveTextContent(token);
    await vi.waitFor(() => expect(newRows.elements()).toHaveLength(2));
    await expect.element(picker.getByRole('option', { name: new RegExp(`^New collection “${token}”`) })).toBeVisible();
    await expect.element(picker.getByRole('option', { name: /^New document/ })).toHaveTextContent(`in ${NAMESPACE.name}`);
    expect(picker.getByRole('option', { name: /^New page/ }).elements()).toHaveLength(0);
    await picker.getByRole('radio', { name: 'Pages' }).click();
    await vi.waitFor(() => expect(newRows.elements()).toHaveLength(0));
    await picker.getByRole('radio', { name: 'Collections' }).click();
    await vi.waitFor(() => expect(newRows.elements()).toHaveLength(1));
    await expect.element(newRows).toHaveTextContent(`New collection “${token}”`);
    await picker.getByRole('radio', { name: 'All' }).click();

    await userEvent.fill(field, fresh);
    await vi.waitFor(() => expect(newRows.elements()).toHaveLength(3));
    expect(picker.getByRole('option').elements().map((e) => e.textContent)).toEqual([
      expect.stringMatching(/New page “/),
      expect.stringMatching(/New collection “/),
      expect.stringMatching(/New document “/),
    ]);
    await picker.getByRole('option', { name: /^New page/ }).click();
    await expect.element(picker).not.toBeInTheDocument();
    await expect.element(section.getByText(fresh, { exact: true })).toBeVisible();
    expect(calls.find((c) => c.url === '/api/pages')?.body).toEqual({ namespaceId: NAMESPACE.id, title: fresh });
    expect(calls.filter((c) => c.url === `/api/collections/${COLLECTION}/members`).map((c) => c.body)).toEqual([{ nodeId: 'p-fresh' }]);

    const { picker: again, field: field2 } = await openPicker();
    await userEvent.type(field2, paper);
    await again.getByRole('option', { name: /^New document/ }).click();
    await expect.element(again.getByRole('heading', { name: 'New document' })).toBeVisible();
    await expect.element(again.getByRole('textbox', { name: /^Title/ })).toHaveValue(paper);
    await again.getByRole('radio', { name: 'Link' }).click();
    await userEvent.fill(again.getByRole('textbox', { name: /^Address/ }), 'https://example.org/paper');
    await again.getByRole('button', { name: 'Create', exact: true }).click();
    await expect.element(again).not.toBeInTheDocument();
    await expect.element(section.getByText(paper, { exact: true })).toBeVisible();
    expect(calls.find((c) => c.url === '/api/documents')?.body).toEqual({ source: 'link', externalUrl: 'https://example.org/paper', title: paper, namespaceId: NAMESPACE.id });
    expect(calls.filter((c) => c.url === `/api/collections/${COLLECTION}/members`).map((c) => c.body)).toEqual([{ nodeId: 'p-fresh' }, { nodeId: 'd-paper' }]);
  });
});
