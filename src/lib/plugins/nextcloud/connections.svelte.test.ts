// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { Toaster } from '$lib/design-system';
import { toaster } from '$lib/design-system/toast.svelte';
import ConnectionsPage from '../../../routes/settings/connections/+page.svelte';
import IntegrationSettingsPage from '../../../routes/settings/integrations/[plugin]/+page.svelte';
import type { PageData as ConnectionsData } from '../../../routes/settings/connections/$types';
import type { PageData as SettingsData } from '../../../routes/settings/integrations/[plugin]/$types';
import { nextcloud } from './index';
import { t } from './messages';

// The core's connections and integration settings pages for this plugin
// (docs/architecture/settings.md, "The personal group"). The connections API is a stand-in;
// the form's action is answered by the test, and its `update` played back by
// re-rendering with what the load would give next.

const navigation = vi.hoisted(() => ({ invalidated: 0, onInvalidate: async () => {} }));
vi.mock('$app/navigation', async (original) => ({
  ...(await original<typeof import('$app/navigation')>()),
  invalidateAll: async () => {
    navigation.invalidated++;
    await navigation.onInvalidate();
  },
}));

type Post = { action: string | null; formData: FormData };

// `enhance` catches the form's own submit and runs it through the page's submit
// function with the test's answer.
const forms = vi.hoisted(() => ({
  posts: [] as Post[],
  answer: (_post: Post): ActionResult => ({ type: 'success', status: 200 }),
  applied: async (_post: Post): Promise<void> => {},
}));

vi.mock('$app/forms', () => ({
  enhance(form: HTMLFormElement, submit?: SubmitFunction) {
    async function onsubmit(event: SubmitEvent) {
      event.preventDefault();
      const formData = new FormData(form, event.submitter);
      const action = new URL(form.action);
      let cancelled = false;
      const after = await submit?.({ action, formData, formElement: form, controller: new AbortController(), submitter: event.submitter, cancel: () => (cancelled = true) });
      if (cancelled) return;
      const post = { action: form.getAttribute('action'), formData };
      forms.posts.push(post);
      const result = forms.answer(post);
      const update = async () => forms.applied(post);
      if (typeof after === 'function') await after({ action, formData, formElement: form, result, update });
      else await update();
    }
    form.addEventListener('submit', onsubmit);
    return { destroy: () => form.removeEventListener('submit', onsubmit) };
  },
  applyAction: async () => {},
  deserialize: (text: string) => JSON.parse(text),
}));

const CLIENT = 'owlgraph (localhost)';

function connectionsData(connected: boolean): ConnectionsData {
  return {
    services: [
      {
        id: nextcloud.id,
        label: nextcloud.label(),
        intro: t('connections_intro'),
        available: true,
        connection: connected ? { accountLabel: 'Alice Example', state: 'active', since: '2026-10-01T09:00:00.000Z', lastUsed: null } : null,
        approveUrl: null,
      },
    ],
    clientName: CLIENT,
    returnTo: null,
  } as ConnectionsData;
}

function settingsData(connections: { active: number; total: number }): SettingsData {
  return {
    plugin: { id: nextcloud.id, label: nextcloud.label(), intro: nextcloud.settings!.intro() },
    enabled: true,
    fields: nextcloud.settings!.fields.map((field) => ({
      key: field.key,
      kind: field.kind,
      label: field.label(),
      description: field.description?.() ?? null,
      unit: field.kind === 'number' ? (field.unit?.() ?? null) : null,
      min: field.kind === 'number' ? field.min : null,
      max: field.kind === 'number' ? field.max : null,
      value: field.key === 'origin' ? 'https://cloud.example.org' : '60',
    })),
    canCheck: true,
    connections,
  } as SettingsData;
}

type Call = { method: string; url: string };

function api(answer: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { method: init?.method ?? 'GET', url: String(input) };
      calls.push(call);
      return answer(call) ?? new Response('not found', { status: 404 });
    })
  );
  return calls;
}

const toasts = () => screen.getByRole('region', { name: 'Notifications' });

beforeEach(() => {
  navigation.invalidated = 0;
  navigation.onInvalidate = async () => {};
  forms.posts = [];
  forms.answer = () => ({ type: 'success', status: 200 });
  forms.applied = async () => {};
});

afterEach(() => {
  vi.unstubAllGlobals();
  // The toasts are the app's one stack: none outlives its test.
  for (const item of [...toaster.items]) toaster.dismiss(item.id);
});

