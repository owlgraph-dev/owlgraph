// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The open flag of every layer the desktop editor draws over the canvas, and
// whether any is open: while one is, Escape is that layer's (keyboard.ts).
// A new panel's flag belongs here.

/** The toolbar's typography and named-style popovers, one open at a time. */
export type ToolbarPopover = 'weight' | 'family' | 'size' | 'color' | 'metrics' | 'customStyle';

export class EditorOverlays {
  more = $state(false);
  accessControl = $state(false);
  contentScheme = $state(false);
  tags = $state(false);
  pageProperties = $state(false);
  popover = $state<ToolbarPopover | null>(null);
  paragraphStyle = $state(false);
  insert = $state(false);
  linkPicker = $state(false);
  propertyPicker = $state(false);
  /** Any popover or menu of the block settings panel, reported up by it. */
  blockSettings = $state(false);
  any: boolean;

  /** `others`: whether a layer the shell keeps elsewhere is open (the block Edit dialog). */
  constructor(others: () => boolean) {
    this.any = $derived(
      this.more ||
        others() ||
        this.accessControl ||
        this.contentScheme ||
        this.popover !== null ||
        this.paragraphStyle ||
        this.insert ||
        this.linkPicker ||
        this.propertyPicker ||
        this.tags ||
        this.pageProperties ||
        this.blockSettings
    );
  }
}
