<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `state` becomes `data-specimen`, which the specs address it by.
  import type { Snippet } from 'svelte';

  let {
    label,
    state,
    overlay = false,
    wide = false,
    children,
  }: {
    label: string;
    /** Locator id; defaults to the label slugified. */
    state?: string;
    /** Its first button opens a layer on click (`true`) or on hover or focus
     * (`'hover'`); the design-system a11y spec opens each and runs axe. */
    overlay?: boolean | 'hover';
    /** Span the full grid width (tables, settings rows). */
    wide?: boolean;
    children: Snippet;
  } = $props();

  const id = $derived(state ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
</script>

<div
  class="pg-specimen"
  class:pg-specimen-wide={wide}
  data-specimen={id}
  data-overlay={overlay ? id : undefined}
  data-overlay-open={overlay === 'hover' ? 'hover' : overlay ? 'click' : undefined}
>
  <div class="pg-specimen-body">{@render children()}</div>
  <div class="pg-specimen-label">{label}</div>
</div>

<style>
  .pg-specimen {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
    min-width: 0;
  }
  .pg-specimen-wide { grid-column: 1 / -1; }
  .pg-specimen-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ds-space-sm);
    padding: var(--ds-space-md);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
    background: var(--ds-color-bg);
    min-height: 3.5rem;
    min-width: 0;
    /* A wide control scrolls here, never the page; rings paint inside, so
       nothing is clipped. */
    overflow-x: auto;
  }
  .pg-specimen-wide .pg-specimen-body { display: block; }
  .pg-specimen-label {
    font-size: var(--ds-text-sm);
    color: var(--ds-color-muted);
    font-family: var(--ds-font-mono);
  }
</style>
