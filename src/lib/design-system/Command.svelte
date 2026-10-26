<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // A cmdk-style tree with no modal chrome of its own: compose it in a Dialog.
  // This root publishes the list's id to CommandSearch and CommandList (command.ts).
  import { Command as BitsCommand } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { setCommandContext } from './command';

  let {
    value = $bindable(''),
    onValueChange,
    shouldFilter = true,
    vimBindings = true,
    loop = false,
    disableInitialScroll = false,
    ariaLabel,
    class: className = '',
    children,
  }: {
    /** The selected item's value. */
    value?: string;
    onValueChange?: (value: string) => void;
    /** False when the consumer filters itself (a server-side search). */
    shouldFilter?: boolean;
    /** ctrl+n/j/p/k navigation. */
    vimBindings?: boolean;
    /** Whether arrow navigation wraps at the list ends. */
    loop?: boolean;
    /** Don't scroll the first highlighted row into view: Bits UI scrolls every
     * ancestor, the document too, which moves the page under an inline list. */
    disableInitialScroll?: boolean;
    /** Screen-reader-only label for the command menu. */
    ariaLabel?: string;
    class?: string;
    children?: Snippet;
  } = $props();

  const uid = $props.id();
  const context = $state({ listId: `${uid}-list`, listed: false });
  setCommandContext(context);
</script>

<BitsCommand.Root
  bind:value
  {onValueChange}
  {shouldFilter}
  {vimBindings}
  {loop}
  {disableInitialScroll}
  label={ariaLabel}
>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-command {className}">
      {@render children?.()}
    </div>
  {/snippet}
</BitsCommand.Root>

<style>
  .ds-command {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
