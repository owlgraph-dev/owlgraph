// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from 'vitest/browser';
import PagePropertiesDialog from './PagePropertiesDialog.svelte';
import type { NodeClassOption } from '../nodeClass';

// Picking classes is the route's PATCH and reload; the test plays the reload
// back by handing the dialog the classes' definitions, as classFields would.

const PAGE_TYPE: NodeClassOption = { id: 'c-page', slug: 'page', label: 'Page', description: '', kind: 'type', parentId: 'c-root', nodeType: 'page', depth: 1 };
const WORK_PACKAGE: NodeClassOption = { id: 'c-work-package', slug: 'work-package', label: 'Work package', description: '', kind: 'domain', parentId: 'c-page', nodeType: 'page', depth: 2 };
const REPORT: NodeClassOption = { id: 'c-report', slug: 'report', label: 'Report', description: '', kind: 'domain', parentId: 'c-page', nodeType: 'page', depth: 2 };
// Under the document type: never offered to a page.
const INVOICE: NodeClassOption = { id: 'c-invoice', slug: 'invoice', label: 'Invoice', description: '', kind: 'domain', parentId: 'c-document', nodeType: 'document', depth: 2 };
// The core group's definitions, the work package's fields.
const CORE_FIELDS = [
  { name: 'core:status', label: 'Status', datatype: 'text', description: '' },
  { name: 'core:priority', label: 'Priority', datatype: 'text', description: '' },
];
const CORE_GROUP = { slug: 'core', label: 'Core', fromClass: { id: WORK_PACKAGE.id, slug: WORK_PACKAGE.slug, label: WORK_PACKAGE.label } };
const STATUS = 'e2e-classified';

describe('a classified page’s properties dialog', () => {
  it('gives a page any number of the classes under its type, shows a picked class’s fields prefilled from the page’s values across closing and reopening, and turns them back into free properties when no class is left', async () => {
    const onSetNodeClasses = vi.fn(async (ids: string[]) => {
      // The route's reload: the page's classes, its type's when none, and their fields.
      const fields = ids.includes(WORK_PACKAGE.id);
      await view.rerender({ nodeClassIds: ids.length ? ids : [PAGE_TYPE.id], classDefinitions: fields ? CORE_FIELDS : [], classGroups: fields ? [CORE_GROUP] : [] });
      return { ok: true };
    });
    const view = await render(PagePropertiesDialog, {
      open: true,
      manualProperties: [{ name: 'core:status', value: STATUS }],
      onSetManualProperties: vi.fn(),
      propertyGroups: [{ slug: 'core', label: 'Core', description: '' }],
      nodeClassIds: [PAGE_TYPE.id],
      nodeClasses: [PAGE_TYPE, WORK_PACKAGE, REPORT, INVOICE],
      onSetNodeClasses,
    });
    const dialog = screen.getByRole('dialog');
    const classes = dialog.getByRole('combobox', { name: 'Classes', exact: true });
    const classFields = dialog.getByRole('button', { name: /\(\d+\)$/ });

    // A plain page is the page type: no class of its own, its type named in its place.
    await expect.element(classes).toHaveTextContent('Page');
    await expect.element(classFields).not.toBeInTheDocument();
    await expect.element(dialog.getByText(STATUS, { exact: true })).toBeVisible();

    // Two of the page classes picked; the document class is not on offer.
    await classes.click();
    await expect.element(screen.getByRole('option', { name: 'Invoice', exact: true })).not.toBeInTheDocument();
    await screen.getByRole('option', { name: 'Work package', exact: true }).click();
    expect(onSetNodeClasses).toHaveBeenLastCalledWith([WORK_PACKAGE.id]);
    await screen.getByRole('option', { name: 'Report', exact: true }).click();
    expect(onSetNodeClasses).toHaveBeenLastCalledWith([WORK_PACKAGE.id, REPORT.id]);
    await userEvent.keyboard('{Escape}');
    await expect.element(classes).toHaveTextContent('Work package, Report');

    // The work package's fields appear in place, the page-wide value in its field.
    await expect.element(classFields).toMatchTextContent('Class fields (2)');
    await classFields.click();
    await expect.element(dialog.getByLabelText('Status', { exact: true })).toHaveValue(STATUS);
    await expect.element(dialog.getByLabelText('Priority', { exact: true })).toHaveValue('');
    await expect.element(dialog.getByText(STATUS, { exact: true })).not.toBeInTheDocument();

    // Closed and reopened through the prop, as the host's binding does.
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await view.rerender({ open: false });
    await view.rerender({ open: true });
    await expect.element(dialog).toBeVisible();
    await expect.element(classes).toHaveTextContent('Work package, Report');
    await expect.element(classFields).toBeVisible();

    // Both taken away: just a page again, the value a free property.
    await classes.click();
    await screen.getByRole('option', { name: 'Work package', exact: true }).click();
    await screen.getByRole('option', { name: 'Report', exact: true }).click();
    await userEvent.keyboard('{Escape}');
    expect(onSetNodeClasses).toHaveBeenLastCalledWith([]);
    await expect.element(classes).toHaveTextContent('Page');
    await expect.element(classFields).not.toBeInTheDocument();
    await expect.element(dialog.getByLabelText('Priority', { exact: true })).not.toBeInTheDocument();
    await expect.element(dialog.getByText(STATUS, { exact: true })).toBeVisible();
  });
});
