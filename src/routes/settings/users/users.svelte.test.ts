// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import UsersPage from './+page.svelte';
import type { PageData } from './$types';
import { passwordProblem, passwordProblemMessage } from '$lib/features/auth';

// The page renders with its load's data for an admin; SvelteKit's `update` is
// played back by rendering it with what the route would hand it next.

type Post = { action: string | null; formData: FormData };

// `$app/forms`' enhance: the submit is caught before it leaves the page,
// recorded, and run through the page's submit function with the test's answer.
const forms = vi.hoisted(() => ({
  posts: [] as Post[],
  answer: (_post: Post): ActionResult => ({ type: 'success', status: 200 }),
  applied: async (_post: Post, _result: ActionResult): Promise<void> => {},
}));

vi.mock('$app/forms', () => ({
  enhance(form: HTMLFormElement, submit?: SubmitFunction) {
    async function onsubmit(event: SubmitEvent) {
      event.preventDefault();
      const formData = new FormData(form, event.submitter);
      const action = new URL(form.action);
      const post = { action: form.getAttribute('action'), formData };
      forms.posts.push(post);
      const after = await submit?.({ action, formData, formElement: form, controller: new AbortController(), submitter: event.submitter, cancel: () => {} });
      const result = forms.answer(post);
      const update = async () => forms.applied(post, result);
      if (typeof after === 'function') await after({ action, formData, formElement: form, result, update });
      else await update();
    }
    form.addEventListener('submit', onsubmit);
    return { destroy: () => form.removeEventListener('submit', onsubmit) };
  },
  applyAction: async () => {},
  deserialize: (text: string) => JSON.parse(text),
}));

type Row = PageData['users'][number];

const ME = { id: 'u-admin', email: 'admin@example.test', name: 'Admin', role: 'admin', is_active: true } as Row;
const EMAIL = 'new-user@example.test';

const data = (users: Row[]) => ({ users, meId: ME.id }) as unknown as PageData;
const lastPost = () => forms.posts[forms.posts.length - 1];

afterEach(() => {
  forms.posts = [];
  forms.answer = () => ({ type: 'success', status: 200 });
  forms.applied = async () => {};
});

describe('the user accounts', () => {
  it('adds a user through the modal, edits its role, and deactivates and reactivates it', async () => {
    let users: Row[] = [ME];
    const view = render(UsersPage, { data: data(users), form: null });

    // The server: a password under the policy is refused, everything else saved.
    forms.answer = ({ formData }) => {
      const problem = formData.has('password') && formData.get('password') !== '' ? passwordProblem(String(formData.get('password'))) : null;
      return problem ? { type: 'failure', status: 400, data: { error: { code: 'weak_password', message: passwordProblemMessage(problem), problem } } } : { type: 'success', status: 200, data: { ok: true } };
    };
    forms.applied = async ({ action, formData }, result) => {
      if (result.type === 'failure') return view.rerender({ form: result.data as { error: { code: string; message: string } } });
      const id = String(formData.get('id') ?? '');
      const role = String(formData.get('role')) as Row['role'];
      if (action === '?/create') users = [...users, { id: 'u-new', email: String(formData.get('email')), name: String(formData.get('name')), role, is_active: true } as Row];
      if (action === '?/update') users = users.map((u) => (u.id === id ? { ...u, role } : u));
      if (action === '?/setActive') users = users.map((u) => (u.id === id ? { ...u, is_active: formData.get('active') === 'true' } : u));
      await view.rerender({ data: data(users), form: { ok: true } });
    };

    const dialog = screen.getByRole('dialog');
    await screen.getByRole('button', { name: 'Add user' }).click();
    await expect.element(dialog).toBeVisible();
    await userEvent.fill(dialog.getByLabelText('Email', { exact: true }), EMAIL);
    await userEvent.fill(dialog.getByLabelText('Name (optional)', { exact: true }), 'New user');
    await userEvent.fill(dialog.getByLabelText('Password', { exact: true }), 'password');
    await dialog.getByRole('button', { name: 'Create user' }).click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    expect(lastPost().action).toBe('?/create');
    expect(Object.fromEntries(lastPost().formData)).toEqual({ email: EMAIL, name: 'New user', role: 'viewer', password: 'password' });
    // Refused, inside the modal, which stays open.
    await expect.element(dialog.getByText('Password must be at least 12 characters.')).toBeVisible();

    await userEvent.fill(dialog.getByLabelText('Password', { exact: true }), 'e2e-user-password');
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(2));
    expect(lastPost().formData.get('password')).toBe('e2e-user-password');
    await expect.element(dialog).not.toBeInTheDocument();

    const row = screen.getByRole('row').filter({ hasText: EMAIL });
    await expect.element(row).toHaveTextContent(/viewer/);
    await expect.element(row).toHaveTextContent(/Active/);

    await row.getByRole('button', { name: 'Edit' }).click();
    await expect.element(dialog.getByRole('heading', { name: 'Edit user' })).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Role' }).click();
    await screen.getByRole('option', { name: 'editor', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(3));
    expect(lastPost().action).toBe('?/update');
    expect(lastPost().formData.get('id')).toBe('u-new');
    expect(lastPost().formData.get('role')).toBe('editor');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(row).toHaveTextContent(/editor/);

    await row.getByRole('button', { name: 'deactivate' }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(4));
    expect(lastPost().action).toBe('?/setActive');
    expect(Object.fromEntries(lastPost().formData)).toEqual({ id: 'u-new', active: 'false' });
    await expect.element(row).toHaveTextContent(/Inactive/);

    await row.getByRole('button', { name: 'activate', exact: true }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(5));
    expect(Object.fromEntries(lastPost().formData)).toEqual({ id: 'u-new', active: 'true' });
    await expect.element(row).not.toHaveTextContent(/Inactive/);
    await expect.element(row).toHaveTextContent(/Active/);
  });
});
