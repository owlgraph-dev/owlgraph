// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from 'vitest/browser';
import SurfaceField from './SurfaceField.svelte';
import type { SurfaceData } from '$lib/features/content';

// The value is held as the block settings panel holds a cell's surface (docs/architecture/theming.md,
// "Colour references").

describe('the surface field’s background', () => {
  it('offers the theme’s colours before the custom ones and stores the one picked as a reference, shown by name', async () => {
    const onChange = vi.fn();
    const view = await render(SurfaceField, {
      value: undefined,
      onChange: (field: 'bg' | 'border' | 'radius' | 'shadow', value: string | number | null) => {
        onChange(field, value);
        void view.rerender({ value: { desktop: { [field]: value } } as SurfaceData });
      },
    });

    // Named by its field and the colour it shows (docs/architecture/design-system/patterns.md,
    // "A trigger that shows a value"), so by the field alone across the pick.
    const background = screen.getByRole('button', { name: /^Background: / });
    await background.click();
    const theme = screen.getByRole('group', { name: 'Theme' });
    const custom = screen.getByRole('group', { name: 'Custom' });
    await expect.element(theme).toBeVisible();
    await expect.element(custom).toBeVisible();
    expect(theme.element().compareDocumentPosition(custom.element()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await theme.getByRole('button', { name: 'Inverse', exact: true }).click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('bg', 'token:inverse');
    await userEvent.keyboard('{Escape}');

    await expect.element(theme).not.toBeInTheDocument();
    await expect.element(background).toMatchTextContent('Inverse');
    await expect.element(screen.getByRole('button', { name: 'Background: Inverse', exact: true })).toBeVisible();
  });
});
