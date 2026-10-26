// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { page } from '$app/state';
import { embedKindFor } from '$lib/features/content';
import DocumentSettings from './DocumentSettings.svelte';
import type { BlockSettingsActions, Target } from '../../blockSettings/types';
import { stubFetch } from '$tests/component/fetch';

// The panel alone: its target and actions as the block settings panel hands them, the
// target re-rendered with each update; the routes answered by a stand-in.

const NAMESPACE = { id: 'ns-default', name: 'Default', slug: null };
// A block holds its document by a UUID (documentConfig).
const MADE = 'd0000000-0000-4000-8000-000000000001';

function panel() {
  const updates: Record<string, unknown>[] = [];
  const actions: BlockSettingsActions = {
    overlayOpenChange: vi.fn(),
    createIn: () => NAMESPACE,
    embedKindFor: (family, source) => embedKindFor(family, source, new Set()),
    swapEmbed: vi.fn(),
  };
  const target = (attrs: Record<string, unknown>): Target => ({
    type: 'documentBlock',
    id: 'block-1',
    attrs,
    update: (patch) => {
      updates.push(patch);
      void view.rerender({ target: target({ ...attrs, ...patch }) });
    },
  });
  // `target` is a mount option's name too: the props go under `props`, beside the element to mount into.
  const mountEl = document.body.appendChild(document.createElement('div'));
  const view = render(DocumentSettings, { target: mountEl, props: { target: target({ blockId: 'block-1', nodeId: null }), editor: null, actions } });
  return { updates };
}

afterEach(() => {
  vi.unstubAllGlobals();
  page.data = {};
});

describe('the document block', () => {
  it("makes the document it shows from the picker — a link, under the title searched for, in the page's namespace", async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    const title = 'Made as a link';
    const calls = stubFetch((call) => {
      if (call.url.startsWith('/api/node-search')) return Response.json({ results: [], more: false, exact: [] });
      if (call.method === 'POST' && call.url === '/api/documents') return Response.json({ id: MADE, slug: 'made-as-a-link' }, { status: 201 });
      if (call.url === `/api/documents/${MADE}`)
        return Response.json({
          embed: {
            state: 'file',
            node: { id: MADE, title, href: '/made-as-a-link' },
            source: 'link',
            file: null,
            linkHost: 'example.org',
            content: { view: `/api/documents/${MADE}/content`, download: null },
          },
        });
    });
    const { updates } = panel();

    await screen.getByRole('button', { name: 'Choose…' }).click();
    const picker = screen.getByRole('dialog', { name: 'Choose a document' });
    await userEvent.type(picker.getByPlaceholder('Search documents'), title);
    await picker.getByRole('option', { name: /^New document “/ }).click();
    await expect.element(picker.getByRole('heading', { name: 'New document' })).toBeVisible();
    await expect.element(picker.getByRole('textbox', { name: /^Title/ })).toHaveValue(title);
    await picker.getByRole('radio', { name: 'Link' }).click();
    await userEvent.fill(picker.getByRole('textbox', { name: /^Address/ }), 'https://example.org/made-as-a-link');
    await picker.getByRole('button', { name: 'Create', exact: true }).click();

    await expect.element(picker).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url === '/api/documents')?.body).toEqual({
      source: 'link',
      externalUrl: 'https://example.org/made-as-a-link',
      title,
      namespaceId: NAMESPACE.id,
    });
    expect(updates).toEqual([{ nodeId: MADE }]);
    await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
  });
});
