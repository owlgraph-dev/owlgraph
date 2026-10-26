// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { page } from '$app/state';
import { CollectionEditor } from '$lib/features/editor/components';
import type { CollectionMember } from '$lib/features/collections';
import type { CollectionSourceView } from '$lib/features/pluginHost';
import { nextcloud } from './index';
import { t } from './messages';
import { stubFetch } from '$tests/component/fetch';

// A Nextcloud collection in the core's collection editor (docs/architecture/plugins.md,
// "Sources"); PUT /api/collections/<id>/source is a stand-in.

const COLLECTION_ID = 'c0000000-0000-4000-8000-0000000000c1';
const SHARE_URL = 'https://cloud.example.org/s/E2eLockedShare2';

/** As the edit route's load describes it. */
function source(problem: string | null): CollectionSourceView {
  const form = nextcloud.sources!.collection!;
  return {
    pluginLabel: nextcloud.label(),
    summary: { name: 'Intern', detail: t('describe_count', { count: 1 }), checkedAt: null, problem },
    form: { fields: form.fields.map((f) => ({ key: f.key, kind: f.kind, label: f.label(), description: f.description?.() ?? null, required: f.required })) },
  };
}

const MEMBER: CollectionMember = {
  id: 'd0000000-0000-4000-8000-0000000000c2',
  type: 'document',
  title: 'Vertrag.pdf',
  url: '/vertrag-pdf',
  position: 1,
  label: null,
  labelText: null,
  plugin: 'nextcloud',
  pluginLabel: 'Nextcloud',
};

afterEach(() => {
  vi.unstubAllGlobals();
  page.data = {};
});

describe('the Nextcloud integration', () => {
  it('connects a collection anew from its editor after the password changed', async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    const calls = stubFetch((call) => {
      if (call.method !== 'PUT' || call.url !== `/api/collections/${COLLECTION_ID}/source`) return undefined;
      const { password } = (call.body as { values: Record<string, string> }).values;
      return password === 'neu-e2e' ? Response.json({ ok: true }) : Response.json({ error: { code: 'refused', message: t('connect_unauthorized') } }, { status: 400 });
    });
    const onSourceConnected = vi.fn(() => void view.rerender({ source: source(null) }));
    const view = render(CollectionEditor, {
      collectionId: COLLECTION_ID,
      title: 'Intern',
      slug: 'intern',
      namespaceSlug: null,
      source: source(t('status_unauthorized')),
      onSourceConnected,
      members: [MEMBER],
      membersBasis: '',
      tags: [],
      manualProperties: [],
      locale: 'en',
      visibility: null,
      namespaceAccessLevel: 'public',
      namespaceId: 'ns-default',
      namespaces: [{ id: 'ns-default', name: 'Default', slug: null, isDefault: true }],
    });

    const section = view.container.querySelector('section.source') as HTMLElement;
    expect(section.textContent).toContain('Nextcloud · Intern');
    await expect.element(screen.getByText("The share's password changed")).toBeVisible();
    await screen.getByRole('button', { name: 'Connect anew' }).click();

    const dialog = screen.getByRole('dialog', { name: 'Connect the source anew' });
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Share link' }), SHARE_URL);
    await userEvent.fill(dialog.getByLabelText('Password'), 'falsch');
    await dialog.getByRole('button', { name: 'Connect' }).click();
    await expect.element(dialog.getByText('Nextcloud refused the password.')).toBeVisible();
    expect(onSourceConnected).not.toHaveBeenCalled();

    await userEvent.fill(dialog.getByLabelText('Password'), 'neu-e2e');
    await dialog.getByRole('button', { name: 'Connect' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    expect(onSourceConnected).toHaveBeenCalledOnce();
    await expect.element(screen.getByText("The share's password changed")).not.toBeInTheDocument();
    expect(calls).toEqual([
      { method: 'PUT', url: `/api/collections/${COLLECTION_ID}/source`, body: { values: { shareUrl: SHARE_URL, password: 'falsch' } } },
      { method: 'PUT', url: `/api/collections/${COLLECTION_ID}/source`, body: { values: { shareUrl: SHARE_URL, password: 'neu-e2e' } } },
    ]);

    // A member's page is a reader route with a strict style policy, so its link does a full load.
    const members = view.container.querySelector('section.members') as HTMLElement;
    expect(members.hasAttribute('data-sveltekit-reload')).toBe(true);
    await expect.element(screen.getByRole('link', { name: 'Vertrag.pdf' })).toHaveAttribute('href', MEMBER.url);
  });
});
