<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { DropdownMenu as BitsDropdownMenu } from 'bits-ui';
</script>

<BitsDropdownMenu.Separator>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-menu-separator"></div>
  {/snippet}
</BitsDropdownMenu.Separator>

<style>
  .ds-menu-separator {
    height: 1px;
    background: var(--ds-color-border);
    margin: 0.3rem 0;
  }
</style>
