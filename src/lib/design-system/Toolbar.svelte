<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A control row with roving tabindex: one Tab stop, arrow keys between items
  // (docs/architecture/design-system/patterns.md, "Composing Toolbar with overlay triggers").
  import { Toolbar as BitsToolbar } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    orientation = 'horizontal',
    loop = true,
    class: className = '',
    children,
    ...rest
  }: {
    orientation?: 'horizontal' | 'vertical';
    loop?: boolean;
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<BitsToolbar.Root {orientation} {loop}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-toolbar {className}" {...rest}>
      {@render children?.()}
    </div>
  {/snippet}
</BitsToolbar.Root>

<style>
  .ds-toolbar {
    display: flex;
    align-items: center;
  }
</style>
