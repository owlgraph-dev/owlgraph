// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import PropertyGroupModal from './PropertyGroupModal.svelte';

// The site default language is English here.

function modal() {
  render(PropertyGroupModal, { open: true, onOpenChange: vi.fn(), mode: 'create', row: null, error: null, onSaved: vi.fn() });
  return screen.getByRole('dialog');
}

describe('the property group dialog’s label', () => {
  it('keeps Save disabled while only a language other than English is filled, and marks English required in its language picker', async () => {
    const dialog = modal();
    const save = dialog.getByRole('button', { name: 'Save' });
    await dialog.getByLabelText('Key', { exact: true }).fill('e2egrp');
    await expect.element(save).toBeDisabled();

    const language = dialog.getByRole('combobox', { name: 'Label: Language' });
    await language.click();
    await expect.element(screen.getByRole('option', { name: /English.*required/ })).toBeVisible();
    await expect.element(screen.getByRole('option', { name: /Deutsch/ })).not.toHaveTextContent('required');
    await screen.getByRole('option', { name: /Deutsch/ }).click();
    await dialog.getByRole('textbox', { name: 'Label Deutsch', exact: true }).fill('Gruppe');
    await expect.element(save).toBeDisabled();

    // English, still empty, is marked missing beside its required mark.
    await language.click();
    await expect.element(screen.getByRole('option', { name: /English.*required.*missing/ })).toBeVisible();
    await screen.getByRole('option', { name: /English/ }).click();
    await dialog.getByRole('textbox', { name: 'Label English', exact: true }).fill('Group');
    await expect.element(save).toBeEnabled();
  });
});
