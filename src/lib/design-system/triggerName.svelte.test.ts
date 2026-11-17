// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import ColorPickerField from './ColorPickerField.svelte';
import IconPickerField from './IconPickerField.svelte';

// A trigger that shows a value is named by its field and that value, so what
// its face shows is part of its name (WCAG 2.5.3; docs/architecture/design-system/patterns.md,
// "A trigger that shows a value").

/** The trigger named `name`, after checking its title says the same and its face's words are in its name. */
async function trigger(name: string) {
  const button = page.getByRole('button', { name, exact: true });
  await expect.element(button).toBeVisible();
  const el = button.element();
  expect(el.getAttribute('title')).toBe(name);
  const face = (el.textContent ?? '').replace(/[∅\s]+/g, ' ').trim();
  expect(name).toContain(face);
}

const COLOR = { swatches: ['#123456'], noneLabel: 'Default', noneTitle: 'No colour', customTitle: 'Custom colour', ariaLabel: 'Background' };
const ACCENT = [{ value: 'accent', label: 'Accent', css: 'rgb(0 0 255)' }];
const ICON = { noneLabel: 'None', noneTitle: 'No icon', ariaLabel: 'Icon' };

describe('a colour picker’s trigger', () => {
  it('is named by its field and a theme colour’s name', async () => {
    await render(ColorPickerField, { ...COLOR, themeColors: ACCENT, value: 'accent' });
    await trigger('Background: Accent');
  });

  it('is named by its field and a custom colour’s value', async () => {
    await render(ColorPickerField, { ...COLOR, value: '#123456' });
    await trigger('Background: #123456');
  });

  it('is named by its field and the none label when unset', async () => {
    await render(ColorPickerField, { ...COLOR, value: null });
    await trigger('Background: Default');
  });
});

describe('an icon picker’s trigger', () => {
  it('is named by its field and the none label when unset', async () => {
    await render(IconPickerField, { ...ICON, value: null });
    await trigger('Icon: None');
  });

  it('is named by its field and the icon it shows', async () => {
    await render(IconPickerField, { ...ICON, value: 'link' });
    await trigger('Icon: link');
  });
});
