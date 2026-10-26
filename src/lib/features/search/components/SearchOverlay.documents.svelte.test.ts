// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { HL_START, HL_STOP } from '../searchSnippet';
import { searchOverlayOpen } from '../searchOverlayStore';
import SearchOverlay from './SearchOverlay.svelte';

const UPLOAD = { id: 'd-upload', type: 'document', title: 'Field notes', url: '/field-notes', snippet: `the ${HL_START}heron${HL_STOP} survey, page one` };
const LINK = { id: 'd-link', type: 'document', title: 'Heron census (DOI)', url: '/heron-census', snippet: `Source: ${HL_START}Heron${HL_STOP} Society annual census` };

function api() {
  const asked: { text: string; types: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/api/graphql') return new Response('not found', { status: 404 });
      const { variables } = JSON.parse(String(init?.body));
      asked.push(variables);
      const all = [UPLOAD, LINK];
      return Response.json({ data: { search: String(variables.text).toLowerCase() === 'heron' ? all : [] } });
    })
  );
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
  searchOverlayOpen.set(false);
});

describe('the search overlay', () => {
  it('lists a link document found by its metadata as a document, as it does an upload', async () => {
    const asked = api();
    render(SearchOverlay);
    searchOverlayOpen.set(true);
    const dialog = screen.getByRole('dialog', { name: 'Search' });
    await expect.element(dialog).toBeVisible();

    await userEvent.type(dialog.getByPlaceholder('Search…'), 'heron');
    const upload = dialog.getByRole('option').filter({ hasText: UPLOAD.title });
    const link = dialog.getByRole('option').filter({ hasText: LINK.title });
    await expect.element(link).toBeVisible();
    await expect.element(upload).toBeVisible();
    expect(asked.at(-1)).toEqual({ text: 'heron', types: null });

    // Both are documents, each with its snippet, the match marked.
    for (const [row, rest] of [
      [upload, 'survey, page one'],
      [link, 'Society annual census'],
    ] as const) {
      await expect.element(row).toHaveTextContent(/^\s*document/);
      await expect.element(row).toHaveTextContent(rest);
      expect(row.element().querySelector('mark')?.textContent?.toLowerCase()).toBe('heron');
    }

    // Narrowed to documents, the link document is still among them.
    await dialog.getByRole('radio', { name: 'Documents' }).click();
    await vi.waitFor(() => expect(asked.at(-1)).toEqual({ text: 'heron', types: ['document'] }));
    await expect.element(dialog.getByRole('option').filter({ hasText: LINK.title })).toBeVisible();
  });
});
