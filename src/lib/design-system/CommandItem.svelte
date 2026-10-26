<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  import { Command as BitsCommand } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    value,
    onSelect,
    disabled = false,
    class: className = '',
    children,
  }: {
    /** Unique, for filtering and selection (`${type}:${id}`). */
    value: string;
    onSelect: () => void;
    disabled?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<BitsCommand.Item {value} {onSelect} {disabled}>
  {#snippet child({ props }: { props: Record<string, unknown> })}
    <div {...props} class="ds-command-item {className}">
      {@render children?.()}
    </div>
  {/snippet}
</BitsCommand.Item>

<style>
  .ds-command-item {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    width: 100%;
    box-sizing: border-box;
    text-align: left;
    font: inherit;
    font-family: var(--ds-font-sans);
    color: var(--ds-color-fg);
    justify-content: center;
    min-height: var(--ds-target-min);
    padding: 0.5rem 0.6rem;
    border-radius: var(--ds-radius-sm);
    cursor: pointer;
  }
  /* bits-ui's data-selected is the keyboard highlight, not a chosen value. */
  .ds-command-item[data-selected] { background: var(--ds-color-fill-hover); }
  .ds-command-item[data-selected]:not([data-disabled]):active { background: var(--ds-color-fill-pressed); }
  /* Muted, not faded: its row usually says why it is disabled, and that must
     stay readable. */
  .ds-command-item[data-disabled] {
    color: var(--ds-color-muted);
    cursor: default;
  }
</style>