describe("a person's Nextcloud connection", () => {
  it('is disconnected here at once, and Nextcloud forgets the app password — or the person is told to remove it there', async () => {
    let remoteRevoked = true;
    const calls = api((call) =>
      call.method === 'DELETE' && call.url === `/api/connections/${nextcloud.id}` ? Response.json({ removed: true, remoteRevoked }) : undefined
    );
    const view = render(ConnectionsPage, { data: connectionsData(true) });
    // invalidateAll reloads the connection as the server now holds it.
    navigation.onInvalidate = () => view.rerender({ data: connectionsData(false) });

    const row = screen.getByRole('group', { name: 'Nextcloud' });
    await expect.element(row).toHaveTextContent('Connected as Alice Example');
    await row.getByRole('button', { name: 'Disconnect' }).click();
    await expect.element(row).toHaveTextContent('Not connected');
    await expect.element(row.getByRole('button', { name: 'Connect Nextcloud' })).toBeVisible();
    await expect.element(row.getByText('security settings', { exact: false })).not.toBeInTheDocument();
    expect(calls).toEqual([{ method: 'DELETE', url: `/api/connections/${nextcloud.id}` }]);
    expect(navigation.invalidated).toBe(1);

    // Nextcloud could not be asked: disconnected here all the same, with how to finish it there.
    remoteRevoked = false;
    await view.rerender({ data: connectionsData(true) });
    await expect.element(row).toHaveTextContent('Connected as Alice Example');
    await row.getByRole('button', { name: 'Disconnect' }).click();
    await expect.element(row).toHaveTextContent('Not connected');
    await expect
      .element(row.getByText(`Disconnected here, but Nextcloud could not be asked to forget the access. Remove “${CLIENT}” in your Nextcloud account’s security settings.`))
      .toBeVisible();
    expect(calls).toHaveLength(2);
  });
});

describe("the Nextcloud settings page's people's connections", () => {
  it('asks before Disconnect everyone, and its toast says how many connections it could not ask the service to forget', async () => {
    render(Toaster, { regionLabel: 'Notifications', closeLabel: 'Dismiss' });
    const view = render(IntegrationSettingsPage, { data: settingsData({ active: 3, total: 3 }), form: null });
    forms.answer = () => ({ type: 'success', status: 200, data: { cleared: 3, notAsked: 1 } });
    forms.applied = () => view.rerender({ data: settingsData({ active: 0, total: 0 }) });

    await expect.element(screen.getByText('Active connections: 3')).toBeVisible();
    await screen.getByRole('button', { name: 'Disconnect everyone' }).click();
    const confirm = screen.getByRole('dialog', { name: 'Disconnect everyone?' });
    await expect.element(confirm).toHaveTextContent('the service is asked to forget each access');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect.element(confirm).not.toBeInTheDocument();
    expect(forms.posts).toEqual([]);

    await screen.getByRole('button', { name: 'Disconnect everyone' }).click();
    await screen.getByRole('dialog', { name: 'Disconnect everyone?' }).getByRole('button', { name: 'Disconnect everyone' }).click();
    await vi.waitFor(() => expect(forms.posts.map((p) => p.action)).toEqual(['?/disconnectAll']));
    await expect.element(screen.getByRole('dialog', { name: 'Disconnect everyone?' })).not.toBeInTheDocument();
    // Removed here is not forgotten there: said so, never as a plain success.
    await expect
      .element(toasts())
      .toHaveTextContent("Connections removed: 3. The service could not be asked to forget 1 of them — each stays valid there until removed in that account's security settings.");
    await expect.element(screen.getByText('Active connections: 0')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Disconnect everyone' })).toBeDisabled();
  });

  it('says how many it removed when the service forgot every one of them', async () => {
    render(Toaster, { regionLabel: 'Notifications', closeLabel: 'Dismiss' });
    render(IntegrationSettingsPage, { data: settingsData({ active: 2, total: 2 }), form: null });
    forms.answer = () => ({ type: 'success', status: 200, data: { cleared: 2, notAsked: 0 } });

    await screen.getByRole('button', { name: 'Disconnect everyone' }).click();
    await screen.getByRole('dialog', { name: 'Disconnect everyone?' }).getByRole('button', { name: 'Disconnect everyone' }).click();
    await expect.element(toasts()).toHaveTextContent('Connections removed: 2');
    await expect.element(toasts()).not.toHaveTextContent('could not be asked');
  });
});
