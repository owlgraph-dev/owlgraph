// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import NamespacesPage from './+page.svelte';
import type { PageData } from './$types';

// The page renders with its load's data; SvelteKit's `update` is played back
// by rendering it with what the load would give next.

type Post = { action: string | null; formData: FormData };

// `$app/forms`' enhance: the submit is caught before it leaves the page and
// run through the page's submit function with the test's answer.
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

type Row = PageData['namespaces'][number];

function namespace(extra: Partial<Row> & Pick<Row, 'id' | 'name'>): Row {
  return {
    slug: extra.name.toLowerCase().replace(/\s+/g, '-'),
    access_level: 'internal',
    is_default: false,
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-01T09:00:00.000Z',
    node_count: 0,
    inheriting_count: 0,
    ...extra,
  };
}

const DEFAULT = namespace({ id: 'ns-default', name: 'Default', slug: null, access_level: 'public', is_default: true, node_count: 12 });
const USERS = [
  { id: 'u-ada', name: 'Ada Admin', email: 'ada@example.org' },
  { id: 'u-bea', name: 'Bea Reader', email: 'bea@example.org' },
  { id: 'u-cy', name: '', email: 'cy@example.org' },
];

function data(namespaces: Row[], membersByNamespace: Record<string, string[]> = {}): PageData {
  return { namespaces, membersByNamespace, users: USERS } as PageData;
}

const rowOf = (text: string) => screen.getByRole('row').filter({ hasText: text });

beforeEach(() => {
  forms.posts = [];
  forms.answer = () => ({ type: 'success', status: 200 });
  forms.applied = async () => {};
});

