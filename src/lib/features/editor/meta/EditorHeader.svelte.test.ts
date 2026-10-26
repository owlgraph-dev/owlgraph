// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { page } from '$app/state';
import EditorHeader from './EditorHeader.svelte';

// The head row every node editor draws, its tags handed back as an editor's
// mirror hands them: at once. Unbound, its open flags are its own.

type Props = Parameters<typeof EditorHeader>[1];

function header(props: Partial<Props> = {}) {
  const sent: string[][] = [];
  const view = render(EditorHeader, {
    title: 'Plans',
    slug: 'plans',
    namespaceSlug: null,
    tags: ['plans'],
    tagSuggestions: [],
    accessControlOpen: false,
    moreOpen: false,
    tagsPopoverOpen: false,
    pagePropertiesDialogOpen: false,
    blockSettingsOpen: false,
    onRequestDelete: () => {},
    onSetTags: (next: string[]) => {
      sent.push(next);
      void view.rerender({ tags: next });
    },
    ...props,
  });
  return { sent, view };
}

afterEach(() => {
  page.data = {};
});

describe("a node editor's head row", () => {
  it('adds a tag once whatever its case, removes one, and sends the whole list each time', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    const { sent } = header();
    await screen.getByRole('button', { name: 'Tags' }).click();
    const add = screen.getByPlaceholder('Add a tag…');
    await expect.element(add).toBeVisible();

    await userEvent.fill(add, ' Q3 ');
    await userEvent.keyboard('{Enter}');
    await expect.element(screen.getByText('Q3', { exact: true })).toBeVisible();
    expect(sent).toEqual([['plans', 'Q3']]);

    await userEvent.fill(add, 'PLANS');
    await userEvent.keyboard('{Enter}');
    expect(sent).toEqual([['plans', 'Q3']]);

    await screen.getByRole('button', { name: 'Remove tag: plans' }).click();
    await expect.element(screen.getByRole('button', { name: 'Remove tag: plans' })).not.toBeInTheDocument();
    expect(sent).toEqual([['plans', 'Q3'], ['Q3']]);
  });

  it('draws the block settings toggle only for an editor that has the panel', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    const { view } = header();
    await expect.element(screen.getByRole('button', { name: 'Toggle block settings' })).toBeVisible();
    await view.rerender({ blockSettingsOpen: undefined });
    await expect.element(screen.getByRole('button', { name: 'Toggle block settings' })).not.toBeInTheDocument();
  });

  it('shows a refused rename under the row, the field kept open on what was typed', async () => {
    page.data = { user: { id: 'u-editor', role: 'editor' } };
    const onRename = vi.fn(async () => ({ ok: false, error: 'That title is taken' }));
    header({ onRename });

    await screen.getByRole('button', { name: 'Plans', exact: true }).click();
    const field = screen.getByRole('textbox', { name: 'Page title' });
    await userEvent.fill(field, 'Taken');
    await userEvent.keyboard('{Enter}');

    expect(onRename).toHaveBeenCalledWith({ title: 'Taken' });
    await expect.element(screen.getByText('That title is taken')).toBeVisible();
    await expect.element(field).toHaveValue('Taken');
    await expect.element(field).toHaveAttribute('aria-invalid', 'true');
    await expect.element(field).toHaveAccessibleDescription('That title is taken');
  });
});
