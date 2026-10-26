// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import DeletePageModal from './DeletePageModal.svelte';

// The dialog alone; the delete itself and who may make it are the e2e test's
// and pages.http.test.ts's.

describe('the delete-page dialog', () => {
  it('closes on Cancel without confirming', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const view = render(DeletePageModal, {
      open: true,
      isHomePage: false,
      busy: false,
      error: null,
      onConfirm,
      onOpenChange: (open: boolean) => {
        onOpenChange(open);
        void view.rerender({ open });
      },
    });

    const dialog = screen.getByRole('dialog');
    await expect.element(dialog.getByRole('heading', { name: 'Delete this page?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    await expect.element(dialog).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
