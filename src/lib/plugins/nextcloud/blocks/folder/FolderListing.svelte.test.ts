// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import FolderListing from './FolderListing.svelte';
import { editingFor } from './editing';
import { folderTexts } from './texts';
import { folderProps } from './view';
import { PLUGIN_ROUTES } from '../routes';
import type { ListingEntry, ListingView } from '../../server/listing.server';

// The folder block as the editor and a page mount it (folderProps), the
// plugin's routes answered by a stand-in.

const COLLECTION = 'c0000000-0000-4000-8000-0000000000f1';
const COLLECTION_HREF = '/projektunterlagen';

function entry(path: string, extra: Partial<ListingEntry> = {}): ListingEntry {
  const name = path.split('/').at(-1)!;
  return { path, name, folder: false, size: 1200, mime: 'text/plain', modified: '2026-10-05T09:30:00.000Z', fileid: null, linked: null, ...extra };
}

function view(extra: Partial<ListingView> = {}): ListingView {
  return {
    state: 'ready',
    via: 'node',
    collection: { title: 'Projektunterlagen', href: COLLECTION_HREF, count: 5, checkedAt: '2026-10-20T08:00:00.000Z', own: false },
    root: 'Projektunterlagen',
    path: '',
    entries: [],
    total: 0,
    offset: 0,
    checkedAt: '2026-10-20T08:00:00.000Z',
    ...extra,
  };
}

const READY = view({
  entries: [
    entry('Q3', { folder: true, size: null, mime: null }),
    entry('Bericht.pdf', { mime: 'application/pdf', fileid: '301' }),
    entry('Notizen.txt', { fileid: '302' }),
  ],
  total: 3,
});

type Call = { method: string; url: string; body: unknown };

