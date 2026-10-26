// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import SurfaceField from './SurfaceField.svelte';
import type { SurfaceData } from '$lib/features/content';

// The value is held as the block settings panel holds a cell's surface (docs/architecture/theming.md,
// "Colour references").

describe('the surface field’s background', () => {
  it('offers the theme’s colours before the custom ones and stores the one picked as a reference, shown by name', async () => {
    const onChange = vi.fn();
    const view = render(SurfaceField, {
      value: undefined,
      onChange: (field: 'bg' | 'border' | 'radius' | 'shadow', value: string | number | null) => {
        onChange(field, value);
        void view.rerender({ value: { desktop: { [field]: value } } as SurfaceData });
      },
    });

    const background = screen.getByRole('button', { name: 'Background', exact: true });
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
    await expect.element(background).toHaveTextContent('Inverse');
  });
});
