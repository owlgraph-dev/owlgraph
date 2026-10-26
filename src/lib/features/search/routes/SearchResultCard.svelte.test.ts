// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import type { SearchResultCard as Result } from '$lib/features/search';
import SearchResultCard from './SearchResultCard.svelte';

const BASE: Result = { id: 'd-1', type: 'document', title: 'Uploaded note', url: '/d/uploaded-note', locale: 'en', className: null, documentKind: null, linkHost: '', excerpt: '', highlighted: false, updatedAt: '2026-10-01T10:00:00.000Z', namespaceName: '', tags: [] };

describe('a document’s result card', () => {
  it('names an uploaded document’s kind, and a link document’s with its host', async () => {
    render(SearchResultCard, { result: { ...BASE, documentKind: 'text' } });
    render(SearchResultCard, { result: { ...BASE, id: 'd-2', title: 'Cited paper', url: '/d/cited-paper', documentKind: 'link', linkHost: 'example.org' } });

    const cards = screen.getByTestId('search-result');
    const uploaded = cards.filter({ hasText: 'Uploaded note' });
    const linked = cards.filter({ hasText: 'Cited paper' });
    await expect.element(uploaded).toHaveTextContent('Text');
    await expect.element(uploaded).not.toHaveTextContent('Link');
    await expect.element(linked).toHaveTextContent(/Link\s·\sexample\.org/);
    await expect.element(uploaded.getByRole('link', { name: 'Uploaded note' })).toHaveAttribute('href', '/d/uploaded-note');
  });
});
