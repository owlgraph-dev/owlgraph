<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `html` comes from renderDoc, which sanitizes it (render.server.ts), so
  // {@html} renders safe markup.
  import { tick } from 'svelte';
  import { pageCanvasClass } from '../page/pageLayout';
  import { canvasScheme, type ContentScheme } from '../color/contentScheme';
  import { CONTENT_SCHEME_CHANGE_EVENT } from '../blocks/diagram/mermaidTheme';
  import { hydrateIslands } from '../blocks/scaffold/hydrateIslands';
  import { BLOCK_ISLANDS } from '../blocks/islands';
  // Imported here because the server-only renderer can't add CSS to the client bundle.
  import '../blocks/blocks.css';
  let {
    html,
    firstBlockBleeds = false,
    scheme = 'light',
    canvasRuleId,
    lang,
  }: {
    html: string;
    firstBlockBleeds?: boolean;
    /** The page's resolved content scheme (contentScheme.ts). */
    scheme?: ContentScheme;
    /** The canvas's per-page rule id, registered beside `html`; empty when the page sets nothing. */
    canvasRuleId: string;
    /** The content language (docs/architecture/languages.md); the page around keeps the interface's. */
    lang?: string;
  } = $props();

  let article: HTMLElement | undefined = $state();

  // The canvas is the `canvas` query container, and the blocks sit one element
  // inside it, as in the editor: only an element inside a container can query
  // it, and the gutters and top padding change per tier.
  const canvasClass = $derived(pageCanvasClass(firstBlockBleeds));

  // Svelte-drawn blocks hydrate once the new content is in the DOM and are
  // torn down before it changes again.
  $effect(() => {
    html; // track: hydrate whatever the rendered content now holds
    let cancelled = false;
    let stop: (() => void) | undefined;
    tick().then(() => {
      if (!cancelled && article) stop = hydrateIslands(article, BLOCK_ISLANDS);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  });

  // An adaptive page's scheme can change while open; what bakes the scheme in
  // when it draws (a diagram) hears it through CONTENT_SCHEME_CHANGE_EVENT.
  $effect(() => {
    if (scheme !== 'adaptive') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => window.dispatchEvent(new Event(CONTENT_SCHEME_CHANGE_EVENT));
    media.addEventListener('change', changed);
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-pref'] });
    return () => {
      media.removeEventListener('change', changed);
      observer.disconnect();
    };
  });
</script>

<article bind:this={article} class="prose {canvasClass}" data-b={canvasRuleId || undefined} data-scheme={canvasScheme(scheme)} {lang}>
  <div class="canvas-blocks">{@html html}</div>
</article>

<style>
  /* No margin rules: block spacing is app.css's, shared with the editor. Base
     layer (platform/cssLayers.ts), so an HTML block's unlayered per-page rules
     keep beating these. */
  @layer base {
    .prose :global(a) { color: var(--content-link); }
  }
</style>
