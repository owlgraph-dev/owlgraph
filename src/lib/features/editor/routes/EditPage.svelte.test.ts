// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { page } from '$app/state';
import EditPage from './EditPage.svelte';
import type { EditPageData } from './edit.server';
import { stubFetch } from '$tests/component/fetch';

// The edit route with its load's data. A document's requests are answered by
// a stand-in for the documents API; invalidateAll is inert here, so a reload
// is played back by rendering the page with the data the load would give next.
// A page's: the edit lock's lifecycle around the desktop editor, its requests
// answered by a stand-in for the page API. The heartbeat and the blocked poll
// run on intervals, which the tests that wait on them fake.

const NAMESPACES = [{ id: 'ns-default', name: 'Default', slug: null, isDefault: true }];

const DOC_ID = 'd0000000-0000-4000-8000-0000000000a1';

type Doc = Extract<EditPageData, { kind: 'document' }>['doc'];
type DocumentData = Extract<EditPageData, { kind: 'document' }>;

function docRow(extra: Partial<Doc> = {}): Doc {
  return {
    id: DOC_ID,
    title: 'Minutes',
    slug: 'minutes',
    namespace_id: 'ns-default',
    namespace_slug: null,
    source: 'upload',
    plugin: null,
    external_url: null,
    filename: 'Minutes.txt',
    mime: 'text/plain',
    size: 1200,
    visibility: null,
    namespace_access_level: 'public',
    created_by: 'u-editor',
    created_at: '2026-10-01T09:00:00.000Z',
    class_id: 'class-document',
    locale: 'en',
    detected_locale: null,
    ...extra,
  };
}

/** What the edit route's load gives for a document (a public one by default). */
function documentData(extra: Partial<DocumentData> = {}, doc: Partial<Doc> = {}): EditPageData {
  return {
    kind: 'document',
    doc: docRow(doc),
    tags: [],
    manualProperties: [],
    propSuggestions: [],
    propertyGroups: [],
    tagSuggestions: [],
    nodeClassId: 'class-document',
    locale: 'en',
    localeSuggestion: null,
    nodeClasses: [],
    classFields: null,
    visibility: null,
    namespaceAccessLevel: 'public',
    namespaceMembers: [],
    shares: [],
    users: [],
    shareLinks: [],
    namespaces: NAMESPACES,
    ...extra,
  } as EditPageData;
}

const canvas = () => document.querySelector('.doc-canvas');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  page.data = {};
});

