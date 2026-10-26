<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The element the editor mounts into, as both page shells draw it: the
  // page's own canvas variables and class, its colour scheme, its language.
  import { pageCanvasVars, pageCanvasClass, type PageAttrs } from '$lib/features/content';
  // The same stylesheet the page imports.
  import '$lib/features/content/blocks/blocks.css';

  let {
    page,
    firstBlockBleeds,
    scheme,
    locale,
    class: extraClass = '',
    element = $bindable(),
  }: {
    /** The page's own settings, which the canvas renders as readers see them. */
    page: PageAttrs;
    firstBlockBleeds: boolean;
    /** The scheme the canvas renders in; none follows the author's own. */
    scheme: 'light' | 'dark' | undefined;
    locale?: string;
    /** A shell's own classes, such as the desktop's preview width. */
    class?: string;
    element?: HTMLDivElement;
  } = $props();

  const canvasStyle = $derived(pageCanvasVars(page));
  const canvasClass = $derived(pageCanvasClass(firstBlockBleeds));
</script>

<!-- lang: the content's language (docs/architecture/languages.md); the chrome keeps the interface's. -->
<div class="editor {canvasClass} {extraClass}" style={canvasStyle} data-scheme={scheme} lang={locale} bind:this={element}></div>

<style>
  /* The global :focus-visible ring would circle the whole contenteditable;
     the selected-block outline is the focus affordance instead. */
  .editor :global(.ProseMirror) {
    min-height: 2rem; outline: none;
  }
  /* The editor's view of a marked value; the published page renders it plain. */
  .editor :global(.sem-prop) { background: var(--ds-color-property-soft); color: var(--ds-color-property); border: 1px solid color-mix(in srgb, var(--ds-color-property) 22%, transparent); border-radius: var(--ds-radius-sm); padding: 0.02em 0.32em; }
  .editor :global(.sem-prop)::before { content: attr(data-label) ":\00a0"; font-weight: 700; font-size: 0.78em; opacity: 0.7; }
  /* Tinted apart, so a template slot never reads as a page fact. */
  .editor :global(.sem-prop.sem-param) { background: var(--ds-color-info-soft); color: var(--ds-color-info); border-color: color-mix(in srgb, var(--ds-color-info) 22%, transparent); }
  /* The links' styles are content/blocks/canvasContent.css, shared with the
     public renderer; the editor only adds the pointer. */
  .editor :global(.page-link), .editor :global(.doc-link) { cursor: pointer; }
</style>
