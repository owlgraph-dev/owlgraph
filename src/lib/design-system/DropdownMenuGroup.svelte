<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Items under a DropdownMenuGroupHeading (its first child), which names the group.
  import { DropdownMenu as BitsDropdownMenu } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let { class: className = '', children }: { class?: string; children?: Snippet } = $props();
</script>

<BitsDropdownMenu.Group>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-menu-group {className}">
      {@render children?.()}
    </div>
  {/snippet}
</BitsDropdownMenu.Group>

<style>
  .ds-menu-group { display: flex; flex-direction: column; }
</style>
