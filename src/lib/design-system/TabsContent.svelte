<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Bits UI marks an inactive panel `hidden` and leaves display to us: the
  // data-state rule below shows and hides it.
  import { Tabs as BitsTabs } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    value,
    class: className = '',
    children,
  }: {
    value: string;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<BitsTabs.Content {value}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-tabs-content {className}">
      {@render children?.()}
    </div>
  {/snippet}
</BitsTabs.Content>

<style>
  /* No focus CSS: bits-ui puts the panel in the Tab sequence and the global
     rule rings it (docs/architecture/design-system/tokens.md, "Focus and selection rings"). */
  .ds-tabs-content { display: none; }
  .ds-tabs-content[data-state='active'] { display: block; }
</style>
