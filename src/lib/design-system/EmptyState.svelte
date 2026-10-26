<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // One muted line saying there is nothing to show and, where there is an
  // obvious next step, its action. The message may carry inline markup.
  import type { Snippet } from 'svelte';

  let {
    size = 'md',
    layout = 'inline',
    live = false,
    class: className = '',
    children,
    actions,
  }: {
    /** `sm` for a dense surface. */
    size?: 'sm' | 'md';
    /** `inline` sits where the list would be; `centered` fills a results area. */
    layout?: 'inline' | 'centered';
    /** Announce it (role="status") — for results that change as the user types. */
    live?: boolean;
    class?: string;
    /** The message. */
    children: Snippet;
    /** The next step (an Add or Upload Button, `size="sm"`). */
    actions?: Snippet;
  } = $props();
</script>

<div class="ds-empty ds-empty-{size} ds-empty-{layout} {className}" role={live ? 'status' : undefined}>
  <p class="ds-empty-message">{@render children()}</p>
  {#if actions}<div class="ds-empty-actions">{@render actions()}</div>{/if}
</div>

<style>
  .ds-empty {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ds-space-sm) var(--ds-space-md);
    font-family: var(--ds-font-sans);
    color: var(--ds-color-muted);
    line-height: 1.5;
  }
  .ds-empty-md { font-size: var(--ds-text-md); }
  .ds-empty-sm { font-size: var(--ds-text-sm); }
  .ds-empty-centered {
    flex-direction: column;
    justify-content: center;
    padding: var(--ds-space-lg) var(--ds-space-md);
    text-align: center;
  }
  .ds-empty-message { margin: 0; min-width: 0; }
  .ds-empty-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-sm); }
</style>
