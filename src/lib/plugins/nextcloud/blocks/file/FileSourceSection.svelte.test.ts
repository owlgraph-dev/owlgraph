// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import FileSourceSection from './FileSourceSection.svelte';
import { PLUGIN_ROUTES } from '../routes';
import type { DocumentView } from '../../server/documents.server';

// The plugin's routes are a stand-in, answering as documents.server.ts does while off.

/** While off, the plugin answers with the node alone. */
function offView(id: string): DocumentView {
  return {
    id,
    title: 'Quartalsbericht',
    href: '/quartalsbericht',
    content: null,
    file: null,
    path: null,
    fileid: null,
    own: false,
    modified: null,
    status: 'disabled',
    checkedAt: null,
    seenAt: null,
    collectionId: null,
    location: null,
  };
}

function api(answer: (method: string, url: string) => Response | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => answer(init?.method ?? 'GET', String(input)) ?? new Response('not found', { status: 404 }))
  );
}

function turnedOff(id: string) {
  api((method, url) => {
    if (method === 'GET' && url.startsWith(`${PLUGIN_ROUTES}/documents?`)) return Response.json({ documents: [offView(id)], reason: 'disabled' });
    if (method === 'POST' && url.startsWith(`${PLUGIN_ROUTES}/documents/${id}/check?`)) return Response.json({ document: offView(id), problem: 'disabled' });
  });
}

// Under `props`, with a mount target: the section's `target` prop shares its name with the mount option.
const section = (documentId: string | null) =>
  render(FileSourceSection, {
    target: document.body.appendChild(document.createElement('div')),
    props: {
      target: { type: 'nextcloudFile', id: 'block-1', attrs: { documentId }, update: vi.fn() },
      editor: null,
      pageId: 'a0000000-0000-4000-8000-0000000000a1',
      overlayOpenChange: vi.fn(),
    },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the file block's Source section while the plugin is turned off", () => {
  it('offers no file to choose from a folder or from the editor’s own Nextcloud, and says why', async () => {
    turnedOff('d0000000-0000-4000-8000-0000000000f1');
    section(null);

    await expect.element(screen.getByText('The Nextcloud integration is turned off.')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Choose from a folder …' })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Choose from my Nextcloud …' })).not.toBeInTheDocument();
  });

  it('shows a chosen document as its node and that the plugin is off — nothing of its file, no other file to choose', async () => {
    const id = 'd0000000-0000-4000-8000-0000000000f2';
    turnedOff(id);
    const { container } = section(id);

    await expect.element(screen.getByText('Integration turned off', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('The Nextcloud integration is turned off.')).toBeVisible();
    await expect.element(screen.getByRole('link', { name: "Open the document's page" })).toHaveAttribute('href', '/quartalsbericht');
    await expect.element(screen.getByText('File', { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Another file' })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Choose from a folder …' })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('file id');
  });
});
