// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';
import SpacingField from './SpacingField.svelte';

describe('the spacing field’s per-side trigger', () => {
  it('is named as customizing the sides while none is overridden', async () => {
    render(SpacingField, { value: undefined, fallback: null, onChange: () => {} });
    const trigger = page.getByRole('button', { name: 'Customize sides', exact: true });
    await expect.element(trigger).toBeVisible();
    expect(trigger.element().getAttribute('title')).toBe('Customize sides');
  });

  it('carries the count of overridden sides its face shows in its name', async () => {
    // docs/architecture/design-system/patterns.md, "A trigger that shows a value".
    render(SpacingField, { value: { desktop: { top: 8, left: 4 } }, fallback: null, onChange: () => {} });
    const trigger = page.getByRole('button', { name: 'Customize sides · 2', exact: true });
    await expect.element(trigger).toBeVisible();
    await expect.element(trigger).toHaveTextContent('2');
    expect(trigger.element().getAttribute('title')).toBe('Customize sides · 2');
  });
});
