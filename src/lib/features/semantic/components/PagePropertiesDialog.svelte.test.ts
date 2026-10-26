// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import PagePropertiesDialog from './PagePropertiesDialog.svelte';
import type { NodeClassOption } from '../nodeClass';

// Picking a class is the route's PATCH and reload; the test plays the reload
// back by handing the dialog the class's definitions, as classFields would.

const PAGE_TYPE: NodeClassOption = { id: 'c-page', slug: 'page', label: 'Page', description: '', kind: 'type', parentId: 'c-root', nodeType: 'page', depth: 1 };
const WORK_PACKAGE: NodeClassOption = { id: 'c-work-package', slug: 'work-package', label: 'Work package', description: '', kind: 'domain', parentId: 'c-page', nodeType: 'page', depth: 2 };
// The core group's definitions, the class's fields.
const CORE_FIELDS = [
  { name: 'core:status', label: 'Status', datatype: 'text', description: '' },
  { name: 'core:priority', label: 'Priority', datatype: 'text', description: '' },
];
const CORE_GROUP = { slug: 'core', label: 'Core', fromClass: { id: WORK_PACKAGE.id, slug: WORK_PACKAGE.slug, label: WORK_PACKAGE.label } };
const STATUS = 'e2e-classified';

describe('a classified page’s properties dialog', () => {
  it('shows the class’s fields once it is picked, prefilled from the page’s values, keeps them across closing and reopening, and turns them back into free properties when reset to the type', async () => {
    const onSetNodeClass = vi.fn(async (id: string | null) => {
      // The route's reload: the class's fields come with the page's data.
      await view.rerender({ nodeClassId: id, classDefinitions: id === WORK_PACKAGE.id ? CORE_FIELDS : [], classGroups: id === WORK_PACKAGE.id ? [CORE_GROUP] : [] });
      return { ok: true };
    });
    const view = render(PagePropertiesDialog, {
      open: true,
      manualProperties: [{ name: 'core:status', value: STATUS }],
      onSetManualProperties: vi.fn(),
      propertyGroups: [{ slug: 'core', label: 'Core', description: '' }],
      nodeClassId: PAGE_TYPE.id,
      nodeClasses: [PAGE_TYPE, WORK_PACKAGE],
      onSetNodeClass,
    });
    const dialog = screen.getByRole('dialog');
    const classSelect = dialog.getByLabelText('Class', { exact: true });
    const classFields = dialog.getByRole('button', { name: /\(\d+\)$/ });

    // A plain page IS the page type — the baseline option, never empty.
    await expect.element(classSelect).toHaveValue(PAGE_TYPE.id);
    await expect.element(classFields).not.toBeInTheDocument();
    await expect.element(dialog.getByText(STATUS, { exact: true })).toBeVisible();

    // Picked through the dialog, the collapsed class-fields section appears in place.
    await classSelect.selectOptions(WORK_PACKAGE.id);
    expect(onSetNodeClass).toHaveBeenCalledWith(WORK_PACKAGE.id);
    await expect.element(classSelect).toHaveValue(WORK_PACKAGE.id);
    await expect.element(classFields).toHaveTextContent('Class fields (2)');
    await classFields.click();
    await expect.element(dialog.getByLabelText('Status', { exact: true })).toHaveValue(STATUS);
    await expect.element(dialog.getByLabelText('Priority', { exact: true })).toHaveValue('');
    // The page-wide value is the field's now, not a free property beside it.
    await expect.element(dialog.getByText(STATUS, { exact: true })).not.toBeInTheDocument();

    // Closed and reopened through the prop, as the host's binding does.
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await view.rerender({ open: false });
    await view.rerender({ open: true });
    await expect.element(dialog).toBeVisible();
    await expect.element(classSelect).toHaveValue(WORK_PACKAGE.id);
    await expect.element(classFields).toBeVisible();

    // Back to just a page: the section goes, the value is a free property again.
    await classSelect.selectOptions(PAGE_TYPE.id);
    expect(onSetNodeClass).toHaveBeenLastCalledWith(PAGE_TYPE.id);
    await expect.element(classSelect).toHaveValue(PAGE_TYPE.id);
    await expect.element(classFields).not.toBeInTheDocument();
    await expect.element(dialog.getByLabelText('Priority', { exact: true })).not.toBeInTheDocument();
    await expect.element(dialog.getByText(STATUS, { exact: true })).toBeVisible();
  });
});
