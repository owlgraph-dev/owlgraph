<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A static surface for one item among many (a search result); the link inside
  // is the control and carries the focus ring.
  import type { Snippet } from 'svelte';

  let {
    as = 'article',
    size = 'md',
    class: className = '',
    children,
    ...rest
  }: {
    /** `article` for a self-contained item, `li` inside a list, `div` otherwise. */
    as?: 'article' | 'li' | 'div';
    /** `sm` for a dense grid or list. */
    size?: 'sm' | 'md';
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<svelte:element this={as} class="ds-card ds-card-{size} {className}" {...rest}>{@render children?.()}</svelte:element>

<style>
  .ds-card {
    display: flex;
    flex-direction: column;
    gap: var(--ds-space-sm);
    box-sizing: border-box;
    min-width: 0;
    padding: var(--ds-space-md);
    background: var(--ds-color-raised);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
    color: var(--ds-color-fg);
    font-family: var(--ds-font-sans);
    overflow-wrap: break-word;
  }
  .ds-card-sm { padding: var(--ds-space-sm); gap: var(--ds-space-sm); }
  /* On a phone every card takes the dense padding. */
  @media (max-width: 640px), (pointer: coarse) and (max-height: 500px) {
    .ds-card-md { padding: var(--ds-space-sm) calc(var(--ds-space-sm) + var(--ds-space-sm) / 2); }
  }
  /* A hovered link marks the frame, never the fill; the link is the consumer's
     markup, hence :global(). */
  .ds-card:has(:global(a:hover)) { border-color: var(--ds-color-border-hover); }
</style>
