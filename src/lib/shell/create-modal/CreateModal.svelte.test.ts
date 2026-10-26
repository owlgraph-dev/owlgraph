// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { page } from '$app/state';
import CreateModal from './CreateModal.svelte';

// A stand-in answers POST /api/documents; create.http.test.ts has the real
// route's answers.

type Call = { url: string; method: string; body: BodyInit | null | undefined };

function api(answer: () => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
      if (url === '/api/documents' && init?.method === 'POST') return answer();
      return new Response('not found', { status: 404 });
    })
  );
  return calls;
}

function createDialog() {
  const onOpenChange = vi.fn();
  const view = render(CreateModal, {
    open: true,
    onOpenChange: (open: boolean) => {
      onOpenChange(open);
      void view.rerender({ open });
    },
  });
  return { ...view, onOpenChange, dialog: screen.getByRole('dialog', { name: 'Create' }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  page.data = {};
});

describe('the Create dialog’s document upload', () => {
  it('asks for a file when Upload is pressed without one, sends nothing and stays open', async () => {
    const calls = api(() => Response.json({ id: 'doc-1', slug: 'doc-1' }));
    const { dialog, onOpenChange } = createDialog();

    await dialog.getByRole('button', { name: 'Document' }).click();
    await expect.element(dialog.getByRole('heading', { name: 'Add a document' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Upload' }).click();

    await expect.element(dialog.getByText('Choose a file to upload.')).toBeVisible();
    expect(calls).toEqual([]);
    await expect.element(dialog).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows the error the upload’s answer carries (a 415 for an unsupported type) and stays open', async () => {
    const calls = api(() => Response.json({ error: { code: 'unsupported_file_type', message: "Files of type image/png can't be uploaded here.", type: 'image/png' } }, { status: 415 }));
    const { dialog, onOpenChange } = createDialog();

    await dialog.getByRole('button', { name: 'Document' }).click();
    await userEvent.upload(dialog.getByLabelText('File (PDF, .txt, .md)'), new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'image.png', { type: 'image/png' }));
    await dialog.getByRole('button', { name: 'Upload' }).click();

    await expect.element(dialog.getByText(/Files of type image\/png/)).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: '/api/documents', method: 'POST' });
    expect((calls[0].body as FormData).get('file')).toMatchObject({ name: 'image.png', type: 'image/png' });
    await expect.element(dialog).toBeVisible();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('closing the Create dialog', () => {
  it('closes on Escape, and reopened it starts again at the grid of cards', async () => {
    api(() => Response.json({ id: 'doc-1', slug: 'doc-1' }));
    const { dialog, onOpenChange, rerender } = createDialog();

    await dialog.getByRole('button', { name: 'Document' }).click();
    await expect.element(dialog.getByRole('heading', { name: 'Add a document' })).toBeVisible();

    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
    await expect.element(dialog).not.toBeInTheDocument();

    // The app bar's Create button opens it again.
    await rerender({ open: true });
    await expect.element(dialog.getByRole('button', { name: 'Page' })).toBeVisible();
    await expect.element(dialog.getByRole('button', { name: 'Document' })).toBeVisible();
    await expect.element(dialog.getByRole('heading', { name: 'Add a document' })).not.toBeInTheDocument();
  });
});
