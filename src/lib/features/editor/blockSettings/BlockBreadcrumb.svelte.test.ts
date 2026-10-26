// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import BlockBreadcrumb from './BlockBreadcrumb.svelte';
import type { SelectionChainEntry } from '$lib/features/content/editor';

// The breadcrumb alone; the selection in the live document is the editor's
// (editor-overlays.spec.ts).

const entry = (type: string, pos: number): SelectionChainEntry => ({ type, id: null, attrs: {}, pos });

// Page › Container › Cell › Paragraph.
const CHAIN = [entry('page', -1), entry('grid', 0), entry('gridCell', 1), entry('paragraph', 2)];

function breadcrumb() {
  const onSelect = vi.fn();
  const view = render(BlockBreadcrumb, {
    chain: CHAIN,
    selectedIndex: CHAIN.length - 1,
    onSelect: (i: number) => {
      onSelect(i);
      void view.rerender({ selectedIndex: i });
    },
  });
  return { onSelect, nav: screen.getByRole('navigation', { name: 'Block ancestry' }) };
}

describe('the block breadcrumb', () => {
  it('collapses deep ancestry into a More levels menu that still selects any ancestor, and ↑ stops at the page', async () => {
    const { onSelect, nav } = breadcrumb();

    await expect.element(nav.getByRole('button', { name: 'Paragraph', exact: true })).toHaveAttribute('aria-current', 'true');
    await expect.element(nav.getByRole('button', { name: 'Cell', exact: true })).toBeVisible();
    await expect.element(nav.getByRole('button', { name: 'Grid', exact: true })).not.toBeInTheDocument();
    await expect.element(nav.getByRole('button', { name: 'Page', exact: true })).not.toBeInTheDocument();

    await nav.getByRole('button', { name: 'More levels' }).click();
    await expect.element(screen.getByRole('menuitem', { name: 'Page' })).toBeVisible();
    await screen.getByRole('menuitem', { name: 'Grid' }).click();
    expect(onSelect).toHaveBeenLastCalledWith(1);
    await expect.element(nav.getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-current', 'true');
    await expect.element(nav.getByRole('button', { name: 'More levels' })).not.toBeInTheDocument();

    const up = nav.getByRole('button', { name: 'Select parent block' });
    await up.click();
    expect(onSelect).toHaveBeenLastCalledWith(0);
    await expect.element(nav.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-current', 'true');
    await expect.element(up).toBeDisabled();
  });
});
