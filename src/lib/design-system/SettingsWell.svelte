<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // An inset surface in a settings row, for an asset that must be seen against
  // a neutral ground (the logo), with its actions beside it.
  import type { Snippet } from 'svelte';

  let {
    class: className = '',
    children,
    actions,
  }: {
    class?: string;
    children?: Snippet;
    /** Controls acting on the previewed thing. */
    actions?: Snippet;
  } = $props();
</script>

<div class="ds-well {className}">
  <div class="ds-well-preview">
    {@render children?.()}
  </div>
  {#if actions}
    <div class="ds-well-actions">
      {@render actions()}
    </div>
  {/if}
</div>

<style>
  .ds-well {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ds-space-md);
    box-sizing: border-box;
    width: 100%;
    padding: var(--ds-space-md);
    background: var(--ds-color-well);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
  }
  .ds-well-preview { display: flex; align-items: center; flex: 1 1 auto; min-width: 0; gap: var(--ds-space-md); }
  .ds-well-actions { display: flex; align-items: center; gap: var(--ds-space-sm); flex-wrap: wrap; }
</style>
