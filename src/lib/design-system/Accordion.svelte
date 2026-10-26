<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Accordion as BitsAccordion } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    value = $bindable([]),
    onValueChange,
    class: className = '',
    children,
  }: {
    value?: string[];
    onValueChange?: (value: string[]) => void;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<BitsAccordion.Root type="multiple" bind:value {onValueChange}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-accordion {className}">
      {@render children?.()}
    </div>
  {/snippet}
</BitsAccordion.Root>

<style>
  /* Not :global(): the element is this template's own, through `child`
     (docs/architecture/design-system/primitives.md, "Styling Bits UI wrapper primitives"). */
  .ds-accordion {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-radius-md);
  }
</style>
