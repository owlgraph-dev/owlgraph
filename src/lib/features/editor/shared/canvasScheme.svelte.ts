// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The colour scheme the canvas renders in. A pinned scheme is what readers
// see; an adaptive page is previewed in either on desktop, starting in the one
// the author views the app in, and follows the author's own on the phone.
// Construct during a shell's init: the preview registers an effect.
import { tick } from 'svelte';
import { resolveContentScheme, canvasScheme, CONTENT_SCHEME_CHANGE_EVENT, type ContentScheme } from '$lib/features/content';
import { currentColorPref } from '$lib/design-system/theme/applyColorPref';

export class CanvasScheme {
  /** The page's scheme, else the site's. */
  resolved: ContentScheme;
  /** The scheme an adaptive page is previewed in (desktop only). */
  preview = $state<'light' | 'dark'>('light');
  /** The canvas's `data-scheme`: none lets it follow the author's own. */
  attr: 'light' | 'dark' | undefined;

  constructor(source: () => { page: ContentScheme | null; site: ContentScheme }, opts: { preview: boolean }) {
    this.resolved = $derived(resolveContentScheme(source()));
    this.attr = $derived(opts.preview ? (canvasScheme(this.resolved) ?? this.preview) : canvasScheme(this.resolved));
    if (!opts.preview) return;
    // Diagrams bake their colours in when they render, so a scheme change is
    // announced (not on the first run: they render in it already).
    let renderedScheme: string | undefined | null = null;
    $effect(() => {
      const scheme = this.attr;
      if (renderedScheme !== null && renderedScheme !== scheme) tick().then(() => window.dispatchEvent(new Event(CONTENT_SCHEME_CHANGE_EVENT)));
      renderedScheme = scheme;
    });
  }

  /** Starts the preview in the scheme the author views the app in; on mount. */
  startPreview = () => {
    const pref = currentColorPref();
    this.preview = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  };
}