describe('a document in its editor', () => {
  it('switching an upload to a link is confirmed, and only then sends the address', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    const address = 'https://cloud.example.org/s/abc';
    const calls = stubFetch((call) => (call.method === 'PUT' && call.url === `/api/documents/${DOC_ID}/content` ? Response.json({ externalUrl: address }) : undefined));
    const view = render(EditPage, { data: documentData() });
    await expect.element(screen.getByText('Minutes.txt', { exact: false })).toBeVisible();

    await screen.getByRole('radio', { name: 'Link', exact: true }).click();
    await userEvent.fill(screen.getByRole('textbox', { name: 'Address', exact: true }), address);
    await screen.getByRole('button', { name: 'Switch to link' }).click();

    // Cancelling sends nothing: the file stays.
    const confirm = screen.getByRole('dialog', { name: 'Switch to a link?' });
    await expect.element(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect.element(confirm).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);

    await screen.getByRole('button', { name: 'Switch to link' }).click();
    await screen.getByRole('dialog', { name: 'Switch to a link?' }).getByRole('button', { name: 'Delete file and switch' }).click();
    await expect.element(screen.getByRole('dialog', { name: 'Switch to a link?' })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([{ method: 'PUT', url: `/api/documents/${DOC_ID}/content`, body: { externalUrl: address } }]);

    // The reload shows the document as the server now holds it: a link, its content the address.
    await view.rerender({ data: documentData({}, { source: 'link', external_url: address, filename: '', mime: null, size: null }) });
    await expect.element(screen.getByText('External document')).toBeVisible();
    const open = screen.getByRole('link', { name: 'Open: cloud.example.org (new tab)' });
    await expect.element(open).toHaveAttribute('href', `/api/documents/${DOC_ID}/content`);
    await expect.element(open).toHaveAttribute('target', '_blank');
    await expect.element(open).toHaveAttribute('rel', 'noopener noreferrer');
    await expect.element(screen.getByRole('link', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('offers a language detected in the upload as a suggestion, and taking it sends it', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    const calls = stubFetch((call) => (call.method === 'PATCH' && call.url === `/api/documents/${DOC_ID}` ? Response.json({ ok: true }) : undefined));
    const view = render(EditPage, { data: documentData({ locale: 'en', localeSuggestion: 'de' }, { detected_locale: 'de' }) });

    const offer = screen.getByRole('status').filter({ hasText: 'Detected: German' });
    await expect.element(offer).toBeVisible();
    await expect.element(offer.getByRole('button', { name: 'Use' })).toBeVisible();
    await expect.element(offer.getByRole('button', { name: 'Dismiss' })).toBeVisible();
    // Nothing has changed yet: the document is still in the site default.
    expect(canvas()?.getAttribute('lang')).toBe('en');
    expect(calls).toEqual([]);

    await offer.getByRole('button', { name: 'Use' }).click();
    await vi.waitFor(() => expect(calls).toEqual([{ method: 'PATCH', url: `/api/documents/${DOC_ID}`, body: { locale: 'de' } }]));

    // The reload: the document in German, the suggestion taken.
    await view.rerender({ data: documentData({ locale: 'de', localeSuggestion: null }, { locale: 'de' }) });
    await expect.element(screen.getByRole('status').filter({ hasText: 'Detected:' })).not.toBeInTheDocument();
    expect(canvas()?.getAttribute('lang')).toBe('de');
  });

  it("shows a restricted document's access control reading Restricted, the header's access panel opening on it", async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    stubFetch(() => undefined);
    render(EditPage, {
      data: documentData(
        { visibility: 'restricted', shares: ['u-bea'], users: [{ id: 'u-bea', name: 'Bea Reader', email: 'bea@example.org' }] },
        { visibility: 'restricted' }
      ),
    });

    await screen.getByRole('button', { name: 'Access control' }).click();
    const panel = screen.getByRole('dialog', { name: 'Access control' });
    await expect.element(panel).toBeVisible();
    await expect.element(panel.getByRole('combobox', { name: 'Who can view this page' })).toHaveTextContent('Restricted — only selected users');
    await expect.element(panel.getByText('You (the owner) and admins always have access.', { exact: false })).toBeVisible();
    await expect.element(panel.getByRole('checkbox', { name: /Bea Reader/ })).toBeChecked();
  });
});

const PAGE_ID = 'p0000000-0000-4000-8000-0000000000c1';
const LOCK = `/api/pages/${PAGE_ID}/lock`;
const DOC = { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: 'p-1' }, content: [{ type: 'text', text: 'Hello' }] }] };

type PageRow = Extract<EditPageData, { kind: 'page' }>['page'];
type Role = 'editor' | 'admin';

/** What the edit route's load gives for a page, opened by an editor or an admin. */
function pageData(role: Role = 'editor'): EditPageData {
  const row = {
    id: PAGE_ID,
    title: 'Plans',
    slug: 'plans',
    namespace_id: 'ns-default',
    namespace_slug: null,
    doc: DOC,
    visibility: null,
    namespace_access_level: 'public',
    created_by: 'u-editor',
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-01T09:00:00.000Z',
    class_id: 'class-page',
    content_scheme: null,
    locale: 'en',
  } as PageRow;
  return {
    kind: 'page',
    page: row,
    pages: [],
    documents: [],
    namespaces: NAMESPACES,
    tags: [],
    manualProperties: [],
    propSuggestions: [],
    propertyGroups: [],
    tagSuggestions: [],
    nodeClassId: 'class-page',
    locale: 'en',
    nodeClasses: [],
    classFields: null,
    visibility: null,
    namespaceAccessLevel: 'public',
    namespaceMembers: [],
    shares: [],
    users: [],
    shareLinks: [],
    me: { id: `u-${role}`, name: role === 'admin' ? 'Ann Admin' : 'Eddie Editor', role },
    baseVersionId: 'v-base',
    pageLayoutPresets: [],
    enabledPlugins: [],
    assetSizes: {},
    contentScheme: null,
    contentSchemeDefault: 'light',
    isHomePage: false,
  } as unknown as EditPageData;
}

/** One request the route made, with its headers. */
type Call = { method: string; url: string; body: unknown; headers: Record<string, string> };

/** Stands in for `fetch`; an answer may be held back by returning a promise (404 for the rest). */
function server(answer: (call: Call) => Response | Promise<Response> | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body;
      const call = {
        method: init?.method ?? 'GET',
        url: String(input),
        body: typeof body === 'string' ? JSON.parse(body) : null,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      };
      calls.push(call);
      return (await answer(call)) ?? new Response('not found', { status: 404 });
    })
  );
  return calls;
}

const granted = (token = 'tok-1') => Response.json({ ok: true, token, status: { locked: true } });
const heldBy = (lockedByName: string, stale = false) =>
  Response.json(
    { error: { code: 'lock_lost', message: 'Locked', status: { locked: true, lockedById: 'u-ada', lockedByName, acquiredAt: null, heartbeatAt: null, stale } } },
    { status: 423 }
  );
