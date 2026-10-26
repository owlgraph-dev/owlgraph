// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, vi } from 'vitest';
import { nodePath, type NodeMetaClient } from '$lib/features/nodes';
import { nodeActions, type NodeRow } from './nodeActions';

const NAMESPACES = [
  { id: 'ns-default', slug: null, isDefault: true },
  { id: 'ns-team', slug: 'team', isDefault: false },
];

function fixture(client: Partial<Record<keyof NodeMetaClient, unknown>> = {}) {
  const row: NodeRow = { id: 'p-1', title: 'Plans', slug: 'plans', namespace_id: 'ns-default', namespace_slug: null };
  const fake = {
    rename: vi.fn(async (changes: { title?: string; slug?: string }) => ({ ok: true, title: changes.title ?? row.title, slug: changes.slug ?? row.slug })),
    setTags: vi.fn(async (tags: string[]) => ({ ok: true, tags })),
    setManualProperties: vi.fn(async () => ({ ok: true, properties: [] })),
    setNodeClass: vi.fn(async () => ({ ok: true })),
    setLocale: vi.fn(async () => ({ ok: true })),
    dismissLocaleSuggestion: vi.fn(async () => ({ ok: true })),
    setVisibility: vi.fn(async (visibility: string | null) => ({ ok: true, visibility })),
    setShares: vi.fn(async (shares: string[]) => ({ ok: true, shares })),
    createShareLink: vi.fn(async () => ({ ok: true })),
    revokeShareLink: vi.fn(async () => ({ ok: true })),
    setNamespace: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    ...client,
  };
  const goto = vi.fn(async () => {});
  const invalidateAll = vi.fn(async () => {});
  const beforeDelete = vi.fn();
  const actions = nodeActions(fake as unknown as NodeMetaClient, row, { deleteFallback: 'Could not delete', beforeDelete, namespaces: () => NAMESPACES, goto, invalidateAll });
  return { actions, row, client: fake, goto, invalidateAll, beforeDelete };
}

const STAY = { replaceState: true, noScroll: true, keepFocus: true };

describe("a node's actions in its editor", () => {
  it('follow a renamed slug to the new address in place of the old, and a new title without moving', async () => {
    const f = fixture();
    await f.actions.onRename!({ title: 'Plans 2027' });
    expect(f.row.title).toBe('Plans 2027');
    expect(f.goto).not.toHaveBeenCalled();

    await f.actions.onRename!({ slug: 'plans-2027' });
    expect(f.row.slug).toBe('plans-2027');
    expect(f.goto).toHaveBeenCalledWith(nodePath(null, 'plans-2027', { edit: true }), STAY);
  });

  it('keep the row as it was when a rename is refused', async () => {
    const f = fixture({ rename: vi.fn(async () => ({ ok: false, error: 'taken' })) });
    expect(await f.actions.onRename!({ slug: 'taken' })).toEqual({ ok: false, error: 'taken' });
    expect(f.row.slug).toBe('plans');
    expect(f.goto).not.toHaveBeenCalled();
  });

  it('follow a move to another namespace, the default one without its slug', async () => {
    const f = fixture();
    await f.actions.onSetNamespace!('ns-team');
    expect(f.row).toMatchObject({ namespace_id: 'ns-team', namespace_slug: 'team' });
    expect(f.goto).toHaveBeenLastCalledWith(nodePath('team', 'plans', { edit: true }), STAY);
    await f.actions.onSetNamespace!('ns-default');
    expect(f.row.namespace_slug).toBeNull();
    expect(f.goto).toHaveBeenLastCalledWith(nodePath(null, 'plans', { edit: true }), STAY);
  });

  it('reload the route data after a new class, language or visibility, and only when it took', async () => {
    const f = fixture();
    await f.actions.onSetNodeClass!('class-x');
    await f.actions.onSetLocale!('de');
    await f.actions.onDismissLocaleSuggestion!();
    await f.actions.onSetVisibility!('restricted');
    expect(f.invalidateAll).toHaveBeenCalledTimes(4);

    const refused = fixture({ setVisibility: vi.fn(async () => ({ ok: false })), setLocale: vi.fn(async () => ({ ok: false, error: 'no' })) });
    await refused.actions.onSetVisibility!('public');
    await refused.actions.onSetLocale!('fr');
    expect(refused.invalidateAll).not.toHaveBeenCalled();
  });

  it('hand tags, properties and shares straight to the client, without a reload', async () => {
    const f = fixture();
    expect(await f.actions.onSetTags!(['a'])).toEqual({ ok: true, tags: ['a'] });
    await f.actions.onSetShares!(['u-1']);
    expect(f.client.setShares).toHaveBeenCalledWith(['u-1']);
    expect(f.invalidateAll).not.toHaveBeenCalled();
  });

  it('delete with the fallback sentence, let go of what needs letting go, then leave for the home page', async () => {
    const f = fixture();
    await f.actions.onDelete!();
    expect(f.client.remove).toHaveBeenCalledWith('Could not delete');
    expect(f.beforeDelete).toHaveBeenCalled();
    expect(f.goto).toHaveBeenCalledWith('/');

    const refused = fixture({ remove: vi.fn(async () => ({ ok: false, error: 'no' })) });
    expect(await refused.actions.onDelete!()).toEqual({ ok: false, error: 'no' });
    expect(refused.beforeDelete).not.toHaveBeenCalled();
    expect(refused.goto).not.toHaveBeenCalled();
  });
});