function api(answer: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { method: init?.method ?? 'GET', url: String(input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : null };
    calls.push(call);
    return answer(call) ?? new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return { calls, fetch };
}

const listings = (calls: Call[]) => calls.filter((c) => c.url.startsWith(`${PLUGIN_ROUTES}/listing?`));

function inEditor(attrs: Record<string, unknown> = {}) {
  const collectionId = (attrs.collectionId as string | undefined) ?? COLLECTION;
  return render(
    FolderListing,
    folderProps(
      { collectionId, startPath: '', ...attrs },
      { mode: 'editor', initial: undefined, texts: folderTexts(true), locale: 'en', renderedAt: Date.now(), ruleId: '', base: PLUGIN_ROUTES, editing: editingFor(collectionId) }
    )
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the Nextcloud folder block in the editor', () => {
  for (const [reason, said] of [
    ['unreachable', 'Not reachable'],
    ['revoked', 'Share revoked'],
    ['unauthorized', "The share's password changed"],
  ] as const) {
    it(`tells the editor why the share fails: ${said}`, async () => {
      const { calls } = api((call) => (call.url.startsWith(`${PLUGIN_ROUTES}/listing?`) ? Response.json(view({ state: 'unavailable', reason, via: null })) : undefined));
      inEditor();

      const placeholder = screen.getByRole('status').filter({ hasText: said });
      await expect.element(placeholder).toBeVisible();
      await expect.element(placeholder).toHaveTextContent('5 entries,');
      const repair = placeholder.getByRole('link', { name: 'Reconnect the share' });
      await expect.element(repair).toHaveAttribute('href', `${COLLECTION_HREF}/edit`);
      await expect.element(repair).toHaveAttribute('target', '_blank');
      const asked = new URL(listings(calls)[0].url, 'http://localhost').searchParams;
      expect(Object.fromEntries(asked)).toMatchObject({ c: COLLECTION, p: '', sort: 'name', dir: 'asc', offset: '0', limit: '50' });
    });
  }

  it('tells the editor, under a listing it still holds, that the server cannot be reached now', async () => {
    api((call) => (call.url.startsWith(`${PLUGIN_ROUTES}/listing?`) ? Response.json({ ...READY, state: 'stale', reason: 'unreachable' }) : undefined));
    const block = inEditor().container.querySelector('.el')!;

    await expect.element(screen.getByText('Bericht.pdf')).toBeVisible();
    await vi.waitFor(() => expect(block.querySelector('.el-provenance')?.textContent).toContain('not current · Not reachable'));
    expect(block.getAttribute('data-state')).toBe('stale');
  });

  it("says 'Path not found' for a start folder that is gone, with the way to reconnect the share", async () => {
    const { calls } = api((call) => (call.url.startsWith(`${PLUGIN_ROUTES}/listing?`) ? Response.json(view({ state: 'unavailable', reason: 'notFound', via: null, path: 'Weg' })) : undefined));
    inEditor({ startPath: 'Weg' });

    const placeholder = screen.getByRole('status').filter({ hasText: 'Path not found' });
    await expect.element(placeholder).toBeVisible();
    await expect.element(placeholder.getByRole('link', { name: 'Reconnect the share' })).toHaveAttribute('href', `${COLLECTION_HREF}/edit`);
    expect(new URL(listings(calls)[0].url, 'http://localhost').searchParams.get('p')).toBe('Weg');
  });

  it('makes a document of a file once asked, and then shows its Document chip and its node', async () => {
    const made = { id: 'd0000000-0000-4000-8000-0000000000f2', href: '/notizen-txt' };
    const { calls } = api((call) => {
      if (call.url.startsWith(`${PLUGIN_ROUTES}/listing?`)) return Response.json(READY);
      if (call.method === 'POST' && call.url === `${PLUGIN_ROUTES}/documents`) return Response.json({ document: { ...made, title: 'Notizen.txt' } }, { status: 201 });
    });
    inEditor();

    const row = screen.getByRole('listitem').filter({ hasText: 'Notizen.txt' });
    const create = row.getByRole('button', { name: 'Create as document' });
    await expect.element(create).toBeVisible();
    await expect.element(screen.getByRole('listitem').filter({ hasText: 'Q3' }).getByRole('button', { name: 'Create as document' })).not.toBeInTheDocument();
    await row.hover();
    await create.click();

    await expect.element(row.getByText('Document', { exact: true })).toBeVisible();
    await expect.element(row.getByRole('link', { name: 'Open document Notizen.txt' })).toHaveAttribute('href', made.href);
    await expect.element(create).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toEqual([
      { method: 'POST', url: `${PLUGIN_ROUTES}/documents`, body: { collectionId: COLLECTION, path: 'Notizen.txt', fileid: '302' } },
    ]);
    await expect.element(screen.getByRole('listitem').filter({ hasText: 'Bericht.pdf' }).getByRole('button', { name: 'Create as document' })).toBeVisible();
  });
});

describe('a folder read from each viewer’s own files', () => {
  it('says a refused connection has to be made again, and asks nothing more until it is', async () => {
    const { fetch } = api(() => undefined);
    const connectHref = '/settings/connections?return=%2Fteam-page';
    // The server's render already holds the refusal.
    const refused = view({ state: 'unavailable', via: null, access: 'renew', connectHref, collection: { title: 'Mein Ordner', href: '/mein-ordner', count: null, checkedAt: null, own: true } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    render(
      FolderListing,
      folderProps(
        { collectionId: COLLECTION, startPath: '' },
        { mode: 'page', initial: refused, texts: folderTexts(false), locale: 'en', renderedAt: Date.now(), ruleId: '', base: PLUGIN_ROUTES, editing: null }
      )
    );
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    vi.useRealTimers();

    const placeholder = screen.getByRole('status').filter({ hasText: 'Nextcloud no longer accepts your connection' });
    await expect.element(placeholder).toBeVisible();
    await expect.element(placeholder).toHaveTextContent('Connect again to see this folder.');
    const again = placeholder.getByRole('link', { name: 'Connect again' });
    await expect.element(again).toHaveAttribute('href', connectHref);
    // A full load, under the connections page's own CSP.
    await expect.element(again).toHaveAttribute('data-sveltekit-reload', '');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asked once and told the connection was refused, asks nothing more in the five minutes after', async () => {
    const connectHref = '/settings/connections?return=%2Fteam-page';
    const { calls } = api((call) =>
      call.url.startsWith(`${PLUGIN_ROUTES}/listing?`)
        ? Response.json(view({ state: 'unavailable', via: null, access: 'renew', connectHref, collection: { title: 'Mein Ordner', href: '/mein-ordner', count: null, checkedAt: null, own: true } }))
        : undefined
    );
    render(
      FolderListing,
      folderProps(
        { collectionId: COLLECTION, startPath: '' },
        { mode: 'page', initial: view({ state: 'loading', via: null }), texts: folderTexts(false), locale: 'en', renderedAt: Date.now(), ruleId: '', base: PLUGIN_ROUTES, editing: null }
      )
    );
    await expect.element(screen.getByRole('link', { name: 'Connect again' })).toBeVisible();
    expect(listings(calls)).toHaveLength(1);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    vi.useRealTimers();
    expect(listings(calls)).toHaveLength(1);
    await expect.element(screen.getByRole('link', { name: 'Connect again' })).toBeVisible();
  });
});
