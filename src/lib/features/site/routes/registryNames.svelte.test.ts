// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import ParagraphStyleModal from './ParagraphStyleModal.svelte';
import PageLayoutPresetModal from './PageLayoutPresetModal.svelte';
import { SEED_PAGE_LAYOUT_PRESETS } from '$lib/features/pages';
import type { ParagraphStyle } from '$lib/features/content';

// Each language posts as `<name>.<locale>`, which the route adapters read back
// (docs/architecture/languages.md); English is the site default here.

const SUBTITLE: ParagraphStyle = { id: 's-h2', label: { en: 'Subtitle', de: 'Untertitel' }, renderAs: 'h2', baseRole: 'h2', tokenId: null, isDefault: true, position: 2 };

const posted = (formId: string) => new FormData(document.getElementById(formId) as HTMLFormElement);

describe('a paragraph style’s name', () => {
  it('is edited in every language and posted per language, and Save waits for English', async () => {
    render(ParagraphStyleModal, { open: true, onOpenChange: vi.fn(), mode: 'edit', style: SUBTITLE, tokens: [], error: null, onSaved: vi.fn() });
    const dialog = screen.getByRole('dialog');
    await expect.element(dialog.getByRole('textbox', { name: 'Name English', exact: true })).toHaveValue('Subtitle');
    expect(posted('paragraph-style-form').get('label.en')).toBe('Subtitle');
    expect(posted('paragraph-style-form').get('label.de')).toBe('Untertitel');

    const save = dialog.getByRole('button', { name: 'Save' });
    await expect.element(save).toBeEnabled();
    await userEvent.clear(dialog.getByRole('textbox', { name: 'Name English', exact: true }));
    await expect.element(save).toBeDisabled();
  });
});

describe('a page layout’s name and description', () => {
  it('are edited in every language and posted per language', async () => {
    const standard = SEED_PAGE_LAYOUT_PRESETS.find((p) => p.id === 'standard')!;
    render(PageLayoutPresetModal, { open: true, onOpenChange: vi.fn(), mode: 'edit', preset: standard, error: null, onSaved: vi.fn() });
    const dialog = screen.getByRole('dialog');
    await expect.element(dialog.getByRole('textbox', { name: 'Description English', exact: true })).toHaveValue('Blocks one after another in the reading column.');
    const form = posted('page-layout-form');
    expect([form.get('label.en'), form.get('label.de')]).toEqual(['Standard', 'Standard']);
    expect(form.get('description.de')).toBe('Blöcke untereinander in der Lesebreite.');
  });
});
