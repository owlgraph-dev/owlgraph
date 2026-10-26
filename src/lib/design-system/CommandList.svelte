<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // The listbox (named: Bits UI's default is an English placeholder) and the
  // viewport Bits UI reads the highlighted option from. No height or overflow:
  // what scrolls is the host's decision.
  import { Command as BitsCommand } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { getCommandContext } from './command';

  let {
    ariaLabel,
    class: className = '',
    children,
  }: {
    /** The listbox's translated accessible name. */
    ariaLabel: string;
    class?: string;
    children?: Snippet;
  } = $props();

  const command = getCommandContext();
  $effect(() => {
    if (!command) return;
    command.listed = true;
    return () => {
      command.listed = false;
    };
  });
</script>

<BitsCommand.List id={command?.listId} aria-label={ariaLabel}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-command-list {className}">
      <BitsCommand.Viewport>
        {#snippet child({ props: viewportProps }: { props: Record<string, unknown> })}
          <div {...viewportProps} class="ds-command-viewport">
            {@render children?.()}
          </div>
        {/snippet}
      </BitsCommand.Viewport>
    </div>
  {/snippet}
</BitsCommand.List>

<style>
  .ds-command-list,
  .ds-command-viewport {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
</style>
