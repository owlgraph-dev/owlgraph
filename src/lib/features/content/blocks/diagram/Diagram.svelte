<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Draws through the helper frame (mermaidFrame.ts) once in view, and again
  // when the canvas changes scheme. A drawing stays until the next replaces
  // it, so a redraw never flashes. The server renders the waiting state, so
  // hydration claims an identical tree.
  import type { Attachment } from 'svelte/attachments';
  import { mountDiagram, renderDiagramInFrame } from './mermaidFrame';
  import { CONTENT_SCHEME_CHANGE_EVENT, mermaidConfigFor } from './mermaidTheme';
  import { whenVisible } from './whenVisible';

  let {
    code = '',
    waiting = '',
    failed = '',
    empty = null,
  }: {
    code?: string;
    /** Shown until it is drawn. */
    waiting?: string;
    /** Before the drawing's error message. */
    failed?: string;
    /** The editor's hint for a block with no source; null on the page. */
    empty?: string | null;
  } = $props();

  type Drawing = { svg: string; css: string };
  let diagramEl: HTMLElement | undefined = $state();
  // Held only until it is put in, so the markup isn't kept twice.
  let next: Drawing | null = null;
  // Which drawing is in (each gets its own element), 0 for none.
  let shown = $state(0);
  let error = $state<string | null>(null);
  // The colours are baked into a drawing.
  let scheme = $state(0);

  $effect(() => {
    const changed = () => scheme++;
    window.addEventListener(CONTENT_SCHEME_CHANGE_EVENT, changed);
    return () => window.removeEventListener(CONTENT_SCHEME_CHANGE_EVENT, changed);
  });

  $effect(() => {
    const source = code;
    scheme; // track: a new scheme draws it again
    const el = diagramEl;
    if (!el || !source.trim()) {
      next = null;
      shown = 0;
      error = null;
      return;
    }
    let cancelled = false;
    const stop = whenVisible(el, () => {
      renderDiagramInFrame(source, mermaidConfigFor(el)).then(
        (drawn) => {
          if (cancelled) return;
          next = drawn;
          error = null;
          shown += 1;
        },
        (err: unknown) => {
          if (cancelled) return;
          next = null;
          shown = 0;
          error = err instanceof Error ? err.message : String(err);
        }
      );
    });
    return () => {
      cancelled = true;
      stop();
    };
  });

  const put: Attachment<HTMLElement> = (el) => {
    if (next) mountDiagram(el, next);
    next = null;
  };
</script>

<!-- Nothing beside the element: the editor's pre-wrap would draw a space as a line. -->
<div class="mermaid" bind:this={diagramEl}>{#if shown}{#key shown}<div class="diagram-drawing" {@attach put}></div>{/key}{:else if error}<pre class="diagram-error">{failed}: {error}</pre>{:else if code.trim()}<span class="diagram-waiting">{waiting}</span>{:else if empty}<em class="diagram-empty">{empty}</em>{/if}</div>