const lockStatus = (status: { locked: boolean; lockedByName?: string | null; stale?: boolean }) =>
  Response.json({ lockedById: null, lockedByName: null, acquiredAt: null, heartbeatAt: null, stale: false, ...status });

const isLock = (c: Call, method: string) => c.method === method && c.url === LOCK;
const requests = (calls: Call[], url: string) => calls.filter((c) => c.url === url).map(({ method, url, body }) => ({ method, url, body }));
const toolbar = () => screen.getByRole('toolbar', { name: 'Editor formatting' });
const proseMirror = () => document.querySelector('.ProseMirror') as HTMLElement | null;

describe('opening a page in its editor', () => {
  // A desktop's window: the phone shell is another component.
  beforeEach(async () => {
    await screen.viewport(1280, 800);
  });
  afterEach(async () => {
    await screen.viewport(414, 896);
  });

  it('shows the opening card until the lock is granted, then the desktop editor', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    let grant: (res: Response) => void = () => {};
    const calls = server((c) => (isLock(c, 'POST') ? new Promise<Response>((resolve) => (grant = resolve)) : undefined));
    render(EditPage, { data: pageData() });

    await expect.element(screen.getByText('Opening editor…')).toBeVisible();
    await vi.waitFor(() => expect(requests(calls, LOCK)).toEqual([{ method: 'POST', url: LOCK, body: {} }]));
    await expect.element(toolbar()).not.toBeInTheDocument();

    grant(granted());
    await expect.element(toolbar()).toBeVisible();
    await expect.element(screen.getByText('Opening editor…')).not.toBeInTheDocument();
  });

  it('names who holds the page, and an editor is offered no takeover', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    server((c) => (isLock(c, 'POST') ? heldBy('Ada Admin') : undefined));
    render(EditPage, { data: pageData('editor') });

    await expect.element(screen.getByRole('heading', { name: 'Page is being edited' })).toBeVisible();
    await expect.element(screen.getByText('Ada Admin currently has this page open for editing.')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'View read-only' })).toHaveAttribute('href', '/plans');
    await expect.element(screen.getByRole('button', { name: 'Take over' })).not.toBeInTheDocument();
  });

  it('lets an admin take over a fresh holder, only after confirming', async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    const calls = server((c) => (isLock(c, 'POST') ? ((c.body as { force?: boolean }).force ? granted('tok-forced') : heldBy('Ada Admin')) : undefined));
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    render(EditPage, { data: pageData('admin') });

    const takeOver = screen.getByRole('button', { name: 'Take over' });
    await expect.element(takeOver).toBeVisible();
    await takeOver.click();
    expect(confirm).toHaveBeenCalledWith('Take over editing? Ada Admin will be switched to read-only.');
    expect(requests(calls, LOCK)).toEqual([{ method: 'POST', url: LOCK, body: {} }]);

    confirm.mockReturnValue(true);
    await takeOver.click();
    await expect.element(toolbar()).toBeVisible();
    expect(requests(calls, LOCK)).toEqual([
      { method: 'POST', url: LOCK, body: {} },
      { method: 'POST', url: LOCK, body: { force: true } },
    ]);
  });

  it('says when the holder looks inactive, offers no takeover, and Try again acquires', async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    let free = false;
    const calls = server((c) => (isLock(c, 'POST') ? (free ? granted() : heldBy('Ada Admin', true)) : undefined));
    render(EditPage, { data: pageData('admin') });

    await expect.element(screen.getByText('Their session looks inactive, so you should be able to take over shortly.', { exact: false })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Take over' })).not.toBeInTheDocument();

    free = true;
    await screen.getByRole('button', { name: 'Try again' }).click();
    await expect.element(toolbar()).toBeVisible();
    expect(requests(calls, LOCK)).toEqual([
      { method: 'POST', url: LOCK, body: {} },
      { method: 'POST', url: LOCK, body: {} },
    ]);
  });

  it('polls a blocked lock every 15 seconds, naming the current holder, and enters once it is free', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    let held: { locked: boolean; lockedByName: string | null } = { locked: true, lockedByName: 'Bea Editor' };
    const calls = server((c) => {
      if (isLock(c, 'POST')) return held.locked ? heldBy('Ada Admin') : granted();
      if (isLock(c, 'GET')) return lockStatus(held);
      return undefined;
    });
    render(EditPage, { data: pageData() });

    await expect.element(screen.getByText('Ada Admin currently has this page open for editing.')).toBeVisible();
    expect(requests(calls, LOCK).filter((c) => c.method === 'GET')).toEqual([]);

    await vi.advanceTimersByTimeAsync(15_000);
    await expect.element(screen.getByText('Bea Editor currently has this page open for editing.')).toBeVisible();

    held = { locked: false, lockedByName: null };
    await vi.advanceTimersByTimeAsync(15_000);
    await expect.element(toolbar()).toBeVisible();
    expect(requests(calls, LOCK).map((c) => c.method)).toEqual(['POST', 'GET', 'GET', 'POST']);
  });
});

