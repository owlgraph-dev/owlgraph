// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, vi } from 'vitest';
import type { EditorCore } from '../core/editorCore.svelte';
import { ImagePicker } from './imagePicker.svelte';

const PHOTO = new File(['x'], 'photo.png', { type: 'image/png' });
const NOTES = new File(['x'], 'notes.txt', { type: 'text/plain' });

/** The picker over a core that records what it is handed, and a file input that records its opening. */
function picker(upload = vi.fn(async (_file: File) => ({ id: 'asset-1' }))) {
  const core = { insertUploadedImage: vi.fn(async () => 'img-1'), replaceSelectedWith: vi.fn(async () => {}) };
  const images = new ImagePicker(core as unknown as EditorCore, () => upload);
  const input = { click: vi.fn(), files: [] as File[], value: '' };
  images.input = input as unknown as HTMLInputElement;
  const choose = async (file: File) => {
    input.files = [file];
    input.value = file.name;
    await images.onPicked({ currentTarget: input } as unknown as Event);
  };
  return { core, images, input, upload, choose };
}

describe('the desktop image picker', () => {
  it('opens the file input inside the click, and inserts the picked image at the caret', async () => {
    const { core, images, input, choose } = picker();
    images.pickToInsert();
    expect(input.click).toHaveBeenCalledOnce();
    await choose(PHOTO);
    expect(core.insertUploadedImage).toHaveBeenCalledWith(PHOTO);
    expect(core.replaceSelectedWith).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it("replaces the selected image's asset, then inserts again on the next pick", async () => {
    const { core, images, choose } = picker();
    images.pickReplacement();
    await choose(PHOTO);
    expect(core.replaceSelectedWith).toHaveBeenCalledWith(PHOTO);
    expect(core.insertUploadedImage).not.toHaveBeenCalled();
    await choose(PHOTO);
    expect(core.insertUploadedImage).toHaveBeenCalledWith(PHOTO);
  });

  it('hands a background image to whoever asked, with its upload in progress meanwhile', async () => {
    const { core, images, upload, choose } = picker();
    const picked = vi.fn();
    const busy: boolean[] = [];
    images.pickBackground(picked, (b) => busy.push(b));
    await choose(PHOTO);
    expect(upload).toHaveBeenCalledWith(PHOTO);
    expect(busy).toEqual([true, false]);
    expect(picked).toHaveBeenCalledWith('asset-1');
    expect(core.insertUploadedImage).not.toHaveBeenCalled();
  });

  it('uploads no background that is not an image', async () => {
    const { images, upload, choose } = picker();
    const picked = vi.fn();
    images.pickBackground(picked, () => {});
    await choose(NOTES);
    expect(upload).not.toHaveBeenCalled();
    expect(picked).not.toHaveBeenCalled();
  });
});
