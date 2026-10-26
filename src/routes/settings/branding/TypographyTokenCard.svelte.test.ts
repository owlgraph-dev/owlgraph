// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import TypographyTokenCard from './TypographyTokenCard.svelte';

type Post = { action: string | null; formData: FormData };

// `$app/forms`' enhance: the submit is caught, recorded and answered with a success.
const forms = vi.hoisted(() => ({ posts: [] as Post[] }));

vi.mock('$app/forms', () => ({
  enhance(form: HTMLFormElement, submit?: SubmitFunction) {
    async function onsubmit(event: SubmitEvent) {
      event.preventDefault();
      const formData = new FormData(form, event.submitter);
      const action = new URL(form.action);
      forms.posts.push({ action: form.getAttribute('action'), formData });
      const after = await submit?.({ action, formData, formElement: form, controller: new AbortController(), submitter: event.submitter, cancel: () => {} });
      const result: ActionResult = { type: 'success', status: 200 };
      if (typeof after === 'function') await after({ action, formData, formElement: form, result, update: async () => {} });
    }
    form.addEventListener('submit', onsubmit);
    return { destroy: () => form.removeEventListener('submit', onsubmit) };
  },
  applyAction: async () => {},
  deserialize: (text: string) => JSON.parse(text),
}));

const LEGACY = { id: 'tok-1', name: 'Legacy px', family: null, size: 44, weight: null, lineHeight: null, letterSpacing: null };

describe('a typography token card', () => {
  it('shows a px size as the literal it is, and a save of the untouched card posts it back', async () => {
    render(TypographyTokenCard, { token: LEGACY, customFonts: [] });

    await expect.element(screen.getByRole('combobox', { name: 'Size' })).toHaveTextContent('44px (custom)');

    await screen.getByRole('button', { name: 'save', exact: true }).click();
    await vi.waitFor(() => expect(forms.posts).toHaveLength(1));
    const [post] = forms.posts;
    expect(post.action).toBe('?/updateTypographyToken');
    expect(post.formData.get('id')).toBe('tok-1');
    expect(post.formData.get('size')).toBe('44');
    expect(post.formData.get('name')).toBe('Legacy px');
  });
});
