<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // An in-page panel swap (`bind:value`), or route navigation: `value` from the
  // route, triggers with `href`, one TabsContent. Navigation wants
  // activationMode="manual", or arrowing across the tabs navigates on each.
  import { Tabs as BitsTabs } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    value = $bindable(''),
    onValueChange,
    activationMode = 'automatic',
    ariaLabel,
    class: className = '',
    tabs,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    activationMode?: 'automatic' | 'manual';
    ariaLabel?: string;
    class?: string;
    /** The TabsTrigger items, rendered inside the tablist. */
    tabs: Snippet;
    /** Rendered after the tablist — TabsContent panels. */
    children?: Snippet;
  } = $props();
</script>

<BitsTabs.Root bind:value {onValueChange} {activationMode}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-tabs {className}">
      <div class="ds-tabs-list-scroll scroll-cue">
        <BitsTabs.List>
          {#snippet child({ props: listProps }: { props: Record<string, unknown> })}
            <div {...listProps} class="ds-tabs-list" aria-label={ariaLabel}>
              {@render tabs()}
            </div>
          {/snippet}
        </BitsTabs.List>
      </div>
      {@render children?.()}
    </div>
  {/snippet}
</BitsTabs.Root>

<style>
  /* Not a flex column: a flex item's `min-width: auto` would size the panel to
     a Table's min-content and overflow the page. */
  .ds-tabs { display: block; }
  /* The divider is on the list, inside the scroll box: a tab overlaps it by
     1px, which on the wrapper would force a vertical scrollbar. */
  .ds-tabs-list-scroll {
    overflow-x: auto;
    overflow-y: hidden;
  }
  .ds-tabs-list {
    display: flex;
    gap: 0.25rem;
    min-width: max-content;
    border-bottom: 1px solid var(--ds-color-border);
  }
</style>
