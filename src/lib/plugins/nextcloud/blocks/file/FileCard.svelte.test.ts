// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import FileCard from './FileCard.svelte';
import { documentEditing } from './documents';
import { fileTexts } from './texts';
import { fileProps } from './view';
import { PLUGIN_ROUTES } from '../routes';
import type { DocumentView } from '../../server/documents.server';
import { stubFetch, type Call } from '$tests/component/fetch';

// The file block as tiptap.ts mounts it in the editor, the plugin's routes
// answered by a stand-in.

const COLLECTION = 'c0000000-0000-4000-8000-0000000000e1';

function documentView(id: string, extra: Partial<DocumentView> = {}): DocumentView {
  return {
    id,
    title: 'Bericht.pdf',
    href: '/bericht-pdf',
    content: { view: `/api/documents/${id}/content`, download: `/api/documents/${id}/content?download` },
    file: { filename: 'Bericht.pdf', mime: 'application/pdf', size: 2048 },
    path: 'Bericht.pdf',
    fileid: '401',
    own: false,
    modified: '2026-10-02T09:30:00.000Z',
    status: 'ok',
    checkedAt: '2026-10-20T08:00:00.000Z',
    seenAt: '2026-10-19T08:00:00.000Z',
    collectionId: COLLECTION,
    location: { collection: 'Akten', folder: '' },
    ...extra,
  };
}

function inEditor(documentId: string) {
  return render(
    FileCard,
    fileProps({ documentId }, { mode: 'editor', initial: undefined, texts: fileTexts(true), locale: 'en', ruleId: '', editing: documentEditing(documentId) })
  );
}

