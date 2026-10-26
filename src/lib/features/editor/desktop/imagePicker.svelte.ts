// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The desktop editor's one file input and what a picked image is for: a new
// image block, the selected image's replacement, or a background image. The
// input opens inside the click that asks for it, as a browser requires.
import type { EditorCore } from '../core/editorCore.svelte';

/** What each shell's file input takes: the phone's any image, so a phone can offer its camera. */
export const IMAGE_ACCEPT = { desktop: 'image/png,image/jpeg,image/webp,image/gif', phone: 'image/*' } as const;

type Upload = (file: File) => Promise<{ id: string } | null>;

export class ImagePicker {
  input = $state<HTMLInputElement | null>(null);
  #mode: 'insert' | 'replace' | 'background' = 'insert';
  // A background image (the block settings' Surface → Image): the asset goes
  // to whoever asked, not into an image block.
  #background: { onPicked: (assetId: string) => void; onBusy: (busy: boolean) => void } | null = null;
  #core: EditorCore;
  #upload: () => Upload | undefined;

  constructor(core: EditorCore, upload: () => Upload | undefined) {
    this.#core = core;
    this.#upload = upload;
  }

  /** A new image block, at the caret. */
  pickToInsert = () => {
    this.#mode = 'insert';
    this.input?.click();
  };

  /** The selected image's asset. */
  pickReplacement = () => {
    this.#mode = 'replace';
    this.input?.click();
  };

  /** A background image: `onPicked` gets the uploaded asset's id, `onBusy` the upload's progress. */
  pickBackground = (onPicked: (assetId: string) => void, onBusy: (busy: boolean) => void) => {
    this.#mode = 'background';
    this.#background = { onPicked, onBusy };
    this.input?.click();
  };

  /** The input's change. */
  onPicked = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      if (this.#mode === 'background') {
        const pick = this.#background;
        pick?.onBusy(true);
        const upload = this.#upload();
        const res = file.type.startsWith('image/') && upload ? await upload(file) : null;
        pick?.onBusy(false);
        if (res?.id) pick?.onPicked(res.id);
      } else if (this.#mode === 'replace') await this.#core.replaceSelectedWith(file);
      else await this.#core.insertUploadedImage(file);
    }
    this.#background = null;
    input.value = ''; // allow re-selecting the same file
    this.#mode = 'insert';
  };
}
