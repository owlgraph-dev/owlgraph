<!--
  SPDX-License-Identifier: AGPL-3.0-only
  Copyright (C) 2026 Alexander Rensch
  This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.
-->
<script lang="ts">
  // Bits toggles its own value on Enter/Space without a click, so onkeydown
  // (merged before Bits' handler) runs the command itself; the click handler's
  // preventDefault() stops Bits' second toggle, which left the pressed state a
  // click behind (docs/architecture/design-system/patterns.md, "Composing Toolbar with overlay triggers").
  import { ToggleGroup as BitsToggleGroup } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { activateOnKey } from './activateOnKey';

  let {
    value,
    disabled = false,
    class: className = '',
    onclick,
    children,
    ...rest
  }: {
    value: string;
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

<BitsToggleGroup.Item {value} {disabled} {onkeydown} onclick={(e: MouseEvent) => { onclick?.(); e.preventDefault(); }}>
  {#snippet child({ props, pressed }: { props: Record<string, unknown>; pressed: boolean })}
    <button {...props} class="ds-segmented-item {className}" class:ds-segmented-item-active={pressed} {...rest}>
      <span class="ds-segmented-label">{@render children?.()}</span>
    </button>
  {/snippet}
</BitsToggleGroup.Item>

<style>
  /* Sizing reads SegmentedControl's custom properties; the fallbacks are md. */
  .ds-segmented-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    flex: var(--ds-seg-flex, 0 0 auto);
    min-width: var(--ds-seg-minw, var(--ds-control-h-md));
    height: var(--ds-seg-h, calc(var(--ds-control-h-md) - 2px));
    padding: var(--ds-seg-pad, 0 0.5rem);
    border: 0;
    border-right: 1px solid var(--ds-color-border);
    background: none;
    color: var(--ds-color-fg);
    cursor: pointer;
    font: inherit;
    font-weight: var(--ds-weight-medium);
    font-size: var(--ds-seg-font, var(--ds-text-md));
    white-space: nowrap;
  }
  /* A squeezed label ends in an ellipsis (a consumer's title carries it in full). */
  .ds-segmented-label { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* A block glyph: no inline baseline gap under an icon. */
  .ds-segmented-label :global(svg) { display: block; }
  .ds-segmented-item:last-child { border-right: 0; }
  .ds-segmented-item:not([data-disabled]):hover { background: var(--ds-color-accent-soft); }
  .ds-segmented-item[data-disabled] { opacity: var(--ds-opacity-disabled); cursor: default; }
  /* Recolours the focus ring like Button's primary: accent on accent is 1:1. */
  .ds-segmented-item-active { background: var(--ds-color-accent); color: var(--ds-color-on-accent); --ds-focus-ring-color: var(--ds-color-on-accent); --ds-focus-ring-offset: var(--ds-focus-ring-offset-filled); }
  /* Ties the plain :hover rule on specificity, so it must come after it, or
     the active item's light text sits on the light hover fill. */
  .ds-segmented-item-active:not([data-disabled]):hover { background: var(--ds-color-accent); }
  .ds-segmented-item:not([data-disabled]):active { background: var(--ds-color-accent-soft-pressed); }
  .ds-segmented-item-active:not([data-disabled]):active { background: var(--ds-color-accent-pressed); }
</style>
