// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import CssField from './CssField.svelte';
import { contentTokens } from '../customStyles/contentTokens';

// "page", the family of the page's own colours, is in no token's name: the
// picker finds it by the token's hint.

describe('the CSS field’s token picker', () => {
  it('finds a token by its family and inserts it at the caret', async () => {
    render(CssField, { tokens: contentTokens(), id: 'free-css', name: 'css', ariaLabel: 'Free CSS' });
    const css = screen.getByRole('textbox', { name: 'Free CSS' });

    await userEvent.fill(css, '.lead { color:  }');
    // The caret between the two spaces, where the value goes.
    await userEvent.keyboard('{End}{ArrowLeft}{ArrowLeft}');

    await screen.getByRole('button', { name: 'Insert token' }).click();
    const search = screen.getByRole('combobox');
    await expect.element(search).toHaveFocus();
    await userEvent.fill(search, 'page');

    const accent = screen.getByRole('listbox', { name: 'Insert token' }).getByRole('option', { name: /^--content-accent\s+page$/ });
    await expect.element(accent).toBeVisible();
    await accent.click();

    await expect.element(css).toHaveValue('.lead { color: var(--content-accent) }');
  });
});