const isCheck = (call: Call, id: string) => call.method === 'POST' && call.url.startsWith(`${PLUGIN_ROUTES}/documents/${id}/check?`);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Nextcloud file block in the editor', () => {
  it('tells the editor why its file is unavailable, and once the share is back a check shows the file again', async () => {
    const id = 'd0000000-0000-4000-8000-0000000000e2';
    let revoked = true;
    const calls = stubFetch((call) =>
      isCheck(call, id) ? Response.json({ document: documentView(id, revoked ? { status: 'revoked' } : {}) }) : undefined
    );
    inEditor(id);

    // The editor checks the file as it opens.
    const problem = screen.getByRole('status').filter({ hasText: 'Share revoked' });
    await expect.element(problem).toBeVisible();
    await expect.element(problem).toHaveTextContent('Bericht.pdf');
    await expect.element(problem).toHaveTextContent('file id 401');
    await expect.element(problem).toHaveTextContent('the node stays');
    await expect.element(problem.getByRole('button', { name: 'Choose another file' })).toBeVisible();
    expect(calls.filter((c) => isCheck(c, id))).toHaveLength(1);

    revoked = false;
    await problem.getByRole('button', { name: 'Check again' }).click();
    await expect.element(screen.getByText('Bericht.pdf', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('.de-title-text')?.textContent).toBe('Bericht.pdf');
    expect(document.querySelector('.de-chip')?.textContent).toBe('Document');
    expect(document.querySelector('.de')?.getAttribute('data-state')).toBe('ready');
    const checks = calls.filter((c) => isCheck(c, id));
    expect(checks).toHaveLength(2);
    // Where a viewer who has to connect comes back to.
    expect(new URL(checks[1].url, 'http://localhost').searchParams.get('r')).toBe(`${window.location.pathname}${window.location.search}`);
  });

  it('tells the editor the integration is turned off, shows its node and nothing of its file, and offers no other file', async () => {
    const id = 'd0000000-0000-4000-8000-0000000000e4';
    // As the plugin answers while turned off (documents.server.ts).
    const off = documentView(id, { title: 'Quartalsbericht', content: null, file: null, path: null, fileid: null, modified: null, status: 'disabled', checkedAt: null, seenAt: null, collectionId: null, location: null });
    stubFetch((call) => (isCheck(call, id) ? Response.json({ document: off, problem: 'disabled' }) : undefined));
    inEditor(id);

    const problem = screen.getByRole('status').filter({ hasText: 'Integration turned off' });
    await expect.element(problem).toBeVisible();
    await expect.element(problem).toHaveTextContent('Quartalsbericht');
    await expect.element(problem).toHaveTextContent('the node stays');
    await expect.element(problem.getByRole('button', { name: 'Check again' })).toBeVisible();
    await expect.element(problem.getByRole('button', { name: 'Choose another file' })).not.toBeInTheDocument();
    const block = document.querySelector('.de');
    for (const fact of ['Bericht.pdf', 'file id', '/content']) expect(block?.outerHTML).not.toContain(fact);
    expect(block?.querySelector('a')).toBeNull();
  });

  it("rebinds its document through the file dialog — the share's folders browsed, no collection to pick — and then shows the new file's name", async () => {
    const id = 'd0000000-0000-4000-8000-0000000000e3';
    const listing = (path: string) =>
      path === 'Q3'
        ? { state: 'ready', root: 'Akten', entries: [{ path: 'Q3/Protokoll.md', name: 'Protokoll.md', folder: false, fileid: '404' }] }
        : {
            state: 'ready',
            root: 'Akten',
            entries: [
              { path: 'Q3', name: 'Q3', folder: true, fileid: '410' },
              { path: 'Plan.png', name: 'Plan.png', folder: false, fileid: '402' },
            ],
          };
    const rebound = documentView(id, {
      title: 'Bericht.pdf',
      file: { filename: 'Protokoll.md', mime: 'text/markdown', size: 12 },
      path: 'Q3/Protokoll.md',
      fileid: '404',
      location: { collection: 'Akten', folder: 'Q3' },
    });
    const calls = stubFetch((call) => {
      if (isCheck(call, id)) return Response.json({ document: documentView(id, { status: 'notFound' }) });
      if (call.url.startsWith(`${PLUGIN_ROUTES}/listing?`)) return Response.json(listing(new URL(call.url, 'http://localhost').searchParams.get('p') ?? ''));
      if (call.method === 'PATCH' && call.url === `${PLUGIN_ROUTES}/documents/${id}`) return Response.json({ document: rebound });
    });
    inEditor(id);

    const problem = screen.getByRole('status').filter({ hasText: 'File not found in Nextcloud' });
    await expect.element(problem).toBeVisible();
    await problem.getByRole('button', { name: 'Choose another file' }).click();

    const dialog = screen.getByRole('dialog', { name: 'Choose a file' });
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByRole('combobox', { name: 'Collection' })).not.toBeInTheDocument();
    await expect.element(dialog.getByText('Akten', { exact: true })).toBeVisible();
    expect(calls.some((c) => c.url.startsWith(`${PLUGIN_ROUTES}/collections`))).toBe(false);
    const choose = dialog.getByRole('button', { name: 'Choose', exact: true });
    await expect.element(choose).toBeDisabled();

    await dialog.getByRole('button', { name: 'Q3' }).click();
    await expect.element(dialog.getByText('Akten / Q3')).toBeVisible();
    await dialog.getByRole('button', { name: 'Protokoll.md' }).click();
    await choose.click();

    await expect.element(dialog).not.toBeInTheDocument();
    await vi.waitFor(() => expect(document.querySelector('.de-title-text')?.textContent).toBe('Protokoll.md'));
    expect(document.querySelector('.de')?.getAttribute('data-state')).toBe('ready');
    const asked = calls.filter((c) => c.url.startsWith(`${PLUGIN_ROUTES}/listing?`)).map((c) => Object.fromEntries(new URL(c.url, 'http://localhost').searchParams));
    expect(asked).toEqual([
      { p: '', limit: '200', c: COLLECTION },
      { p: 'Q3', limit: '200', c: COLLECTION },
    ]);
    expect(calls.filter((c) => c.method === 'PATCH')).toEqual([
      { method: 'PATCH', url: `${PLUGIN_ROUTES}/documents/${id}`, body: { path: 'Q3/Protokoll.md', fileid: '404' } },
    ]);
  });
});