describe('the namespaces list', () => {
  it('offers no Delete for the default namespace, its root row', async () => {
    render(NamespacesPage, { data: data([DEFAULT, namespace({ id: 'ns-a', name: 'Project A' })]), form: null });

    const root = rowOf('(root)');
    await expect.element(root).toBeVisible();
    await expect.element(root).toHaveTextContent('Default');
    await expect.element(root.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect.element(root.getByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await expect.element(rowOf('/project-a').getByRole('button', { name: 'Delete' })).toBeVisible();
  });
});

describe('the Add namespace dialog', () => {
  it('left untouched, starts on Internal and posts it (secure by default)', async () => {
    const view = render(NamespacesPage, { data: data([DEFAULT]), form: null });
    const made = namespace({ id: 'ns-new', name: 'Default Select NS', slug: 'default-select-ns', access_level: 'internal' });
    forms.applied = async () => view.rerender({ data: data([DEFAULT, made]) });

    await screen.getByRole('button', { name: 'Add namespace' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Add namespace' });
    await expect.element(dialog).toBeVisible();
    await userEvent.fill(dialog.getByRole('textbox', { name: 'Name', exact: true }), made.name);
    await userEvent.fill(dialog.getByRole('textbox', { name: 'URL prefix', exact: true }), made.slug!);
    // The access picker is left alone: what an admin gets by not thinking about it.
    await expect.element(dialog.getByRole('combobox', { name: 'Default access' })).toHaveTextContent('Internal — any signed-in user');
    await dialog.getByRole('button', { name: 'Create namespace' }).click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    const [post] = forms.posts;
    expect(post.action).toBe('?/create');
    expect(Object.fromEntries(post.formData)).toEqual({ name: made.name, slug: made.slug, accessLevel: 'internal' });
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(rowOf(`/${made.slug}`)).toHaveTextContent('Internal');
  });
});

describe('the Edit namespace dialog', () => {
  it('warns how many inheriting pages and documents a wider access level would open, before it is saved', async () => {
    const team = namespace({ id: 'ns-team', name: 'Team', access_level: 'restricted', node_count: 5, inheriting_count: 3 });
    render(NamespacesPage, { data: data([DEFAULT, team], { [team.id]: [] }), form: null });

    await rowOf('/team').getByRole('button', { name: 'Edit' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Edit namespace' });
    const access = dialog.getByRole('combobox', { name: 'Default access' });
    await expect.element(access).toHaveTextContent('Restricted');
    await expect.element(dialog.getByText('pages and documents take', { exact: false })).not.toBeInTheDocument();

    await access.click();
    await screen.getByRole('option', { name: 'Public — anyone, even signed-out' }).click();
    await expect
      .element(dialog.getByText("3 pages and documents take this namespace's access level and become public with it — visible to signed-out visitors too."))
      .toBeVisible();

    await access.click();
    await screen.getByRole('option', { name: 'Internal — any signed-in user' }).click();
    await expect.element(dialog.getByText("3 pages and documents take this namespace's access level and become visible to every signed-in user.")).toBeVisible();

    // Back to its own level: nothing widens, nothing to say.
    await access.click();
    await screen.getByRole('option', { name: /^Restricted/ }).click();
    await expect.element(dialog.getByText('pages and documents take', { exact: false })).not.toBeInTheDocument();
    expect(forms.posts).toEqual([]);
  });

  it('says nothing of a narrower level, nor of a namespace no page inherits from', async () => {
    const open = namespace({ id: 'ns-open', name: 'Open', access_level: 'public', node_count: 4, inheriting_count: 4 });
    const empty = namespace({ id: 'ns-empty', name: 'Empty', access_level: 'restricted', node_count: 2, inheriting_count: 0 });
    render(NamespacesPage, { data: data([DEFAULT, empty, open], { [empty.id]: [] }), form: null });

    await rowOf('/open').getByRole('button', { name: 'Edit' }).click();
    let dialog = screen.getByRole('dialog', { name: 'Edit namespace' });
    await dialog.getByRole('combobox', { name: 'Default access' }).click();
    await screen.getByRole('option', { name: /^Restricted/ }).click();
    await expect.element(dialog.getByText('pages and documents take', { exact: false })).not.toBeInTheDocument();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect.element(dialog).not.toBeInTheDocument();

    await rowOf('/empty').getByRole('button', { name: 'Edit' }).click();
    dialog = screen.getByRole('dialog', { name: 'Edit namespace' });
    await dialog.getByRole('combobox', { name: 'Default access' }).click();
    await screen.getByRole('option', { name: 'Public — anyone, even signed-out' }).click();
    await expect.element(dialog.getByText('pages and documents take', { exact: false })).not.toBeInTheDocument();
  });
});

describe('the Manage members dialog', () => {
  it("posts the members checked in it, and the namespace's row then counts them", async () => {
    const team = namespace({ id: 'ns-team', name: 'Team', access_level: 'restricted', node_count: 2 });
    const view = render(NamespacesPage, { data: data([DEFAULT, team], { [team.id]: ['u-ada'] }), form: null });
    forms.applied = async () => view.rerender({ data: data([DEFAULT, team], { [team.id]: ['u-ada', 'u-cy'] }) });

    const manage = rowOf('/team').getByRole('button', { name: /^Manage members/ });
    await expect.element(manage).toHaveTextContent('Manage members (1)');
    await manage.click();
    const dialog = screen.getByRole('dialog', { name: 'Members of "Team"' });
    await expect.element(dialog.getByRole('checkbox', { name: 'Ada Admin' })).toBeChecked();
    await expect.element(dialog.getByRole('checkbox', { name: 'Bea Reader' })).not.toBeChecked();
    // A user without a name goes by their address.
    await dialog.getByRole('checkbox', { name: 'cy@example.org' }).click();
    await dialog.getByRole('button', { name: 'Save members' }).click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    const [post] = forms.posts;
    expect(post.action).toBe('?/setMembers');
    expect(post.formData.get('id')).toBe(team.id);
    expect(post.formData.getAll('members')).toEqual(['u-ada', 'u-cy']);
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(rowOf('/team').getByRole('button', { name: /^Manage members/ })).toHaveTextContent('Manage members (2)');
  });
});
