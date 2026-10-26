<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // `narrow` renders the cells at a block settings panel's width, a narrow-panel
  // primitive's real size.
  import type { Snippet } from 'svelte';

  let {
    title,
    narrow = false,
    children,
  }: {
    title?: string;
    narrow?: boolean;
    children: Snippet;
  } = $props();
</script>

<div class="pg-group">
  {#if title}<h3 class="pg-group-title">{title}</h3>{/if}
  <div class="pg-grid" class:pg-grid-narrow={narrow}>{@render children()}</div>
</div>

<style>
  .pg-group { margin: 0 0 var(--ds-space-lg); }
  .pg-group:last-child { margin-bottom: 0; }
  .pg-group-title {
    margin: 0 0 var(--ds-space-sm);
    font-size: var(--ds-text-sm);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-muted);
  }
  .pg-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: var(--ds-space-md);
  }
  .pg-grid-narrow { grid-template-columns: repeat(auto-fill, minmax(16rem, 17rem)); }
</style>
