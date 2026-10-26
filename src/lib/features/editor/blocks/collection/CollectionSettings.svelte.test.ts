// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { page } from '$app/state';
import { EMBED_KINDS, embedKindFor } from '$lib/features/content';
import { pluginLabel } from '$lib/plugins';
import CollectionSettings from './CollectionSettings.svelte';
import type { BlockSettingsActions, Target } from '../../blockSettings/types';
import { stubFetch } from '$tests/component/fetch';

// The panel alone: its target and actions as the block settings panel hands them, the
// target re-rendered with each update; the routes answered by a stand-in.

const NAMESPACE = { id: 'ns-default', name: 'Default', slug: null };
// A block holds its collection by a UUID (collectionConfig).
const SECOND = 'c0000000-0000-4000-8000-000000000002';
const MADE = 'c0000000-0000-4000-8000-000000000003';
const MIRRORED = 'c0000000-0000-4000-8000-000000000004';

/** The panel for a collection block, its target following each update as the block settings panel's does. */
function panel(enabledPlugins: ReadonlySet<string> = new Set()) {
  const updates: Record<string, unknown>[] = [];
  const overlay = vi.fn();
  const swapEmbed = vi.fn();
  const actions: BlockSettingsActions = {
    overlayOpenChange: overlay,
    createIn: () => NAMESPACE,
    embedKindFor: (family, source) => embedKindFor(family, source, enabledPlugins),
    swapEmbed,
  };
  const target = (attrs: Record<string, unknown>): Target => ({
    type: 'collectionBlock',
    id: 'block-1',
    attrs,
    update: (patch) => {
      updates.push(patch);
      void view.rerender({ target: target({ ...attrs, ...patch }) });
    },
  });
  // `target` is a mount option's name too: the props go under `props`, beside the element to mount into.
  const mountEl = document.body.appendChild(document.createElement('div'));
  const view = render(CollectionSettings, { target: mountEl, props: { target: target({ blockId: 'block-1', nodeId: null }), editor: null, actions } });
  return { updates, overlay, swapEmbed };
}

async function openPicker() {
  await screen.getByRole('button', { name: 'Choose…' }).click();
  const picker = screen.getByRole('dialog', { name: 'Choose a collection' });
  await expect.element(picker).toBeVisible();
  return picker;
}

const embed = (id: string, title: string) => Response.json({ embed: { state: 'members', node: { id, title, href: `/${id}` }, members: [], total: 0 } });

afterEach(() => {
  vi.unstubAllGlobals();
  page.data = {};
});

describe('the collection block', () => {
  it('says so in the picker when a new collection cannot be made, and lets the editor try again', async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    const title = 'Made at the second try';
    let attempts = 0;
    const calls = stubFetch((call) => {
      if (call.url.startsWith('/api/node-search')) return Response.json({ results: [], more: false, exact: [] });
      if (call.method === 'POST' && call.url === '/api/collections') {
        attempts++;
        return attempts === 1 ? Response.json({}, { status: 500 }) : Response.json({ id: SECOND, slug: 'made-at-the-second-try', namespaceSlug: null }, { status: 201 });
      }
      if (call.url === `/api/collections/${SECOND}`) return embed(SECOND, title);
    });
    const { updates } = panel();
    const picker = await openPicker();

    await userEvent.type(picker.getByPlaceholder('Search collections'), title);
    const make = picker.getByRole('option', { name: /^New collection “/ });
    await make.click();
    await expect.element(picker.getByRole('alert')).toHaveTextContent('could not be made');
    expect(updates).toEqual([]);

    await make.click();
    await expect.element(picker).not.toBeInTheDocument();
    expect(updates).toEqual([{ nodeId: SECOND }]);
    await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
    expect(calls.filter((c) => c.url === '/api/collections').map((c) => c.body)).toEqual([
      { namespaceId: NAMESPACE.id, title },
      { namespaceId: NAMESPACE.id, title },
    ]);
  });

  it("makes a new curated collection from the picker, in the page's namespace, and shows it", async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    const title = 'Made in the picker';
    const calls = stubFetch((call) => {
      if (call.url.startsWith('/api/node-search')) return Response.json({ results: [], more: false, exact: [] });
      if (call.method === 'POST' && call.url === '/api/collections') return Response.json({ id: MADE, slug: 'made-in-the-picker', namespaceSlug: null }, { status: 201 });
      if (call.url === `/api/collections/${MADE}`) return embed(MADE, title);
    });
    const { updates, overlay } = panel();
    const picker = await openPicker();
    expect(overlay).toHaveBeenLastCalledWith(true);

    await userEvent.type(picker.getByPlaceholder('Search collections'), title);
    // One type, so one row — named for the page's namespace.
    const make = picker.getByRole('option', { name: /^New / });
    await vi.waitFor(() => expect(make.elements()).toHaveLength(1));
    await expect.element(make).toHaveTextContent(`New collection “${title}”`);
    await expect.element(make).toHaveTextContent(`in ${NAMESPACE.name}`);
    expect(new URL(calls.find((c) => c.url.startsWith('/api/node-search'))!.url, 'http://localhost').searchParams.get('types')).toBe('collection');
    await make.click();

    await expect.element(picker).not.toBeInTheDocument();
    expect(overlay).toHaveBeenLastCalledWith(false);
    expect(calls.find((c) => c.url === '/api/collections' && c.method === 'POST')?.body).toEqual({ namespaceId: NAMESPACE.id, title });
    expect(updates).toEqual([{ nodeId: MADE }]);
    await expect.element(screen.getByText(title, { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Change…' })).toBeVisible();
  });
});

// Whichever plugin adds a collection kind; the core names none.
const pluginKind = EMBED_KINDS.find((k) => k.family === 'collection' && k.source !== null);

describe('a plugin’s collections in the collection block’s picker', () => {
  it.runIf(!!pluginKind)('while the plugin is off, offers its collections but cannot pick them, and says why', async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    const source = pluginKind!.source!;
    const label = pluginLabel(source);
    const mirrored = { type: 'collection', id: MIRRORED, title: 'Ablage', slug: 'ablage', href: '/ablage', namespace: NAMESPACE.name, plugin: source, pluginLabel: label };
    stubFetch((call) => (call.url.startsWith('/api/node-search') ? Response.json({ results: [mirrored], more: false, exact: ['collection'] }) : undefined));
    const { updates, swapEmbed } = panel(new Set());
    const picker = await openPicker();

    await userEvent.type(picker.getByPlaceholder('Search collections'), 'Ablage');
    const option = picker.getByRole('option', { name: /^Ablage/ });
    await expect.element(option).toHaveTextContent(`${label} is turned off`);
    await expect.element(option).toHaveAttribute('aria-disabled', 'true');
    await option.click({ force: true });
    await expect.element(picker).toBeVisible();
    expect(updates).toEqual([]);
    expect(swapEmbed).not.toHaveBeenCalled();
  });
});
