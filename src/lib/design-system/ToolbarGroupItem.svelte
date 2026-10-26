<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Bits toggles its own value on Enter/Space without a click, so onkeydown
  // (merged before Bits' handler) runs the command; the click handler's
  // preventDefault() stops Bits' second toggle (docs/architecture/design-system/patterns.md,
  // "Composing Toolbar with overlay triggers"). The look mirrors ToolbarButton's ghost by hand.
  import { Toolbar as BitsToolbar } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { activateOnKey } from './activateOnKey';

  let {
    value,
    size = 'md',
    disabled = false,
    class: className = '',
    onclick,
    children,
    ...rest
  }: {
    value: string;
    /** As ToolbarButton's: `sm` is the in-canvas block tools' footprint. */
    size?: 'sm' | 'md';
    disabled?: boolean;
    class?: string;
    /** Runs on click and Enter/Space: the one place to invoke the command, never
     * the Group's value/onValueChange. */
    onclick?: () => void;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const onkeydown = (e: KeyboardEvent) => activateOnKey(e, onclick);
</script>

<BitsToolbar.GroupItem {value} {disabled} {onkeydown} onclick={(e: MouseEvent) => { onclick?.(); e.preventDefault(); }}>
  {#snippet child({ props, pressed }: { props: Record<string, unknown>; pressed: boolean })}
    <button {...props} class="ds-toolbar-button ds-toolbar-button-ghost ds-toolbar-button-{size} {className}" class:ds-toolbar-button-active={pressed} {...rest}>
      {@render children?.()}
    </button>
  {/snippet}
</BitsToolbar.GroupItem>

<style>
  .ds-toolbar-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    height: var(--ds-toolbar-h-md);
    min-width: var(--ds-toolbar-h-md);
    padding: 0 0.45rem;
    border: 1px solid transparent;
    border-radius: var(--ds-radius-sm);
    font: inherit;
    color: var(--ds-color-fg);
    cursor: pointer;
  }
  .ds-toolbar-button-sm { height: var(--ds-toolbar-h-sm); min-width: var(--ds-toolbar-h-sm); padding: 0; gap: 0.2rem; }
  .ds-toolbar-button-ghost { background: none; }
  .ds-toolbar-button-ghost:not([data-disabled]):hover { background: var(--ds-color-fill-hover); }
  .ds-toolbar-button[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
  .ds-toolbar-button-active { background: var(--ds-color-accent-soft); color: var(--ds-color-accent); }
  /* Keeps the active fill on hover: .ghost:hover would win on specificity. */
  .ds-toolbar-button-active:not([data-disabled]):hover { background: var(--ds-color-accent-soft); }
  .ds-toolbar-button-ghost:not([data-disabled]):active { background: var(--ds-color-fill-pressed); }
  .ds-toolbar-button-active:not([data-disabled]):active { background: var(--ds-color-accent-soft-pressed); }
</style>