describe('editing with the lock', () => {
  // A desktop's window: the phone shell is another component.
  beforeEach(async () => {
    await screen.viewport(1280, 800);
  });
  afterEach(async () => {
    await screen.viewport(414, 896);
  });

  it('sends the lock token with every save', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    const calls = server((c) => {
      if (isLock(c, 'POST')) return granted('tok-7');
      if (c.method === 'PUT' && c.url === `/api/pages/${PAGE_ID}`) return Response.json({ ok: true });
      return undefined;
    });
    render(EditPage, { data: pageData() });
    await expect.element(toolbar()).toBeVisible();

    await toolbar().getByRole('button', { name: 'Save', exact: true }).click();
    await expect.element(screen.getByText(/^Saved /)).toBeVisible();
    const saves = calls.filter((c) => c.method === 'PUT');
    expect(saves).toHaveLength(1);
    expect(saves[0].headers['x-edit-lock']).toBe('tok-7');
    expect(saves[0].body).toMatchObject({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] });
  });

  it('gives the lock back when the editor closes', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    const calls = server((c) => (isLock(c, 'POST') ? granted('tok-9') : undefined));
    const view = render(EditPage, { data: pageData() });
    await expect.element(toolbar()).toBeVisible();

    view.unmount();
    expect(requests(calls, LOCK)).toEqual([
      { method: 'POST', url: LOCK, body: {} },
      { method: 'DELETE', url: LOCK, body: { token: 'tok-9' } },
    ]);
  });

  it('keeps the lock alive every 20 seconds, and a lost one with unsaved work leaves the page read-only, the draft kept', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    let lost = false;
    const calls = server((c) => {
      if (isLock(c, 'POST')) return granted('tok-3');
      if (c.method === 'POST' && c.url === `${LOCK}/heartbeat`) return lost ? heldBy('Ada Admin') : Response.json({ ok: true });
      if (c.method === 'POST' && c.url === `/api/pages/${PAGE_ID}/versions`) return Response.json({ versionId: 'v-draft', currentDoc: DOC });
      return undefined;
    });
    render(EditPage, { data: pageData() });
    await expect.element(toolbar()).toBeVisible();

    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(() => expect(calls.filter((c) => c.url === `${LOCK}/heartbeat`).map((c) => c.body)).toEqual([{ token: 'tok-3' }]));
    await expect.element(screen.getByText('so this page is now read-only', { exact: false })).not.toBeInTheDocument();

    await userEvent.click(proseMirror()!);
    await userEvent.keyboard('{End} more');
    lost = true;
    await vi.advanceTimersByTimeAsync(20_000);

    await expect.element(screen.getByText('so this page is now read-only', { exact: false })).toBeVisible();
    expect(proseMirror()?.getAttribute('contenteditable')).toBe('false');
    await vi.waitFor(() => expect(calls.filter((c) => c.url === `/api/pages/${PAGE_ID}/versions`)).toHaveLength(1));
    const draft = calls.find((c) => c.url === `/api/pages/${PAGE_ID}/versions`)!.body as { doc: unknown; baseVersionId: string };
    expect(draft.baseVersionId).toBe('v-base');
    expect(JSON.stringify(draft.doc)).toContain('Hello more');
    // Offered beside the stored page, block by block.
    await expect.element(screen.getByRole('heading', { name: 'Your edit lock was taken over' })).toBeVisible();
  });

  it('a lost lock with nothing unsaved shows that editing moved on', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    const calls = server((c) => {
      if (isLock(c, 'POST')) return granted();
      if (c.method === 'POST' && c.url === `${LOCK}/heartbeat`) return heldBy('Ada Admin');
      return undefined;
    });
    render(EditPage, { data: pageData() });
    await expect.element(toolbar()).toBeVisible();

    await vi.advanceTimersByTimeAsync(20_000);
    await expect.element(screen.getByRole('heading', { name: 'Editing was taken over' })).toBeVisible();
    await expect.element(toolbar()).not.toBeInTheDocument();
    expect(calls.filter((c) => c.url === `/api/pages/${PAGE_ID}/versions`)).toEqual([]);
  });
});
