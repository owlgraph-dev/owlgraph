// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import ColorSchemePage from './+page.svelte';
import type { PageData } from './$types';

// The page renders with its load's data for an admin; SvelteKit's `update` is
// played back by rendering it with what the load would give next.

type Post = { action: string | null; formData: FormData };

// `$app/forms`' enhance: the submit is caught before it leaves the page,
// recorded, and run through the page's submit function with the test's answer.
const forms = vi.hoisted(() => ({
  posts: [] as Post[],
  answer: (_post: Post): ActionResult => ({ type: 'success', status: 200 }),
  applied: async (_result: ActionResult): Promise<void> => {},
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
      const update = async () => forms.applied(result);
      if (typeof after === 'function') await after({ action, formData, formElement: form, result, update });
      else await update();
    }
    form.addEventListener('submit', onsubmit);
    return { destroy: () => form.removeEventListener('submit', onsubmit) };
  },
  applyAction: async () => {},
  deserialize: (text: string) => JSON.parse(text),
}));

type Readiness = PageData['readiness'];

// A page that follows the default and picks a text colour and an HTML block's inline one.
const FIELD_NOTES = { id: 'p-1', slug: 'field-notes', namespace_slug: null, title: 'Field notes', text: 1, border: 0, html: 1 };

const WITH_FINDINGS: Readiness = { inheriting: 2, pinned: 0, pages: [FIELD_NOTES], sample: [FIELD_NOTES] };

// The load's share of the page's data; the root layout's isn't read here.
const data = (schemeDefault: 'light' | 'dark' | 'adaptive', readiness: Readiness) =>
  ({ schemeDefault, readiness, themeColorShortfalls: [] }) as unknown as PageData;

const colorScheme = (start: PageData) => render(ColorSchemePage, { data: start });

const lastPost = () => forms.posts[forms.posts.length - 1];

afterEach(() => {
  forms.posts = [];
  forms.answer = () => ({ type: 'success', status: 200 });
  forms.applied = async () => {};
});

describe('the default colour scheme', () => {
  it('lets pages adapt only through the checklist, whose confirm waits for every box, then posts adaptive', async () => {
    const view = colorScheme(data('light', WITH_FINDINGS));
    forms.applied = (result) => view.rerender({ data: data(result.type === 'success' ? 'adaptive' : 'light', WITH_FINDINGS) });

    const adapts = screen.getByRole('radio', { name: "Adapts to the reader's scheme" });
    await adapts.click();
    const dialog = screen.getByRole('dialog', { name: 'Let pages adapt?' });
    await expect.element(dialog).toBeVisible();
    expect(forms.posts).toEqual([]);

    const confirm = dialog.getByRole('button', { name: 'Let pages adapt' });
    await expect.element(confirm).toBeDisabled();
    await expect.element(dialog).toHaveTextContent('The theme colours meet the contrast minimums in both schemes');
    const boxes = dialog.getByRole('checkbox').elements();
    // The report, the HTML block with inline colours, the dark preview.
    expect(boxes).toHaveLength(3);
    for (const [i, box] of boxes.entries()) {
      await expect.element(confirm).toBeDisabled();
      await dialog.getByRole('checkbox').nth(i).click();
      await expect.element(box).toHaveAttribute('data-state', 'checked');
    }
    await expect.element(confirm).toBeEnabled();
    await confirm.click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    expect(lastPost().action).toBe('?/setDefault');
    expect(lastPost().formData.get('scheme')).toBe('adaptive');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(adapts).toHaveAttribute('data-state', 'on');
  });

  it.each([['Dark', 'dark'], ['Light', 'light']] as const)('applies %s at once, with no checklist', async (name, scheme) => {
    const other = scheme === 'dark' ? 'light' : 'dark';
    const view = colorScheme(data(other, WITH_FINDINGS));
    forms.applied = (result) => view.rerender({ data: data(result.type === 'success' ? scheme : other, WITH_FINDINGS) });

    const radio = screen.getByRole('radio', { name, exact: true });
    await radio.click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    expect(lastPost().action).toBe('?/setDefault');
    expect(lastPost().formData.get('scheme')).toBe(scheme);
    await expect.element(radio).toHaveAttribute('data-state', 'on');
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the readiness table', () => {
  it('lists a page that may not read with what it picks, and Keep these pages light pins it and its row leaves', async () => {
    const view = colorScheme(data('light', WITH_FINDINGS));
    forms.answer = () => ({ type: 'success', status: 200, data: { pinned: 1 } });
    // Pinned light, the page no longer follows the default.
    forms.applied = (result) =>
      view.rerender({ data: data('light', result.type === 'success' ? { inheriting: 1, pinned: 1, pages: [], sample: [] } : WITH_FINDINGS) });

    const table = screen.getByRole('table', { name: 'Readiness' });
    const row = table.getByRole('row').filter({ hasText: 'Field notes' });
    await expect.element(row).toBeVisible();
    await expect.element(row).toHaveTextContent('1 text · 1 HTML');
    await expect.element(row.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/field-notes/edit');
    await expect.element(row.getByRole('link', { name: 'Preview in dark' })).toHaveAttribute('href', '/field-notes?scheme=dark');

    await screen.getByRole('button', { name: 'Keep these pages light' }).click();

    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    expect(lastPost().action).toBe('?/keepLight');
    expect(lastPost().formData.getAll('id')).toEqual([FIELD_NOTES.id]);
    await expect.element(row).not.toBeInTheDocument();
    await expect.element(screen.getByText('Every colour on these pages reads in both light and dark.')).toBeVisible();
  });
});
