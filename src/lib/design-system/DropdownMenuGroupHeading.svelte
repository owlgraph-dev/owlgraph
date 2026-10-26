<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Names its group for assistive tech; not an item, so the arrow keys pass over it.
  import { DropdownMenu as BitsDropdownMenu } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let { class: className = '', children }: { class?: string; children?: Snippet } = $props();
</script>

<BitsDropdownMenu.GroupHeading>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-menu-group-heading {className}">
      {@render children?.()}
    </div>
  {/snippet}
</BitsDropdownMenu.GroupHeading>

<style>
  .ds-menu-group-heading {
    padding: 0.4rem 0.6rem 0.2rem;
    font-size: var(--ds-text-xs);
    font-weight: var(--ds-weight-semibold);
    color: var(--ds-color-muted);
    line-height: 1.4;
  }
</style>
