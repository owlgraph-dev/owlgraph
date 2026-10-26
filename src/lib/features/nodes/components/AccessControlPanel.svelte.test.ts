// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { nodeMetaClient } from '$lib/features/nodes';
import AccessControlPanel from './AccessControlPanel.svelte';
import { stubFetch } from '$tests/component/fetch';

// The panel wired to the node client as the editors wire it, the page API
// stubbed. What a share link serves is shareLinks.http.test.ts's.

const PAGE_ID = 'p0000000-0000-4000-8000-000000000001';

/** The panel as a page's editor mounts it: open, its actions the node client's. */
function panel(props: { visibility: string | null; namespaceAccessLevel: string; shareLinks?: { id: string; label: string; createdAt: string }[] }) {
  const client = nodeMetaClient('pages', PAGE_ID);
  const onClose = vi.fn(() => void view.rerender({ open: false }));
  const view = render(AccessControlPanel, {
    open: true,
    ...props,
    onSetVisibility: (v: string | null) => client.setVisibility(v),
    onCreateShareLink: (label: string) => client.createShareLink(label),
    onRevokeShareLink: (id: string) => client.revokeShareLink(id),
    onClose,
  });
  return { view, onClose, dialog: screen.getByRole('dialog', { name: 'Access control' }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the access level in a public namespace', () => {
  it("offers the namespace's level as Same as namespace, never a Public of its own, and applying it stores inherit", async () => {
    const calls = stubFetch((call) => (call.method === 'PATCH' && call.url === `/api/pages/${PAGE_ID}` ? Response.json({ visibility: null }) : undefined));
    const { dialog, onClose } = panel({ visibility: 'internal', namespaceAccessLevel: 'public' });

    const level = dialog.getByRole('combobox', { name: 'Who can view this page' });
    await expect.element(level).toHaveTextContent('Internal — any signed-in user');
    await level.click();
    const options = screen.getByRole('option');
    await vi.waitFor(() => expect(options.elements()).toHaveLength(3));
    expect(options.elements().map((o) => o.textContent?.trim())).toEqual([
      'Same as namespace (public: anyone, even signed-out)',
      'Internal — any signed-in user',
      'Restricted — only selected users',
    ]);
    expect(screen.getByRole('option', { name: /^Public/ }).elements()).toHaveLength(0);

    await screen.getByRole('option', { name: 'Same as namespace (public: anyone, even signed-out)' }).click();
    await expect.element(dialog.getByText('Follows the namespace, also when an admin changes its access level later.')).toBeVisible();
    expect(calls).toEqual([]);
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(calls).toEqual([{ method: 'PATCH', url: `/api/pages/${PAGE_ID}`, body: { visibility: null } }]);
  });

  it('reads a stored Public as what it amounts to: the namespace’s level', async () => {
    stubFetch(() => undefined);
    const { dialog } = panel({ visibility: 'public', namespaceAccessLevel: 'public' });
    await expect.element(dialog.getByRole('combobox', { name: 'Who can view this page' })).toHaveTextContent('Same as namespace (public: anyone, even signed-out)');
  });
});

describe('the share links', () => {
  const link = { id: 'link-1', token: 'tok-secret-1', label: 'For the board', createdAt: '2026-10-20T08:00:00.000Z' };

  it('makes a share link, shows its address once, and revokes it after a confirmation', async () => {
    const calls = stubFetch((call) => {
      if (call.method === 'POST' && call.url === `/api/pages/${PAGE_ID}/share-links`) return Response.json(link, { status: 201 });
      if (call.method === 'DELETE' && call.url === `/api/pages/${PAGE_ID}/share-links/${link.id}`) return new Response(null, { status: 204 });
    });
    const { dialog } = panel({ visibility: null, namespaceAccessLevel: 'public', shareLinks: [] });
    await expect.element(dialog.getByText('No share links yet.', { exact: false })).toBeVisible();

    const label = dialog.getByRole('textbox', { name: 'Label (optional)' });
    await userEvent.fill(label, link.label);
    await dialog.getByRole('button', { name: 'Create link' }).click();

    await expect.element(dialog.getByText("Copy this link now — it won't be shown again.")).toBeVisible();
    const address = dialog.getByRole('textbox', { name: 'Share links' });
    await expect.element(address).toHaveValue(`${window.location.origin}/share/${link.token}`);
    await expect.element(address).toHaveAttribute('readonly');
    await expect.element(dialog.getByText(link.label, { exact: true })).toBeVisible();
    expect(calls).toEqual([{ method: 'POST', url: `/api/pages/${PAGE_ID}/share-links`, body: { label: link.label } }]);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await dialog.getByRole('button', { name: 'Revoke' }).click();
    expect(confirm).toHaveBeenCalledWith('Revoke this share link? Anyone using it will lose access immediately.');
    expect(calls.filter((c) => c.method === 'DELETE')).toEqual([]);
    await expect.element(dialog.getByText(link.label, { exact: true })).toBeVisible();

    confirm.mockReturnValueOnce(true);
    await dialog.getByRole('button', { name: 'Revoke' }).click();
    await expect.element(dialog.getByText(link.label, { exact: true })).not.toBeInTheDocument();
    await expect.element(address).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([`/api/pages/${PAGE_ID}/share-links/${link.id}`]);
  });

  it('opened again, shows a link made before without its address', async () => {
    stubFetch(() => undefined);
    const { view, dialog } = panel({ visibility: null, namespaceAccessLevel: 'public', shareLinks: [{ id: link.id, label: link.label, createdAt: link.createdAt }] });
    await expect.element(dialog.getByText(link.label, { exact: true })).toBeVisible();
    await expect.element(dialog.getByRole('textbox', { name: 'Share links' })).not.toBeInTheDocument();
    await expect.element(dialog.getByRole('button', { name: 'Revoke' })).toBeVisible();
    await view.rerender({ open: false });
    await view.rerender({ open: true });
    await expect.element(screen.getByRole('dialog', { name: 'Access control' }).getByText(link.label, { exact: true })).toBeVisible();
  });

  it('closed and opened again after a link was made, still lists that link, its address no longer shown', async () => {
    stubFetch((call) => (call.method === 'POST' && call.url === `/api/pages/${PAGE_ID}/share-links` ? Response.json(link, { status: 201 }) : undefined));
    // The route's list, which a create never reloads.
    const { view, dialog } = panel({ visibility: null, namespaceAccessLevel: 'public', shareLinks: [] });
    await dialog.getByRole('button', { name: 'Create link' }).click();
    await expect.element(dialog.getByRole('textbox', { name: 'Share links' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await view.rerender({ open: true });
    const again = screen.getByRole('dialog', { name: 'Access control' });
    await expect.element(again.getByRole('textbox', { name: 'Share links' })).not.toBeInTheDocument();
    await expect.element(again.getByText(link.label, { exact: true }), { timeout: 2000 }).toBeVisible();
  });

  it('keeps a new link’s address shown while its route reloads the list, and lists the link once', async () => {
    stubFetch((call) => (call.method === 'POST' && call.url === `/api/pages/${PAGE_ID}/share-links` ? Response.json(link, { status: 201 }) : undefined));
    const { view, dialog } = panel({ visibility: null, namespaceAccessLevel: 'public', shareLinks: [] });
    await dialog.getByRole('button', { name: 'Create link' }).click();
    await expect.element(dialog.getByRole('textbox', { name: 'Share links' })).toBeVisible();

    await view.rerender({ shareLinks: [{ id: link.id, label: link.label, createdAt: link.createdAt }] });
    await expect.element(dialog.getByRole('textbox', { name: 'Share links' })).toBeVisible();
    await expect.element(dialog.getByText(link.label, { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await view.rerender({ open: true });
    const again = screen.getByRole('dialog', { name: 'Access control' });
    await expect.element(again.getByRole('textbox', { name: 'Share links' })).not.toBeInTheDocument();
    expect(again.getByText(link.label, { exact: true }).elements()).toHaveLength(1);
  });
});
